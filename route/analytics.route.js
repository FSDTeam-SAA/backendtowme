import express from "express";
import { getDashboardStats, getFinancialAnalytics, markDriverPayment } from "../controller/admin.analytics.controller.js";
import { protect, isAdmin } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/dashboard", protect, isAdmin, getDashboardStats);
router.get("/financials", protect, isAdmin, getFinancialAnalytics);
router.patch("/financials/driver/:driverId/payment", protect, isAdmin, markDriverPayment);

export default router;
