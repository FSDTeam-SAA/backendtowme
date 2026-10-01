import express from "express";
import {
  createTicket, getMyTickets, sendCustomerMessage,
  getAllTickets, getTicketById, adminReply, updateTicketStatus, quickAction,
} from "../controller/support.controller.js";
import { protect, isAdmin, isCustomer, requireAdminPermission } from "../middleware/auth.middleware.js";

const router = express.Router();

// Customer routes
router.post("/", protect, isCustomer, createTicket);
router.get("/my", protect, isCustomer, getMyTickets);
router.post("/:id/message", protect, isCustomer, sendCustomerMessage);

// Admin routes
router.get("/", protect, isAdmin, requireAdminPermission("support"), getAllTickets);
router.get("/:id", protect, isAdmin, requireAdminPermission("support"), getTicketById);
router.post("/:id/reply", protect, isAdmin, requireAdminPermission("support"), adminReply);
router.patch("/:id/status", protect, isAdmin, requireAdminPermission("support"), updateTicketStatus);
router.post("/:id/quick-action", protect, isAdmin, requireAdminPermission("support"), quickAction);

export default router;
