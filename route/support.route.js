import express from "express";
import {
  createTicket, getMyTickets, sendCustomerMessage,
  getAllTickets, getTicketById, adminReply, updateTicketStatus, quickAction,
} from "../controller/support.controller.js";
import { protect, isAdmin, isCustomer } from "../middleware/auth.middleware.js";

const router = express.Router();

// Customer routes
router.post("/", protect, isCustomer, createTicket);
router.get("/my", protect, isCustomer, getMyTickets);
router.post("/:id/message", protect, isCustomer, sendCustomerMessage);

// Admin routes
router.get("/", protect, isAdmin, getAllTickets);
router.get("/:id", protect, isAdmin, getTicketById);
router.post("/:id/reply", protect, isAdmin, adminReply);
router.patch("/:id/status", protect, isAdmin, updateTicketStatus);
router.post("/:id/quick-action", protect, isAdmin, quickAction);

export default router;
