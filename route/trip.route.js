import express from "express";
import {
  createTrip, getMyTripsAsCustomer, getTripById,
  cancelTripByCustomer, rateTrip,
  acceptTrip, rejectTrip, startTrip, completeTrip,
  getAllTrips, cancelTripByAdmin, assignDriver,
} from "../controller/trip.controller.js";
import { protect, isAdmin, isDriver, isCustomer } from "../middleware/auth.middleware.js";

const router = express.Router();

// Customer routes
router.post("/", protect, isCustomer, createTrip);
router.get("/my", protect, isCustomer, getMyTripsAsCustomer);
router.post("/:id/cancel", protect, isCustomer, cancelTripByCustomer);
router.post("/:id/rate", protect, isCustomer, rateTrip);

// Driver routes
router.post("/:id/accept", protect, isDriver, acceptTrip);
router.post("/:id/reject", protect, isDriver, rejectTrip);
router.post("/:id/start", protect, isDriver, startTrip);
router.post("/:id/complete", protect, isDriver, completeTrip);

// Admin routes
router.get("/", protect, isAdmin, getAllTrips);
router.post("/:id/admin-cancel", protect, isAdmin, cancelTripByAdmin);
router.post("/:id/assign-driver", protect, isAdmin, assignDriver);

// Shared (customer, driver, admin)
router.get("/:id", protect, getTripById);

export default router;
