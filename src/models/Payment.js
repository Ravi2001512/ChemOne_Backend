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
    source: {
      type: String,
      enum: ["bank_transfer"],
      default: "bank_transfer",
    },
    status: {
      type: String,
      enum: ["pending", "paid", "rejected"],
      default: "pending",
      index: true,
    },
    studentName: {
      type: String,
      required: true,
      trim: true,
    },
    indexNumber: {
      type: String,
      required: true,
      trim: true,
    },
    slipObjectName: {
      type: String,
      required: true,
    },
    slipMimeType: {
      type: String,
      required: true,
    },
    reviewNote: {
      type: String,
      maxlength: 500,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Payment", paymentSchema);
