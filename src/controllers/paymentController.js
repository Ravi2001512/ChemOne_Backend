import { createHash, randomBytes, timingSafeEqual } from "crypto";
import Payment from "../models/Payment.js";
import PaymentSettings from "../models/PaymentSettings.js";
import User from "../models/User.js";

const getDefaultMonthlyFee = () => {
  const fee = Number(process.env.CLASS_FEE_LKR || 2500);
  return Number.isFinite(fee) && fee > 0 ? fee : 2500;
};

const getPaymentSettings = async () => {
  const existing = await PaymentSettings.findOne({ key: "main" });
  if (existing) return existing;

  try {
    return await PaymentSettings.create({
      key: "main",
      monthlyFee: getDefaultMonthlyFee(),
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

const isConfigured = () => {
  try {
    const frontendUrl = new URL(process.env.FRONTEND_URL);
    const backendUrl = new URL(process.env.BACKEND_URL);
    const usesLiveMode = process.env.PAYHERE_MODE === "live";
    return Boolean(
      process.env.PAYHERE_MERCHANT_ID &&
        process.env.PAYHERE_MERCHANT_SECRET &&
        ["http:", "https:"].includes(frontendUrl.protocol) &&
        ["http:", "https:"].includes(backendUrl.protocol) &&
        (!usesLiveMode ||
          (frontendUrl.protocol === "https:" && backendUrl.protocol === "https:"))
    );
  } catch {
    return false;
  }
};

const md5 = (value) => createHash("md5").update(value).digest("hex").toUpperCase();

const getReturnUrl = (outcome, orderId) => {
  const url = new URL("/student/online-payments", process.env.FRONTEND_URL);
  url.searchParams.set("payment", outcome);
  url.searchParams.set("order_id", orderId);
  return url.toString();
};

export const getPaymentConfig = async (req, res) => {
  try {
    const [settings, paidPayments] = await Promise.all([
      getPaymentSettings(),
      req.user.role === "student"
        ? Payment.find({ student: req.user.id, status: "paid" })
            .select("months")
            .lean()
        : Promise.resolve([]),
    ]);

    res.json({
      onlinePaymentsEnabled: isConfigured(),
      monthlyFee: settings.monthlyFee,
      bankDetails: settings.bankDetails,
      currency: "LKR",
      paidMonths: [...new Set(paidPayments.flatMap((payment) => payment.months))],
    });
  } catch (error) {
    console.error("Get payment settings error:", error);
    res.status(500).json({ message: "Unable to load payment settings." });
  }
};

export const updatePaymentSettings = async (req, res) => {
  try {
    const { monthlyFee, bankDetails } = req.body;
    const fee = Number(monthlyFee);
    const fields = ["bankName", "branch", "accountName", "accountNumber"];
    if (
      !Number.isFinite(fee) ||
      fee < 0.01 ||
      fee > 10000000 ||
      !bankDetails ||
      fields.some(
        (field) =>
          typeof bankDetails[field] !== "string" ||
          !bankDetails[field].trim() ||
          bankDetails[field].trim().length > 100
      )
    ) {
      return res.status(400).json({
        message: "Enter a valid fee and complete bank account details.",
      });
    }

    const settings = await PaymentSettings.findOneAndUpdate(
      { key: "main" },
      {
        $set: {
          monthlyFee: Math.round(fee * 100) / 100,
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
      monthlyFee: settings.monthlyFee,
      bankDetails: settings.bankDetails,
    });
  } catch (error) {
    console.error("Update payment settings error:", error);
    res.status(500).json({ message: "Unable to update payment settings." });
  }
};

export const createPayHereCheckout = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        message:
          "Online payments are not configured yet. Please contact the academy or use the bank transfer details.",
      });
    }

    const user = await User.findById(req.user.id).select("-password");
    if (!user || user.role !== "student") {
      return res.status(403).json({ message: "Only students can make payments." });
    }

    const { months, phone, address, city } = req.body;
    const settings = await getPaymentSettings();
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
      return res.status(400).json({ message: "Select valid months to pay for." });
    }

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (months.some((month) => month > currentPeriod)) {
      return res.status(400).json({ message: "Future months cannot be paid yet." });
    }

    const paidPayments = await Payment.find({
      student: user._id,
      status: "paid",
      months: { $in: months },
    })
      .select("months")
      .lean();
    const paidMonths = new Set(paidPayments.flatMap((payment) => payment.months));
    if (months.some((month) => paidMonths.has(month))) {
      return res.status(409).json({
        message: "One or more selected months are already marked as paid. Refresh and try again.",
      });
    }

    const recentPendingPayment = await Payment.findOne({
      student: user._id,
      status: "pending",
      months: { $in: months },
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
    }).lean();
    if (recentPendingPayment) {
      return res.status(409).json({
        message: "A checkout for one or more selected months is already in progress.",
      });
    }

    const customerPhone = typeof phone === "string" ? phone.trim() : "";
    const customerAddress = typeof address === "string" ? address.trim() : "";
    const customerCity = typeof city === "string" ? city.trim() : "";
    if (
      !/^[+()\d\s-]{7,20}$/.test(customerPhone) ||
      customerAddress.length < 3 ||
      customerAddress.length > 100 ||
      customerCity.length < 2 ||
      customerCity.length > 50
    ) {
      return res.status(400).json({
        message: "Enter a valid phone number, address, and city to continue.",
      });
    }

    const orderId = `CB${Date.now()}${randomBytes(4).toString("hex").toUpperCase()}`;
    const amount = months.length * settings.monthlyFee;
    await Payment.create({
      orderId,
      student: user._id,
      months,
      amount,
      currency: "LKR",
    });

    const [firstName, ...lastNameParts] = user.name.trim().split(/\s+/);
    const lastName = lastNameParts.join(" ") || firstName;
    const formattedAmount = amount.toFixed(2);
    const merchantId = process.env.PAYHERE_MERCHANT_ID;
    const hashedSecret = md5(process.env.PAYHERE_MERCHANT_SECRET);
    const hash = md5(
      `${merchantId}${orderId}${formattedAmount}LKR${hashedSecret}`
    );
    const backendUrl = new URL(process.env.BACKEND_URL);

    res.json({
      checkoutUrl:
        process.env.PAYHERE_MODE === "live"
          ? "https://www.payhere.lk/pay/checkout"
          : "https://sandbox.payhere.lk/pay/checkout",
      fields: {
        merchant_id: merchantId,
        return_url: getReturnUrl("return", orderId),
        cancel_url: getReturnUrl("cancelled", orderId),
        notify_url: new URL("/api/payments/payhere/notify", backendUrl).toString(),
        first_name: firstName,
        last_name: lastName,
        email: user.email,
        phone: customerPhone,
        address: customerAddress,
        city: customerCity,
        country: "Sri Lanka",
        order_id: orderId,
        items: `Class fees: ${months.join(", ")}`,
        currency: "LKR",
        amount: formattedAmount,
        hash,
      },
    });
  } catch (error) {
    console.error("Create PayHere checkout error:", error);
    res.status(500).json({ message: "Unable to start checkout. Please try again." });
  }
};

export const handlePayHereNotification = async (req, res) => {
  try {
    const {
      merchant_id: merchantId,
      order_id: orderId,
      payhere_amount: amount,
      payhere_currency: currency,
      status_code: statusCode,
      md5sig,
      payment_id: gatewayPaymentId,
      method,
    } = req.body;

    if (
      !isConfigured() ||
      merchantId !== process.env.PAYHERE_MERCHANT_ID ||
      !orderId ||
      !amount ||
      !currency ||
      !statusCode ||
      !md5sig
    ) {
      return res.status(400).send("Invalid payment notification");
    }

    const expectedSignature = md5(
      `${merchantId}${orderId}${amount}${currency}${statusCode}${md5(
        process.env.PAYHERE_MERCHANT_SECRET
      )}`
    );
    const receivedSignature = String(md5sig).toUpperCase();
    if (
      !/^[A-F0-9]{32}$/.test(receivedSignature) ||
      !timingSafeEqual(
        Buffer.from(expectedSignature, "ascii"),
        Buffer.from(receivedSignature, "ascii")
      )
    ) {
      return res.status(400).send("Invalid payment signature");
    }

    const payment = await Payment.findOne({ orderId });
    if (
      !payment ||
      currency !== payment.currency ||
      !Number.isFinite(Number(amount)) ||
      Number(amount).toFixed(2) !== payment.amount.toFixed(2)
    ) {
      return res.status(400).send("Payment does not match order");
    }

    if (statusCode === "2") {
      if (payment.status !== "paid") {
        payment.status = "paid";
        payment.gatewayPaymentId = gatewayPaymentId;
        payment.paymentMethod = method;
        await payment.save();
      }
    } else if (statusCode === "-3") {
      payment.status = "chargeback";
      payment.gatewayPaymentId = gatewayPaymentId;
      payment.paymentMethod = method;
      await payment.save();
    } else if (payment.status === "pending") {
      payment.status =
        statusCode === "0" ? "pending" : "failed";
      payment.gatewayPaymentId = gatewayPaymentId;
      payment.paymentMethod = method;
      await payment.save();
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("PayHere notification error:", error);
    res.status(500).send("Unable to process payment notification");
  }
};

export const getPaymentStatus = async (req, res) => {
  try {
    const payment = await Payment.findOne({
      orderId: req.params.orderId,
      student: req.user.id,
    }).select("orderId months amount currency status");

    if (!payment) {
      return res.status(404).json({ message: "Payment order not found." });
    }

    res.json(payment);
  } catch (error) {
    console.error("Get payment status error:", error);
    res.status(500).json({ message: "Unable to check payment status." });
  }
};

export const cancelPayment = async (req, res) => {
  try {
    const payment = await Payment.findOneAndUpdate(
      {
        orderId: req.params.orderId,
        student: req.user.id,
        status: "pending",
      },
      { $set: { status: "failed" } },
      { new: true }
    ).select("orderId status");

    if (!payment) {
      return res.status(404).json({ message: "Pending payment order not found." });
    }

    res.json({ status: payment.status });
  } catch (error) {
    console.error("Cancel payment error:", error);
    res.status(500).json({ message: "Unable to cancel payment order." });
  }
};
