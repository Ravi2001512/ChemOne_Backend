import mongoose from "mongoose";

const liveClassSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    youtubeUrl: {
      type: String,
      required: true,
      trim: true,
    },
    videoId: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    batch: {
      type: String,
      default: "All",
    },
    unit: {
      type: String,
      default: "General Chemistry",
    },
    status: {
      type: String,
      enum: ["live", "scheduled", "ended"],
      default: "scheduled",
    },
    scheduledAt: {
      type: Date,
      default: Date.now,
    },
    materialsUrl: {
      type: String,
      default: "",
    },
    allowChat: {
      type: Boolean,
      default: true,
    },
    isRestricted: {
      type: Boolean,
      default: false,
    },
    allowedStudents: [
      {
        type: String,
        trim: true,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

export default mongoose.model("LiveClass", liveClassSchema);
