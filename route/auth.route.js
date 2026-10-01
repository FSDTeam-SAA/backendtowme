import express from "express";
import {
  customerRegister, customerLogin, customerOtpRequest,
  driverRegister, driverLogin, adminLogin, updateAdminProfile, changeAdminCredential, getCurrentAdmin,
  verifyOTP, resendOTP, forgetPassword, verifyResetOTP, resetPassword,
  logout, refreshToken,
} from "../controller/auth.controller.js";
import { protect, isAdmin, isMasterAdmin } from "../middleware/auth.middleware.js";
import { listManagers, createManager, updateManager } from "../controller/admin.manager.controller.js";
import { adminLoginLimiter, adminCodeLimiter, authLimiter, otpLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// Customer
router.post("/customer/register", authLimiter, customerRegister);
router.post("/customer/login", authLimiter, customerLogin);
router.post("/customer/otp-request", otpLimiter, customerOtpRequest);

// Driver
router.post("/driver/register", authLimiter, driverRegister);
router.post("/driver/login", authLimiter, driverLogin);

// Admin
router.post("/admin/login", adminLoginLimiter, adminLogin);
router.get("/admin/me", protect, isAdmin, getCurrentAdmin);
router.patch("/admin/profile", protect, isAdmin, updateAdminProfile);
router.patch("/admin/credential", protect, isAdmin, adminCodeLimiter, changeAdminCredential);
router.get("/admin/managers", protect, isMasterAdmin, listManagers);
router.post("/admin/managers", protect, isMasterAdmin, createManager);
router.patch("/admin/managers/:id", protect, isMasterAdmin, updateManager);

// Shared
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", otpLimiter, resendOTP);
router.post("/forget-password", otpLimiter, forgetPassword);
router.post("/verify-reset-otp", otpLimiter, verifyResetOTP);
router.post("/reset-password", otpLimiter, resetPassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", protect, logout);

export default router;
