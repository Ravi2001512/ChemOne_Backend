import mongoose from "mongoose";

const scanSessionSchema = new mongoose.Schema(
  {
    activeStudent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    history: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("ScanSession", scanSessionSchema);
