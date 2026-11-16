import { randomBytes } from "crypto";
import Payment from "../models/Payment.js";
import PaymentSettings from "../models/PaymentSettings.js";
import User from "../models/User.js";
import { paymentSlipsBucket } from "../config/gcs.js";

const CLASS_TYPES = ["theory", "revision", "paper"];

const getDefaultMonthlyFee = () => {
  const fee = Number(process.env.CLASS_FEE_LKR || 2500);
  return Number.isFinite(fee) && fee > 0 ? fee : 2500;
};

const getClassFees = (settings) => {
  const legacyFee = Number(settings.monthlyFee) || getDefaultMonthlyFee();
  return Object.fromEntries(
    CLASS_TYPES.map((classType) => [
      classType,
      Number(settings.classFees?.[classType]) || legacyFee,
    ])
  );
};

const getPaymentClassTypes = (payment) =>
  payment.classTypes?.length ? payment.classTypes : CLASS_TYPES;

const getPaymentSettings = async () => {
  const existing = await PaymentSettings.findOne({ key: "main" });
  if (existing) return existing;

  try {
    return await PaymentSettings.create({
      key: "main",
      monthlyFee: getDefaultMonthlyFee(),
      classFees: Object.fromEntries(
        CLASS_TYPES.map((classType) => [classType, getDefaultMonthlyFee()])
      ),
      bankDetails: {
        bankName: "Bank of Ceylon",
        branch: "Galle Branch",
        accountName: "ChemBridge Academy",
        accountNumber: "0012 3456 7890",
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return PaymentSettings.findOne({ key: "main" });
    }
    throw error;
  }
};

const isValidMonths = (months) => {
  if (
    !Array.isArray(months) ||
    months.length === 0 ||
    months.length > 12 ||
    months.some(
      (month) =>
        typeof month !== "string" ||
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    ) ||
    new Set(months).size !== months.length
  ) {
    return false;
  }

  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return months.every((month) => month <= currentPeriod);
};

const getSlipExtension = (file) => {
  const { buffer, mimetype } = file;
  const signatures = {
    "application/pdf":
      buffer.subarray(0, 5).toString("ascii") === "%PDF-",
    "image/jpeg":
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    "image/png": buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/webp":
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP",
  };
  const extensions = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return signatures[mimetype] ? extensions[mimetype] : null;
};

export const getPaymentConfig = async (req, res) => {
  try {
    const [settings, paidPayments, pendingPayments, rejectedPayments] = await Promise.all([
      getPaymentSettings(),
      req.user.role === "student"
        ? Payment.find({ student: req.user.id, status: "paid" })
            .select("months classTypes")
            .lean()
        : Promise.resolve([]),
      req.user.role === "student"
        ? Payment.find({
            student: req.user.id,
            source: "bank_transfer",
            status: "pending",
          })
            .select("months classTypes")
            .lean()
        : Promise.resolve([]),
      req.user.role === "student"
        ? Payment.find({
            student: req.user.id,
            source: "bank_transfer",
            status: "rejected",
          })
            .select("months classTypes")
            .lean()
        : Promise.resolve([]),
    ]);

    res.json({
      classFees: getClassFees(settings),
      bankDetails: settings.bankDetails,
      currency: "LKR",
      paymentSlipStorageEnabled: Boolean(paymentSlipsBucket),
      paidMonths: [...new Set(paidPayments.flatMap((payment) => payment.months))],
      pendingMonths: [...new Set(pendingPayments.flatMap((payment) => payment.months))],
      rejectedMonths: [...new Set(rejectedPayments.flatMap((payment) => payment.months))],
      paidClassMonths: paidPayments.map((payment) => ({
        months: payment.months,
        classTypes: getPaymentClassTypes(payment),
      })),
      pendingClassMonths: pendingPayments.map((payment) => ({
        months: payment.months,
        classTypes: getPaymentClassTypes(payment),
      })),
      rejectedClassMonths: rejectedPayments.map((payment) => ({
        months: payment.months,
        classTypes: getPaymentClassTypes(payment),
      })),
    });
  } catch (error) {
    console.error("Get payment settings error:", error);
    res.status(500).json({ message: "Unable to load payment settings." });
  }
};

export const updatePaymentSettings = async (req, res) => {
  try {
    const { classFees, bankDetails } = req.body;
    const fields = ["bankName", "branch", "accountName", "accountNumber"];
    const parsedFees = Object.fromEntries(
      CLASS_TYPES.map((classType) => [classType, Number(classFees?.[classType])])
    );
    if (
      CLASS_TYPES.some(
        (classType) =>
          !Number.isFinite(parsedFees[classType]) ||
          parsedFees[classType] < 0.01 ||
          parsedFees[classType] > 10000000
      )
    ) {
      return res.status(400).json({
        message: "Enter a valid fee for each class option.",
      });
    }
    if (
      !bankDetails ||
      fields.some(
        (field) =>
          typeof bankDetails[field] !== "string" ||
          !bankDetails[field].trim() ||
          bankDetails[field].trim().length > 100
      )
    ) {
      return res.status(400).json({
        message: "Complete all bank account details before saving.",
      });
    }

    const settings = await PaymentSettings.findOneAndUpdate(
      { key: "main" },
      {
        $set: {
          classFees: Object.fromEntries(
            CLASS_TYPES.map((classType) => [
              classType,
              Math.round(parsedFees[classType] * 100) / 100,
            ])
          ),
          monthlyFee: Math.round(parsedFees.theory * 100) / 100,
          bankDetails: Object.fromEntries(
            fields.map((field) => [field, bankDetails[field].trim()])
          ),
          updatedBy: req.user.id,
        },
        $setOnInsert: { key: "main" },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.json({
      message: "Payment settings updated successfully.",
      classFees: getClassFees(settings),
      bankDetails: settings.bankDetails,
    });
  } catch (error) {
    console.error("Update payment settings error:", error);
    res.status(500).json({ message: "Unable to update payment settings." });
  }
};

export const submitPaymentSlip = async (req, res) => {
  let uploadedObject;
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Upload a payment slip to continue." });
    }
    if (!paymentSlipsBucket) {
      return res.status(503).json({
        message: "Payment slip storage is not configured. Please contact the academy.",
      });
    }

    const user = await User.findById(req.user.id).select("-password");
    if (!user || user.role !== "student") {
      return res.status(403).json({ message: "Only students can upload payment slips." });
    }

    const studentName =
      typeof req.body.studentName === "string"
        ? req.body.studentName.trim().replace(/\s+/g, " ")
        : "";
    const indexNumber =
      typeof req.body.indexNumber === "string" ? req.body.indexNumber.trim() : "";
    if (
      !studentName ||
      studentName.length > 100 ||
      studentName.toLocaleLowerCase() !== user.name.trim().replace(/\s+/g, " ").toLocaleLowerCase() ||
      !indexNumber ||
      indexNumber.toUpperCase() !== user.indexNumber?.toUpperCase()
    ) {
      return res.status(400).json({
        message: "Enter the student name and index number registered to your account.",
      });
    }

    let months;
    try {
      months = JSON.parse(req.body.months);
    } catch {
      return res.status(400).json({ message: "Select valid months to pay for." });
    }
    let classTypes;
    try {
      classTypes = JSON.parse(req.body.classTypes);
    } catch {
      return res.status(400).json({ message: "Select valid class options to pay for." });
    }
    if (
      !Array.isArray(classTypes) ||
      classTypes.length === 0 ||
      classTypes.some((classType) => !CLASS_TYPES.includes(classType)) ||
      new Set(classTypes).size !== classTypes.length
    ) {
      return res.status(400).json({ message: "Select one or more valid class options." });
    }
    if (!isValidMonths(months)) {
      return res.status(400).json({ message: "Select valid unpaid months to pay for." });
    }

    const [settings, paidPayments, pendingPayments] = await Promise.all([
      getPaymentSettings(),
      Payment.find({
        student: user._id,
        status: "paid",
        months: { $in: months },
      })
        .select("months classTypes")
        .lean(),
      Payment.find({
        student: user._id,
        source: "bank_transfer",
        status: "pending",
        months: { $in: months },
      })
        .select("months classTypes")
        .lean(),
    ]);
    const hasOverlap = (payment) =>
      payment.months.some((month) => months.includes(month)) &&
      getPaymentClassTypes(payment).some((classType) => classTypes.includes(classType));
    if (paidPayments.some(hasOverlap)) {
      return res.status(409).json({
        message: "One or more selected classes are already paid for a selected month.",
      });
    }
    if (pendingPayments.some(hasOverlap)) {
      return res.status(409).json({
        message: "A payment slip for one or more selected classes is already awaiting review.",
      });
    }

    const extension = getSlipExtension(req.file);
    if (!extension) {
      return res.status(400).json({
        message: "The uploaded file is not a valid JPG, PNG, WebP, or PDF.",
      });
    }

    const orderId = `SLIP-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`;
    uploadedObject = `payment-slips/${user._id}/${orderId}.${extension}`;
    await paymentSlipsBucket.file(uploadedObject).save(req.file.buffer, {
      resumable: false,
      metadata: {
        contentType: req.file.mimetype,
        contentDisposition: `attachment; filename="payment-slip.${extension}"`,
        cacheControl: "private, no-store",
      },
    });

    const payment = await Payment.create({
      orderId,
      student: user._id,
      months,
      classTypes,
      amount:
        Math.round(
          months.length *
            classTypes.reduce((total, classType) => total + getClassFees(settings)[classType], 0) *
            100
        ) / 100,
      source: "bank_transfer",
      status: "pending",
      studentName,
      indexNumber,
      slipObjectName: uploadedObject,
      slipMimeType: req.file.mimetype,
    });

    res.status(201).json({
      message: "Payment slip uploaded. It is awaiting admin verification.",
      payment: {
        id: payment._id,
        months: payment.months,
        classTypes: payment.classTypes,
        amount: payment.amount,
        status: payment.status,
      },
    });
  } catch (error) {
    if (uploadedObject) {
      try {
        await paymentSlipsBucket.file(uploadedObject).delete();
      } catch (cleanupError) {
        console.error("Failed to remove orphaned payment slip:", cleanupError);
      }
    }
    console.error("Submit payment slip error:", error);
    res.status(500).json({ message: "Unable to submit the payment slip. Please try again." });
  }
};

export const getPaymentSlips = async (req, res) => {
  try {
    const allowedStatuses = ["pending", "paid", "rejected"];
    const status = req.query.status || "pending";
    if (status !== "all" && !allowedStatuses.includes(status)) {
      return res.status(400).json({ message: "Select a valid payment status." });
    }

    const query = { source: "bank_transfer" };
    if (status !== "all") query.status = status;

    const payments = await Payment.find(query)
      .populate("student", "name indexNumber")
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(
      payments.map((payment) => ({
        id: payment._id,
        orderId: payment.orderId,
        studentId: payment.student?._id,
        studentName: payment.studentName,
        indexNumber: payment.indexNumber,
        months: payment.months,
        classTypes: getPaymentClassTypes(payment),
        amount: payment.amount,
        status: payment.status,
        slipMimeType: payment.slipMimeType,
        reviewNote: payment.reviewNote || "",
        createdAt: payment.createdAt,
        reviewedAt: payment.reviewedAt,
      }))
    );
  } catch (error) {
    console.error("Get payment slips error:", error);
    res.status(500).json({ message: "Unable to load payment slip submissions." });
  }
};

export const getPaymentSlipUrl = async (req, res) => {
  try {
    if (!paymentSlipsBucket) {
      return res.status(503).json({
        message: "Private payment slip storage is not configured.",
      });
    }

    const payment = await Payment.findOne({
      _id: req.params.id,
      source: "bank_transfer",
    }).select("slipObjectName");
    if (!payment) {
      return res.status(404).json({ message: "Payment slip not found." });
    }

    const [url] = await paymentSlipsBucket.file(payment.slipObjectName).getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 5 * 60 * 1000,
      responseDisposition: "inline",
    });
    res.json({ url });
  } catch (error) {
    console.error("Get payment slip URL error:", error);
    res.status(500).json({ message: "Unable to open the payment slip." });
  }
};

export const deletePaymentSlip = async (req, res) => {
  try {
    if (!paymentSlipsBucket) {
      return res.status(503).json({
        message: "Private payment slip storage is not configured.",
      });
    }

    const payment = await Payment.findOne({
      _id: req.params.id,
      source: "bank_transfer",
    }).select("slipObjectName");
    if (!payment) {
      return res.status(404).json({ message: "Payment slip not found." });
    }

    await paymentSlipsBucket.file(payment.slipObjectName).delete({
      ignoreNotFound: true,
    });
    const result = await Payment.deleteOne({
      _id: payment._id,
      source: "bank_transfer",
    });
    if (result.deletedCount !== 1) {
      return res.status(404).json({ message: "Payment slip not found." });
    }

    res.json({
      message: "Payment slip and payment record deleted.",
      paymentId: payment._id,
    });
  } catch (error) {
    console.error("Delete payment slip error:", error);
    res.status(500).json({ message: "Unable to delete the payment slip." });
  }
};

export const reviewPaymentSlip = async (req, res) => {
  try {
    const { decision, reviewNote = "" } = req.body;
    if (
      !["approve", "reject"].includes(decision) ||
      typeof reviewNote !== "string" ||
      reviewNote.trim().length > 500
    ) {
      return res.status(400).json({ message: "Provide a valid review decision and note." });
    }

    const payment = await Payment.findOneAndUpdate(
      {
        _id: req.params.id,
        source: "bank_transfer",
        status: "pending",
      },
      {
        $set: {
          status: decision === "approve" ? "paid" : "rejected",
          reviewNote: reviewNote.trim(),
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!payment) {
      return res.status(404).json({
        message: "Pending payment slip not found. It may already have been reviewed.",
      });
    }

    res.json({
      message: decision === "approve" ? "Payment approved." : "Payment slip rejected.",
      payment: {
        id: payment._id,
        status: payment.status,
        months: payment.months,
      },
    });
  } catch (error) {
    console.error("Review payment slip error:", error);
    res.status(500).json({ message: "Unable to review the payment slip." });
  }
};
