import express from "express";
import {
  createDriver, getAllDrivers, getDriverById, updateDriver,
  toggleDriverBlock, deleteDriver,
  getDriverProfile, updateDriverProfile, toggleAvailability,
  updateLocation, getMyTrips, getDriverFinancials,
} from "../controller/driver.controller.js";
import { protect, isAdmin, isDriver } from "../middleware/auth.middleware.js";
import upload from "../middleware/multer.middleware.js";

const router = express.Router();

// Admin routes
router.post("/", protect, isAdmin,
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "insuranceDocument", maxCount: 1 },
  ]),
  createDriver
);
router.get("/", protect, isAdmin, getAllDrivers);
router.get("/:id", protect, isAdmin, getDriverById);
router.put("/:id", protect, isAdmin,
  upload.fields([
    { name: "profileImage", maxCount: 1 },
    { name: "vehicleRegistration", maxCount: 1 },
    { name: "insuranceDocument", maxCount: 1 },
  ]),
  updateDriver
);
router.patch("/:id/toggle-block", protect, isAdmin, toggleDriverBlock);
router.delete("/:id", protect, isAdmin, deleteDriver);

// Driver routes
router.get("/me/profile", protect, isDriver, getDriverProfile);
router.put("/me/profile", protect, isDriver, upload.single("profileImage"), updateDriverProfile);
router.patch("/me/availability", protect, isDriver, toggleAvailability);
router.patch("/me/location", protect, isDriver, updateLocation);
router.get("/me/trips", protect, isDriver, getMyTrips);
router.get("/me/financials", protect, isDriver, getDriverFinancials);

export default router;
