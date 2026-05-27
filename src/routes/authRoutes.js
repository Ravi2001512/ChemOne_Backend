import express from "express";
import { 
  registerUser, 
  loginUser, 
  forgotPassword, 
  resetPassword, 
  getUserProfile, 
  updateUserProfile, 
  getAllStudents,
  deleteStudent,
  toggleBlockStudent,
  getStudentByIndexNumber,
  updateStudentPayment,
  getScanSession,
  updateScanSession,
  clearActiveStudent,
  clearScanHistory
} from "../controllers/authController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

// Register
router.post("/register", registerUser);

// Login
router.post("/login", loginUser);

// Forgot Password (Send OTP)
router.post("/forgot-password", forgotPassword);

// Reset Password
router.post("/reset-password", resetPassword);

// Get Profile
router.get("/me", protect, getUserProfile);

// Update Profile
router.put("/me", protect, updateUserProfile);

// Get All Students
router.get("/students", protect, getAllStudents);

// Delete Student (Admin Only)
router.delete("/students/:id", protect, adminOnly, deleteStudent);

// Toggle Block Student (Admin Only)
router.patch("/students/:id/block", protect, adminOnly, toggleBlockStudent);

// Search Student by Index (Admin Only)
router.get("/students/search/:indexNumber", protect, adminOnly, getStudentByIndexNumber);

// Update Student Monthly Payment (Admin Only)
router.post("/students/:id/payment", protect, adminOnly, updateStudentPayment);

// Scan Session Endpoints (Admin Only)
router.get("/scan-session", protect, adminOnly, getScanSession);
router.post("/scan-session", protect, adminOnly, updateScanSession);
router.delete("/scan-session/active", protect, adminOnly, clearActiveStudent);
router.delete("/scan-session/history", protect, adminOnly, clearScanHistory);

export default router;