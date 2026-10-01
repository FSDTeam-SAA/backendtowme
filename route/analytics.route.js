import express from "express";
import { getDashboardStats, getFinancialAnalytics, markDriverPayment } from "../controller/admin.analytics.controller.js";
import { protect, isAdmin, requireAdminPermission } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/dashboard", protect, isAdmin, requireAdminPermission("dashboard"), getDashboardStats);
router.get("/financials", protect, isAdmin, requireAdminPermission("finance"), getFinancialAnalytics);
router.patch("/financials/driver/:driverId/payment", protect, isAdmin, requireAdminPermission("finance"), markDriverPayment);

export default router;
