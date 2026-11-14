import express from "express";
import { adminOnly, protect } from "../middleware/authMiddleware.js";
import {
  createPayHereCheckout,
  cancelPayment,
  getPaymentConfig,
  getPaymentStatus,
  handlePayHereNotification,
  updatePaymentSettings,
} from "../controllers/paymentController.js";

const router = express.Router();

router.get("/config", protect, getPaymentConfig);
router.post("/checkout", protect, createPayHereCheckout);
router.put("/settings", protect, adminOnly, updatePaymentSettings);
router.post("/payhere/notify", handlePayHereNotification);
router.post("/:orderId/cancel", protect, cancelPayment);
router.get("/:orderId/status", protect, getPaymentStatus);

export default router;
