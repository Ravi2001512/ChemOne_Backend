import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "main",
      unique: true,
    },
    monthlyFee: {
      type: Number,
      min: 0,
    },
    classFees: {
      theory: { type: Number, min: 0.01 },
      revision: { type: Number, min: 0.01 },
      paper: { type: Number, min: 0.01 },
    },
    bankDetails: {
      bankName: { type: String, required: true, trim: true },
      branch: { type: String, required: true, trim: true },
      accountName: { type: String, required: true, trim: true },
      accountNumber: { type: String, required: true, trim: true },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

export default mongoose.model("PaymentSettings", paymentSettingsSchema);
