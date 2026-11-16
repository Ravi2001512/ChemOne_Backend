import express from "express";
import multer from "multer";
import { adminOnly, protect } from "../middleware/authMiddleware.js";
import {
  getPaymentConfig,
  getPaymentSlipUrl,
  getPaymentSlips,
  deletePaymentSlip,
  reviewPaymentSlip,
  submitPaymentSlip,
  updatePaymentSettings,
} from "../controllers/paymentController.js";

const router = express.Router();
const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!allowedTypes.includes(file.mimetype)) {
      callback(new Error("Upload a JPG, PNG, WebP, or PDF payment slip."));
      return;
    }
    callback(null, true);
  },
});

const parsePaymentSlip = (req, res, next) => {
  upload.single("slip")(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Payment slip must be 5MB or smaller."
          : "Unable to upload the selected payment slip.";
      return res.status(400).json({ message });
    }
    if (error) {
      return res.status(400).json({ message: error.message });
    }
    next();
  });
};

const studentOnly = (req, res, next) => {
  if (req.user?.role !== "student") {
    return res.status(403).json({ message: "Only students can upload payment slips." });
  }
  next();
};

router.get("/config", protect, getPaymentConfig);
router.put("/settings", protect, adminOnly, updatePaymentSettings);
router.post("/slips", protect, studentOnly, parsePaymentSlip, submitPaymentSlip);
router.get("/admin/slips", protect, adminOnly, getPaymentSlips);
router.get("/admin/slips/:id/file", protect, adminOnly, getPaymentSlipUrl);
router.delete("/admin/slips/:id", protect, adminOnly, deletePaymentSlip);
router.patch("/admin/slips/:id/review", protect, adminOnly, reviewPaymentSlip);

export default router;
