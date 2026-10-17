import express from "express";
import LiveClass from "../models/LiveClass.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Helper to extract YouTube video ID from various link formats
const extractYoutubeId = (url) => {
  if (!url) return "";
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|live\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : url.length === 11 ? url : "";
};

// GET /api/live-classes - Get all live classes
router.get("/", async (req, res) => {
  try {
    const { batch, status } = req.query;
    const filter = {};
    if (batch && batch !== "All") {
      filter.$or = [{ batch: "All" }, { batch }];
    }
    if (status) {
      filter.status = status;
    }
    const liveClasses = await LiveClass.find(filter).sort({ scheduledAt: -1, createdAt: -1 });
    res.json(liveClasses);
  } catch (error) {
    console.error("Error fetching live classes:", error);
    res.status(500).json({ message: "Failed to fetch live classes", error: error.message });
  }
});

// GET /api/live-classes/active - Get currently live stream
router.get("/active", async (req, res) => {
  try {
    const activeStream = await LiveClass.findOne({ status: "live" }).sort({ updatedAt: -1 });
    res.json(activeStream || null);
  } catch (error) {
    console.error("Error fetching active live class:", error);
    res.status(500).json({ message: "Failed to fetch active live class" });
  }
});

// GET /api/live-classes/:id - Get single live class
router.get("/:id", async (req, res) => {
  try {
    const liveClass = await LiveClass.findById(req.params.id);
    if (!liveClass) {
      return res.status(404).json({ message: "Live class not found" });
    }
    res.json(liveClass);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch live class", error: error.message });
  }
});

// POST /api/live-classes - Create live class (Admin only)
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const {
      title,
      youtubeUrl,
      description,
      batch,
      unit,
      status,
      scheduledAt,
      materialsUrl,
      allowChat,
      isRestricted,
      allowedStudents,
    } = req.body;
    
    if (!title || !youtubeUrl) {
      return res.status(400).json({ message: "Title and YouTube URL are required" });
    }

    const videoId = extractYoutubeId(youtubeUrl);

    // If setting to live, optionally mark other streams as ended
    if (status === "live") {
      await LiveClass.updateMany({ status: "live" }, { status: "ended" });
    }

    const liveClass = new LiveClass({
      title,
      youtubeUrl,
      videoId,
      description: description || "",
      batch: batch || "All",
      unit: unit || "General Chemistry",
      status: status || "scheduled",
      scheduledAt: scheduledAt || new Date(),
      materialsUrl: materialsUrl || "",
      allowChat: allowChat !== undefined ? allowChat : true,
      isRestricted: isRestricted === true || isRestricted === "true",
      allowedStudents: Array.isArray(allowedStudents)
        ? allowedStudents.map((s) => String(s).trim()).filter(Boolean)
        : [],
      createdBy: req.user?.id,
    });

    const saved = await liveClass.save();
    res.status(201).json(saved);
  } catch (error) {
    console.error("Error creating live class:", error);
    res.status(500).json({ message: "Failed to create live class", error: error.message });
  }
});

// PUT /api/live-classes/:id - Update live class (Admin only)
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    const {
      title,
      youtubeUrl,
      description,
      batch,
      unit,
      status,
      scheduledAt,
      materialsUrl,
      allowChat,
      isRestricted,
      allowedStudents,
    } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title;
    if (youtubeUrl) {
      updateData.youtubeUrl = youtubeUrl;
      updateData.videoId = extractYoutubeId(youtubeUrl);
    }
    if (description !== undefined) updateData.description = description;
    if (batch) updateData.batch = batch;
    if (unit) updateData.unit = unit;
    if (status) {
      updateData.status = status;
      if (status === "live") {
        await LiveClass.updateMany({ _id: { $ne: req.params.id }, status: "live" }, { status: "ended" });
      }
    }
    if (scheduledAt) updateData.scheduledAt = scheduledAt;
    if (materialsUrl !== undefined) updateData.materialsUrl = materialsUrl;
    if (allowChat !== undefined) updateData.allowChat = allowChat;
    if (isRestricted !== undefined) {
      updateData.isRestricted = isRestricted === true || isRestricted === "true";
    }
    if (allowedStudents !== undefined) {
      updateData.allowedStudents = Array.isArray(allowedStudents)
        ? allowedStudents.map((s) => String(s).trim()).filter(Boolean)
        : [];
    }

    const updated = await LiveClass.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' });
    if (!updated) {
      return res.status(404).json({ message: "Live class not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating live class:", error);
    res.status(500).json({ message: "Failed to update live class", error: error.message });
  }
});

// PATCH /api/live-classes/:id/access - Update access limit and allowed students (Admin only)
router.patch("/:id/access", protect, adminOnly, async (req, res) => {
  try {
    const { isRestricted, allowedStudents } = req.body;
    const updateData = {};

    if (isRestricted !== undefined) {
      updateData.isRestricted = isRestricted === true || isRestricted === "true";
    }
    if (allowedStudents !== undefined) {
      updateData.allowedStudents = Array.isArray(allowedStudents)
        ? allowedStudents.map((s) => String(s).trim()).filter(Boolean)
        : [];
    }

    const updated = await LiveClass.findByIdAndUpdate(req.params.id, updateData, { returnDocument: 'after' });
    if (!updated) {
      return res.status(404).json({ message: "Live class not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("Error updating access limit:", error);
    res.status(500).json({ message: "Failed to update access limit", error: error.message });
  }
});

// PATCH /api/live-classes/:id/status - Update live status only (Admin only)
router.patch("/:id/status", protect, adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["live", "scheduled", "ended"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (status === "live") {
      await LiveClass.updateMany({ _id: { $ne: req.params.id }, status: "live" }, { status: "ended" });
    }

    const updated = await LiveClass.findByIdAndUpdate(req.params.id, { status }, { returnDocument: 'after' });
    if (!updated) {
      return res.status(404).json({ message: "Live class not found" });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to update status", error: error.message });
  }
});

// DELETE /api/live-classes/:id - Delete live class (Admin only)
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    const deleted = await LiveClass.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Live class not found" });
    }
    res.json({ message: "Live class deleted successfully", id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete live class", error: error.message });
  }
});

export default router;
