import express from "express";
import {
  getMyNotifications, markAsRead, markAllAsRead, deleteNotification,
} from "../controller/notification.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/", protect, getMyNotifications);
router.patch("/:id/read", protect, markAsRead);
router.patch("/mark-all-read", protect, markAllAsRead);
router.delete("/:id", protect, deleteNotification);

export default router;
