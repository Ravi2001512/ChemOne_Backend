import mongoose from "mongoose";

const liveClassSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    platform: {
      type: String,
      enum: ["youtube", "zoom"],
      default: "youtube",
    },
    youtubeUrl: {
      type: String,
      default: "",
      trim: true,
    },
    meetingUrl: {
      type: String,
      default: "",
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
    maxViewsPerStudent: {
      type: Number,
      default: 3,
    },
    studentViews: [
      {
        indexNumber: {
          type: String,
          trim: true,
        },
        studentId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        count: {
          type: Number,
          default: 0,
        },
        lastViewedAt: {
          type: Date,
          default: Date.now,
        },
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
