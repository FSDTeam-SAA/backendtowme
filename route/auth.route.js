import express from "express";
import {
  customerRegister, customerLogin, customerOtpRequest,
  driverRegister, driverLogin, adminLogin,
  verifyOTP, resendOTP, forgetPassword, verifyResetOTP, resetPassword,
  logout, refreshToken,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { adminLoginLimiter, authLimiter, otpLimiter } from "../middleware/rateLimit.middleware.js";

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

// Shared
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", otpLimiter, resendOTP);
router.post("/forget-password", otpLimiter, forgetPassword);
router.post("/verify-reset-otp", verifyResetOTP);
router.post("/reset-password", resetPassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", protect, logout);

export default router;
