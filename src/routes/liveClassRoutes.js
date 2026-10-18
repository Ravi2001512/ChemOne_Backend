import express from "express";
import jwt from "jsonwebtoken";
import LiveClass from "../models/LiveClass.js";
import User from "../models/User.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Helper to extract YouTube video ID from various link formats
const extractYoutubeId = (url) => {
  if (!url) return "";
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|live\/)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : url.length === 11 ? url : "";
};

// GET /api/live-classes - Get all live classes (Registered users only)
router.get("/", protect, async (req, res) => {
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

// GET /api/live-classes/active - Get currently live stream (Registered users only)
router.get("/active", protect, async (req, res) => {
  try {
    const activeStream = await LiveClass.findOne({ status: "live" }).sort({ updatedAt: -1 });
    res.json(activeStream || null);
  } catch (error) {
    console.error("Error fetching active live class:", error);
    res.status(500).json({ message: "Failed to fetch active live class" });
  }
});

// GET /api/live-classes/:id - Get single live class (Registered users only)
router.get("/:id", protect, async (req, res) => {
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
      maxViewsPerStudent,
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
      maxViewsPerStudent: maxViewsPerStudent !== undefined ? Math.max(1, Number(maxViewsPerStudent) || 3) : 3,
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
      maxViewsPerStudent,
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
    if (maxViewsPerStudent !== undefined) {
      updateData.maxViewsPerStudent = Math.max(1, Number(maxViewsPerStudent) || 3);
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
    const { isRestricted, allowedStudents, maxViewsPerStudent } = req.body;
    const updateData = {};

    if (isRestricted !== undefined) {
      updateData.isRestricted = isRestricted === true || isRestricted === "true";
    }
    if (allowedStudents !== undefined) {
      updateData.allowedStudents = Array.isArray(allowedStudents)
        ? allowedStudents.map((s) => String(s).trim()).filter(Boolean)
        : [];
    }
    if (maxViewsPerStudent !== undefined) {
      updateData.maxViewsPerStudent = Math.max(1, Number(maxViewsPerStudent) || 3);
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

// POST /api/live-classes/:id/view - Check or record student video view (Registered students only)
router.post("/:id/view", protect, async (req, res) => {
  try {
    const { action = "record", indexNumber: providedIndex } = req.body;
    const liveClass = await LiveClass.findById(req.params.id);
    if (!liveClass) {
      return res.status(404).json({ message: "Live class not found" });
    }

    let userRole = "guest";
    let studentId = null;
    let indexNumber = providedIndex ? String(providedIndex).trim() : null;

    // Check token if provided
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userRole = decoded.role;
        studentId = decoded.id;
        if (!indexNumber && studentId) {
          const userDoc = await User.findById(studentId).select("indexNumber role");
          if (userDoc) {
            userRole = userDoc.role;
            if (userDoc.indexNumber) indexNumber = userDoc.indexNumber.trim();
          }
        }
      } catch (err) {
        // Fallback to provided indexNumber
      }
    }

    // Instructors/Admins have unlimited views
    if (userRole === "instructor" || userRole === "admin") {
      return res.json({
        allowed: true,
        viewsUsed: 0,
        maxViews: liveClass.maxViewsPerStudent ?? 3,
        remaining: liveClass.maxViewsPerStudent ?? 3,
        isAdmin: true,
      });
    }

    if (!indexNumber) {
      return res.status(400).json({
        message: "Student index number is required to verify video view limit",
        allowed: false,
      });
    }

    const maxViews = liveClass.maxViewsPerStudent !== undefined ? liveClass.maxViewsPerStudent : 3;

    if (!Array.isArray(liveClass.studentViews)) {
      liveClass.studentViews = [];
    }

    const lowerIndex = indexNumber.toLowerCase();
    let studentEntry = liveClass.studentViews.find(
      (sv) =>
        (sv.indexNumber && sv.indexNumber.toLowerCase() === lowerIndex) ||
        (studentId && sv.studentId && String(sv.studentId) === String(studentId))
    );

    let currentViews = studentEntry ? studentEntry.count : 0;

    if (action === "record") {
      if (currentViews >= maxViews) {
        return res.status(403).json({
          allowed: false,
          viewsUsed: currentViews,
          maxViews,
          remaining: 0,
          message: `You have reached the maximum allowed limit of ${maxViews} views for this video lecture.`,
        });
      }

      if (studentEntry) {
        studentEntry.count += 1;
        studentEntry.lastViewedAt = new Date();
        currentViews = studentEntry.count;
      } else {
        currentViews = 1;
        liveClass.studentViews.push({
          indexNumber,
          studentId: studentId || undefined,
          count: 1,
          lastViewedAt: new Date(),
        });
      }

      await liveClass.save();

      return res.json({
        allowed: true,
        viewsUsed: currentViews,
        maxViews,
        remaining: Math.max(0, maxViews - currentViews),
        recorded: true,
      });
    }

    // Checking only
    const allowed = currentViews < maxViews;
    return res.json({
      allowed,
      viewsUsed: currentViews,
      maxViews,
      remaining: Math.max(0, maxViews - currentViews),
      recorded: false,
    });
  } catch (error) {
    console.error("Error managing video view:", error);
    res.status(500).json({ message: "Failed to verify video view limit", error: error.message });
  }
});

// POST /api/live-classes/:id/reset-views - Reset view counts (Admin only)
router.post("/:id/reset-views", protect, adminOnly, async (req, res) => {
  try {
    const { indexNumber } = req.body;
    const liveClass = await LiveClass.findById(req.params.id);
    if (!liveClass) {
      return res.status(404).json({ message: "Live class not found" });
    }

    if (indexNumber) {
      const lower = indexNumber.toLowerCase().trim();
      liveClass.studentViews = (liveClass.studentViews || []).filter(
        (sv) => !sv.indexNumber || sv.indexNumber.toLowerCase().trim() !== lower
      );
    } else {
      liveClass.studentViews = [];
    }

    await liveClass.save();
    res.json({ message: "Views reset successfully", studentViews: liveClass.studentViews });
  } catch (error) {
    res.status(500).json({ message: "Failed to reset views", error: error.message });
  }
});

export default router;
