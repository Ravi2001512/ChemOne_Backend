import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    months: {
      type: [String],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: "LKR",
      enum: ["LKR"],
    },
    status: {
      type: String,
      enum: ["pending", "paid", "failed", "chargeback"],
      default: "pending",
      index: true,
    },
    gatewayPaymentId: String,
    paymentMethod: String,
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
