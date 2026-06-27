import express from "express";
import {
  getCustomerProfile, updateCustomerProfile, changeCustomerPassword,
  getAllCustomers, getCustomerById, toggleCustomerBlock, toggleVipStatus, deleteCustomer,
} from "../controller/customer.controller.js";
import { protect, isAdmin, isCustomer } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// Customer routes
router.get("/me/profile", protect, isCustomer, getCustomerProfile);
router.put("/me/profile", protect, isCustomer, upload.single("profileImage"), updateCustomerProfile);
router.put("/me/change-password", protect, isCustomer, changeCustomerPassword);

// Admin routes
router.get("/", protect, isAdmin, getAllCustomers);
router.get("/:id", protect, isAdmin, getCustomerById);
router.patch("/:id/toggle-block", protect, isAdmin, toggleCustomerBlock);
router.patch("/:id/toggle-vip", protect, isAdmin, toggleVipStatus);
router.delete("/:id", protect, isAdmin, deleteCustomer);

export default router;
