import express from "express";
import {
  customerRegister, customerLogin,
  driverLogin, adminLogin,
  verifyOTP, forgetPassword, verifyResetOTP, resetPassword,
  logout, refreshToken,
} from "../controller/auth.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

// Customer
router.post("/customer/register", customerRegister);
router.post("/customer/login", customerLogin);

// Driver
router.post("/driver/login", driverLogin);

// Admin
router.post("/admin/login", adminLogin);

// Shared
router.post("/verify-otp", verifyOTP);
router.post("/forget-password", forgetPassword);
router.post("/verify-reset-otp", verifyResetOTP);
router.post("/reset-password", resetPassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", protect, logout);

export default router;
