import express from "express";
import {
  createDriver, getAllDrivers, getDriverById, updateDriver,
  toggleDriverBlock, deleteDriver,
  getDriverProfile, updateDriverProfile, toggleAvailability,
  updateLocation, getMyTrips, getDriverFinancials, changeDriverPassword,
  registerFcmToken, removeFcmToken, setDriverApproval,
} from "../controller/driver.controller.js";
import { protect, isAdmin, isDriver, isMasterAdmin, requireAdminPermission } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";
import { adminCodeLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

// Driver self-service routes (must be before /:id)
router.get("/me/profile", protect, isDriver, getDriverProfile);
router.post("/me/fcm-token", protect, isDriver, registerFcmToken);
router.delete("/me/fcm-token", protect, isDriver, removeFcmToken);
router.put(
  "/me/profile",
  protect,
  isDriver,
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "insuranceDocument", maxCount: 1 },
    { name: "cargoInsuranceDocument", maxCount: 1 },
    { name: "thirdPartyInsuranceDocument", maxCount: 1 },
  ]),
  updateDriverProfile
);
router.put("/me/change-password", protect, isDriver, changeDriverPassword);
router.patch("/me/availability", protect, isDriver, toggleAvailability);
router.patch("/me/location", protect, isDriver, updateLocation);
router.get("/me/trips", protect, isDriver, getMyTrips);
router.get("/me/financials", protect, isDriver, getDriverFinancials);

// Admin routes
router.post("/", protect, isMasterAdmin,
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "insuranceDocument", maxCount: 1 },
    { name: "cargoInsuranceDocument", maxCount: 1 },
    { name: "thirdPartyInsuranceDocument", maxCount: 1 },
  ]),
  createDriver
);
router.get("/", protect, isAdmin, requireAdminPermission("drivers"), getAllDrivers);
router.get("/:id", protect, isAdmin, requireAdminPermission("drivers"), getDriverById);
router.put("/:id", protect, isAdmin, requireAdminPermission("drivers"),
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "insuranceDocument", maxCount: 1 },
    { name: "cargoInsuranceDocument", maxCount: 1 },
    { name: "thirdPartyInsuranceDocument", maxCount: 1 },
  ]),
  updateDriver
);
router.patch("/:id/approval", protect, isAdmin, requireAdminPermission("drivers"), setDriverApproval);
router.patch("/:id/toggle-block", protect, isAdmin, requireAdminPermission("drivers"), adminCodeLimiter, toggleDriverBlock);
router.delete("/:id", protect, isAdmin, requireAdminPermission("drivers"), deleteDriver);

export default router;
