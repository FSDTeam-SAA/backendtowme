import Trip from "../model/trip.model.js";
import Driver from "../model/driver.model.js";
import User from "../model/user.model.js";
import Transaction from "../model/transaction.model.js";
import Notification from "../model/notification.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";

// ============ CUSTOMER: CREATE TRIP REQUEST ============

export const createTrip = catchAsync(async (req, res) => {
  const {
    tripType, pickupAddress, pickupLat, pickupLng,
    dropoffAddress, dropoffLat, dropoffLng,
    vehicleInfo, price, paymentMethod, notes,
  } = req.body;

  if (!pickupAddress || !dropoffAddress) {
    throw new AppError(httpStatus.BAD_REQUEST, "Pickup and dropoff addresses are required");
  }

  const trip = await Trip.create({
    customerId: req.user._id,
    tripType: tripType || "towing",
    pickupLocation: {
      address: pickupAddress,
      coordinates: {
        type: "Point",
        coordinates: [Number(pickupLng) || 0, Number(pickupLat) || 0],
      },
    },
    dropoffLocation: {
      address: dropoffAddress,
      coordinates: {
        type: "Point",
        coordinates: [Number(dropoffLng) || 0, Number(dropoffLat) || 0],
      },
    },
    vehicleInfo: vehicleInfo || {},
    price: price ? Number(price) : 0,
    paymentMethod: paymentMethod || "cash",
    notes: notes || "",
    status: "pending",
  });

  await Notification.create({
    userId: req.user._id,
    title: "Trip Requested",
    message: `Your trip #${trip.tripNumber} has been placed. Waiting for driver.`,
    type: "new_trip",
    relatedId: trip._id,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Trip request created",
    data: trip,
  });
});

// ============ CUSTOMER: GET MY TRIPS ============

export const getMyTripsAsCustomer = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const query = { customerId: req.user._id };
  if (status) query.status = status;

  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate("driverId", "firstName lastName phoneNumber profileImage vehicleType licenseNumber rating")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Trip.countDocuments(query),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trips fetched",
    data: trips,
    meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
  });
});

// ============ CUSTOMER: GET TRIP DETAILS ============

export const getTripById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const trip = await Trip.findById(id)
    .populate("customerId", "name phoneNumber profileImage")
    .populate("driverId", "firstName lastName phoneNumber profileImage vehicleType licenseNumber rating currentLocation");

  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  // Only owner or driver or admin can view
  const isCustomer = trip.customerId?._id?.toString() === req.user._id.toString();
  const isAdmin = req.user.role === "admin";
  let isDriver = false;

  if (req.user.role === "driver") {
    const driver = await Driver.findOne({ userId: req.user._id });
    isDriver = driver && trip.driverId?._id?.toString() === driver._id.toString();
  }

  if (!isCustomer && !isAdmin && !isDriver) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip fetched",
    data: trip,
  });
});

// ============ CUSTOMER: CANCEL TRIP ============

export const cancelTripByCustomer = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const trip = await Trip.findOne({ _id: id, customerId: req.user._id });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  if (!["pending", "accepted"].includes(trip.status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Trip cannot be cancelled at this stage");
  }

  trip.status = "cancelled";
  trip.cancellationReason = reason || "";
  trip.cancelledBy = "customer";
  trip.cancelledAt = new Date();
  await trip.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip cancelled",
    data: trip,
  });
});

// ============ CUSTOMER: RATE TRIP ============

export const rateTrip = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { rating, review } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    throw new AppError(httpStatus.BAD_REQUEST, "Rating must be between 1 and 5");
  }

  const trip = await Trip.findOne({ _id: id, customerId: req.user._id });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  if (trip.status !== "completed") {
    throw new AppError(httpStatus.BAD_REQUEST, "Can only rate completed trips");
  }

  if (trip.customerRating) {
    throw new AppError(httpStatus.BAD_REQUEST, "You have already rated this trip");
  }

  trip.customerRating = Number(rating);
  trip.customerReview = review || "";
  await trip.save();

  // Update driver rating
  if (trip.driverId) {
    const driver = await Driver.findById(trip.driverId);
    if (driver) {
      const newTotal = driver.totalRatings + 1;
      const newRating = ((driver.rating * driver.totalRatings) + Number(rating)) / newTotal;
      driver.rating = Math.round(newRating * 10) / 10;
      driver.totalRatings = newTotal;
      await driver.save();
    }
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Rating submitted",
    data: trip,
  });
});

// ============ DRIVER: ACCEPT TRIP ============

export const acceptTrip = catchAsync(async (req, res) => {
  const { id } = req.params;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found");
  }

  if (driver.availabilityStatus !== "available") {
    throw new AppError(httpStatus.BAD_REQUEST, "You must be available to accept trips");
  }

  const trip = await Trip.findOne({ _id: id, status: "pending" });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found or already taken");
  }

  trip.driverId = driver._id;
  trip.status = "accepted";
  trip.acceptedAt = new Date();
  await trip.save();

  driver.availabilityStatus = "busy";
  await driver.save();

  await Notification.create({
    userId: trip.customerId,
    title: "Driver Accepted",
    message: `Driver ${driver.firstName} ${driver.lastName} has accepted your trip #${trip.tripNumber}.`,
    type: "trip_accepted",
    relatedId: trip._id,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip accepted",
    data: trip,
  });
});

// ============ DRIVER: REJECT TRIP ============

export const rejectTrip = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  const trip = await Trip.findOne({ _id: id, driverId: driver._id, status: "accepted" });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  trip.driverId = null;
  trip.status = "pending";
  trip.cancellationReason = reason || "";
  await trip.save();

  driver.availabilityStatus = "available";
  await driver.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip rejected",
    data: null,
  });
});

// ============ DRIVER: START TRIP ============

export const startTrip = catchAsync(async (req, res) => {
  const { id } = req.params;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  const trip = await Trip.findOne({ _id: id, driverId: driver._id, status: "accepted" });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found or not in accepted state");
  }

  trip.status = "in_progress";
  trip.startedAt = new Date();
  await trip.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip started",
    data: trip,
  });
});

// ============ DRIVER: COMPLETE TRIP ============

export const completeTrip = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { finalPrice } = req.body;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  const trip = await Trip.findOne({ _id: id, driverId: driver._id, status: "in_progress" });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found or not in progress");
  }

  const tripPrice = finalPrice ? Number(finalPrice) : trip.price;
  trip.price = tripPrice;
  trip.status = "completed";
  trip.completedAt = new Date();
  trip.paymentStatus = "paid";
  await trip.save();

  // Create transaction
  const commissionPercent = driver.commissionPercent || 15;
  await Transaction.create({
    tripId: trip._id,
    customerId: trip.customerId,
    driverId: driver._id,
    amount: tripPrice,
    commissionPercent,
    type: "trip_payment",
    paymentMethod: trip.paymentMethod,
    status: "completed",
    description: `Trip #${trip.tripNumber} payment`,
  });

  // Update driver stats
  driver.totalTrips += 1;
  driver.totalEarnings += tripPrice * (1 - commissionPercent / 100);
  driver.totalCommissionPaid += tripPrice * (commissionPercent / 100);
  driver.availabilityStatus = "available";
  await driver.save();

  await Notification.create({
    userId: trip.customerId,
    title: "Trip Completed",
    message: `Your trip #${trip.tripNumber} has been completed. Please rate your driver!`,
    type: "trip_completed",
    relatedId: trip._id,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip completed",
    data: trip,
  });
});

// ============ ADMIN: GET ALL TRIPS ============

export const getAllTrips = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, status, tripType, search, driverId, customerId, fromDate, toDate } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const query = {};
  if (status) query.status = status;
  if (tripType) query.tripType = tripType;
  if (driverId) query.driverId = driverId;
  if (customerId) query.customerId = customerId;

  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) query.createdAt.$lte = new Date(toDate);
  }

  if (search) {
    query.$or = [
      { tripNumber: { $regex: search, $options: "i" } },
      { "pickupLocation.address": { $regex: search, $options: "i" } },
      { "dropoffLocation.address": { $regex: search, $options: "i" } },
    ];
  }

  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate("customerId", "name phoneNumber profileImage")
      .populate({
        path: "driverId",
        select: "firstName lastName phoneNumber profileImage vehicleType",
        populate: { path: "userId", select: "name" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Trip.countDocuments(query),
  ]);

  const [completed, cancelled, pending, inProgress] = await Promise.all([
    Trip.countDocuments({ status: "completed" }),
    Trip.countDocuments({ status: "cancelled" }),
    Trip.countDocuments({ status: "pending" }),
    Trip.countDocuments({ status: "in_progress" }),
  ]);

  const avgDurationRaw = await Trip.aggregate([
    { $match: { status: "completed", startedAt: { $exists: true }, completedAt: { $exists: true } } },
    { $group: { _id: null, avgMinutes: { $avg: { $divide: [{ $subtract: ["$completedAt", "$startedAt"] }, 60000] } } } },
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trips fetched",
    data: {
      trips,
      stats: {
        total,
        completed,
        cancelled,
        pending,
        inProgress,
        cancellationRate: total > 0 ? Math.round((cancelled / total) * 100 * 10) / 10 : 0,
        avgDurationMinutes: Math.round(avgDurationRaw[0]?.avgMinutes || 0),
      },
    },
    meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
  });
});

// ============ ADMIN: CANCEL TRIP ============

export const cancelTripByAdmin = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const trip = await Trip.findById(id);
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  if (trip.status === "completed") {
    throw new AppError(httpStatus.BAD_REQUEST, "Cannot cancel a completed trip");
  }

  trip.status = "cancelled";
  trip.cancellationReason = reason || "Cancelled by admin";
  trip.cancelledBy = "admin";
  trip.cancelledAt = new Date();
  await trip.save();

  if (trip.driverId) {
    await Driver.findByIdAndUpdate(trip.driverId, { availabilityStatus: "available" });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip cancelled by admin",
    data: trip,
  });
});

// ============ ADMIN: ASSIGN DRIVER ============

export const assignDriver = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { driverId } = req.body;

  const trip = await Trip.findById(id);
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  trip.driverId = driver._id;
  trip.status = "accepted";
  trip.acceptedAt = new Date();
  await trip.save();

  driver.availabilityStatus = "busy";
  await driver.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver assigned successfully",
    data: trip,
  });
});
