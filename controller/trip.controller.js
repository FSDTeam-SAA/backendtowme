import Trip from "../model/trip.model.js";
import Driver from "../model/driver.model.js";
import User from "../model/user.model.js";
import Transaction from "../model/transaction.model.js";
import Notification from "../model/notification.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { notifyDriversNewTrip } from "../utils/pushNotification.js";
import {
  PRICING,
  haversineKm,
  roundKm,
  calculateTowingFare,
} from "../utils/towingPricing.js";
import { getDrivingDistanceKm } from "../utils/googleMapsDistance.js";

// ============ CUSTOMER: PRICE ESTIMATE ============
// Rate card: utils/towingPricing.js
// Distance (temporary): Google driving when available, else straight-line (haversine).
// TODO: after Routes API is enabled, prefer google_driving only.

const MAX_DISTANCE_KM = 500;

/**
 * Resolve trip distance for pricing.
 * Tries Google Maps driving first; falls back to haversine until Routes API is enabled.
 */
async function resolveTripDistanceKm({
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  distanceKmOverride,
}) {
  const bodyDistance = Number(distanceKmOverride);
  if (Number.isFinite(bodyDistance) && bodyDistance > 0) {
    return {
      distanceRaw: roundKm(bodyDistance),
      durationMinutes: null,
      distanceSource: "client",
    };
  }

  try {
    const driving = await getDrivingDistanceKm(
      { lat: pickupLat, lng: pickupLng },
      { lat: dropoffLat, lng: dropoffLng }
    );
    if (driving && driving.distanceKm > 0) {
      return {
        distanceRaw: roundKm(driving.distanceKm),
        durationMinutes: driving.durationMinutes || null,
        distanceSource: "google_driving",
      };
    }
  } catch (err) {
    console.warn("[maps] driving distance unavailable, using haversine:", err?.message || err);
  }

  return {
    distanceRaw: roundKm(
      haversineKm(
        Number(pickupLat),
        Number(pickupLng),
        Number(dropoffLat),
        Number(dropoffLng)
      )
    ),
    durationMinutes: null,
    distanceSource: "haversine",
  };
}

/** Flatten populated customer onto trip JSON so apps always get phone/name. */
const withCustomerContact = (tripDoc) => {
  if (!tripDoc) return tripDoc;
  const obj = typeof tripDoc.toObject === "function" ? tripDoc.toObject() : { ...tripDoc };
  const customer = obj.customerId && typeof obj.customerId === "object" ? obj.customerId : null;
  if (customer) {
    obj.customerName = customer.name || obj.customerName || "";
    obj.customerPhone = customer.phoneNumber || customer.phone || obj.customerPhone || "";
    obj.customerPhoneNumber = obj.customerPhone;
  }
  return obj;
};

export const estimateTrip = catchAsync(async (req, res) => {
  const {
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    includeRescue,
    isRescue,
    tripType,
  } = req.body;

  if ([pickupLat, pickupLng, dropoffLat, dropoffLng].some((v) => v === undefined || v === null)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Pickup and dropoff coordinates are required");
  }

  // Distance: Google driving if available, else straight-line (haversine) for now.
  const resolved = await resolveTripDistanceKm({
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    distanceKmOverride: req.body.distanceKm,
  });
  const distanceRaw = resolved.distanceRaw;
  // Cap to Israel-scale distances so bad geocodes don't create absurd fares.
  const distanceKm = Math.min(distanceRaw, MAX_DISTANCE_KM);

  const rescueRequested =
    includeRescue === true ||
    isRescue === true ||
    String(tripType || "").toLowerCase() === "roadside" ||
    String(tripType || "").toLowerCase() === "rescue" ||
    String(tripType || "").toLowerCase() === "extraction" ||
    (req.body.notes && (
      String(req.body.notes).toLowerCase().includes("rescue") ||
      String(req.body.notes).includes("חילוץ")
    ));

  const fare = calculateTowingFare(distanceKm, { includeRescue: rescueRequested });
  const durationMinutes =
    resolved.durationMinutes && resolved.durationMinutes > 0
      ? resolved.durationMinutes
      : Math.round(
          (distanceKm / PRICING.avgSpeedKmh) * 60 + PRICING.pickupBufferMin
        );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip estimate calculated",
    data: {
      distanceKm,
      distanceUncappedKm: distanceRaw,
      distanceCapped: distanceRaw > MAX_DISTANCE_KM,
      distanceSource: resolved.distanceSource,
      durationMinutes,
      basePrice: fare.basePrice,
      nightSurcharge: fare.nightSurcharge,
      shabbatSurcharge: fare.shabbatSurcharge,
      rescueFee: fare.rescueFee,
      towingFee: fare.towingFee,
      serviceFee: fare.serviceFee,
      taxableSubtotal: fare.taxableSubtotal,
      vat: fare.vat,
      vatPercent: fare.vatPercent,
      total: fare.total,
      isNight: fare.isNight,
      isShabbat: fare.isShabbat,
      includeRescue: rescueRequested,
      currency: "ILS",
    },
  });
});

// ============ CUSTOMER: DRIVER LIVE LOCATION ============

export const getTripDriverLocation = catchAsync(async (req, res) => {
  const { id } = req.params;

  const trip = await Trip.findById(id).populate(
    "driverId",
    "firstName lastName phoneNumber profileImage vehicleType licenseNumber rating currentLocation"
  );

  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  const isOwner = trip.customerId?.toString() === req.user._id.toString();
  if (!isOwner && req.user.role !== "admin") {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  if (!trip.driverId) {
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "No driver assigned yet",
      data: { status: trip.status, driver: null },
    });
    return;
  }

  const driver = trip.driverId;
  const [lng, lat] = driver.currentLocation?.coordinates || [0, 0];

  let etaMinutes = null;
  const [pickupLng, pickupLat] = trip.pickupLocation?.coordinates?.coordinates || [0, 0];
  if (lat && lng && pickupLat && pickupLng) {
    const km = haversineKm(lat, lng, pickupLat, pickupLng);
    etaMinutes = Math.max(1, Math.round((km / PRICING.avgSpeedKmh) * 60));
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver location fetched",
    data: {
      status: trip.status,
      etaMinutes,
      driver: {
        _id: driver._id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phoneNumber: driver.phoneNumber,
        profileImage: driver.profileImage,
        vehicleType: driver.vehicleType,
        licenseNumber: driver.licenseNumber,
        rating: driver.rating,
        lat,
        lng,
      },
    },
  });
});

// ============ CUSTOMER: CREATE TRIP REQUEST ============

export const createTrip = catchAsync(async (req, res) => {
  const {
    tripType, pickupAddress, pickupLat, pickupLng,
    dropoffAddress, dropoffLat, dropoffLng,
    vehicleInfo, price, paymentMethod, notes,
    estimatedDistance, estimatedDuration,
    includeRescue, isRescue,
  } = req.body;

  if (!pickupAddress || !dropoffAddress) {
    throw new AppError(httpStatus.BAD_REQUEST, "Pickup and dropoff addresses are required");
  }

  const rescueRequested =
    includeRescue === true ||
    isRescue === true ||
    String(tripType || "").toLowerCase() === "roadside" ||
    String(tripType || "").toLowerCase() === "rescue" ||
    String(tripType || "").toLowerCase() === "extraction" ||
    (notes && (
      String(notes).toLowerCase().includes("rescue") ||
      String(notes).includes("חילוץ")
    ));

  // Distance for fare: Google driving if available, else haversine (temporary).
  if (
    pickupLat == null ||
    pickupLng == null ||
    dropoffLat == null ||
    dropoffLng == null
  ) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Pickup and dropoff coordinates are required"
    );
  }

  const resolved = await resolveTripDistanceKm({
    pickupLat,
    pickupLng,
    dropoffLat,
    dropoffLng,
    distanceKmOverride: estimatedDistance,
  });
  const distanceKm = Math.min(Math.max(0, resolved.distanceRaw), MAX_DISTANCE_KM);

  const fare = calculateTowingFare(distanceKm, { includeRescue: rescueRequested });
  const durationMinutes =
    resolved.durationMinutes && resolved.durationMinutes > 0
      ? resolved.durationMinutes
      : estimatedDuration != null && Number(estimatedDuration) > 0
        ? Number(estimatedDuration)
        : Math.round(
            (distanceKm / PRICING.avgSpeedKmh) * 60 + PRICING.pickupBufferMin
          );

  const MAX_TRIP_PRICE = 100000;
  const safePrice = Math.min(Math.max(0, fare.total), MAX_TRIP_PRICE);

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
    price: safePrice,
    estimatedDistance: distanceKm,
    estimatedDuration: durationMinutes,
    priceBreakdown: {
      basePrice: fare.basePrice,
      nightSurcharge: fare.nightSurcharge,
      shabbatSurcharge: fare.shabbatSurcharge,
      rescueFee: fare.rescueFee,
      towingFee: fare.towingFee,
      serviceFee: fare.serviceFee,
      taxableSubtotal: fare.taxableSubtotal,
      vat: fare.vat,
      vatPercent: fare.vatPercent,
      total: fare.total,
      includeRescue: rescueRequested,
      isNight: fare.isNight,
      isShabbat: fare.isShabbat,
    },
    paymentMethod: paymentMethod || "cash",
    notes: notes || "",
    status: "pending",
  });

  await Notification.create({
    userId: req.user._id,
    title: "בקשת נסיעה נשלחה",
    message: `הנסיעה שלך #${trip.tripNumber} נקלטה. ממתין לנהג.`,
    type: "new_trip",
    relatedId: trip._id,
  });

  // Notify available drivers about new pending trip (in-app + device push)
  const availableDrivers = await Driver.find({
    availabilityStatus: "available",
  }).select("userId");
  const driverUserIds = availableDrivers
    .map((d) => d.userId)
    .filter(Boolean);

  await Promise.all(
    driverUserIds.map((userId) =>
      Notification.create({
        userId,
        title: "קריאה חדשה",
        message: `קריאת גרירה חדשה: ${pickupAddress} → ${dropoffAddress}`,
        type: "new_trip",
        relatedId: trip._id,
      })
    )
  );

  // Fire-and-forget FCM so drivers get alert even if app is closed/background.
  notifyDriversNewTrip({
    userIds: driverUserIds,
    tripId: trip._id,
    pickupAddress,
    dropoffAddress,
  }).catch((err) => {
    console.error("[createTrip] push notify failed:", err?.message || err);
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
    const isAssignedDriver = driver && trip.driverId?._id?.toString() === driver._id.toString();
    const isPendingTrip = trip.status === "pending" && !trip.driverId;
    isDriver = isAssignedDriver || isPendingTrip;
  }

  if (!isCustomer && !isAdmin && !isDriver) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip fetched",
    data: withCustomerContact(trip),
  });
});

export const cancelTripByCustomer = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const trip = await Trip.findOne({ _id: id, customerId: req.user._id });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  if (!["pending", "accepted", "in_progress"].includes(trip.status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Trip cannot be cancelled at this stage");
  }

  const assignedDriverId = trip.driverId;

  trip.status = "cancelled";
  trip.cancellationReason = (reason && String(reason).trim()) ? String(reason).trim() : "";
  trip.cancelledBy = "customer";
  trip.cancelledAt = new Date();
  await trip.save();

  // Free the assigned driver so they can take new calls.
  if (assignedDriverId) {
    await Driver.findByIdAndUpdate(assignedDriverId, {
      availabilityStatus: "available",
    });
  }

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

// ============ DRIVER: GET PENDING TRIPS ============

export const getPendingTrips = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found");
  }

  const query = {
    status: "pending",
    driverId: null,
    rejectedByDrivers: { $nin: [driver._id] },
  };

  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate("customerId", "name phoneNumber profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Trip.countDocuments(query),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Pending trips fetched",
    data: trips.map(withCustomerContact),
    meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
  });
});

// ============ DRIVER: ACCEPT TRIP ============

export const acceptTrip = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { price } = req.body;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found");
  }

  if (driver.availabilityStatus !== "available") {
    throw new AppError(httpStatus.BAD_REQUEST, "You must be available to accept trips");
  }

  const trip = await Trip.findOne({ _id: id, status: "pending", driverId: null });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found or already taken");
  }

  trip.driverId = driver._id;
  trip.status = "accepted";
  trip.acceptedAt = new Date();
  // Driver may adjust the price when accepting (editable price on the Rescue call card).
  if (price !== undefined && price !== null && Number(price) > 0) {
    const isRescueOrder =
      trip.tripType === "roadside" ||
      trip.tripType === "rescue" ||
      trip.tripType === "extraction" ||
      trip.priceBreakdown?.includeRescue === true ||
      (trip.notes && (
        String(trip.notes).toLowerCase().includes("rescue") ||
        String(trip.notes).includes("חילוץ")
      ));
    if (isRescueOrder) {
      trip.price = Number(price);
      if (trip.priceBreakdown) {
        trip.priceBreakdown.total = Number(price);
      }
    }
  }
  await trip.save();

  driver.availabilityStatus = "busy";
  await driver.save();

  await Notification.create({
    userId: trip.customerId,
    title: "הנהג קיבל את הקריאה",
    message: `הנהג ${driver.firstName} ${driver.lastName} קיבל את הנסיעה שלך #${trip.tripNumber}.`,
    type: "trip_accepted",
    relatedId: trip._id,
  });

  await trip.populate("customerId", "name phoneNumber profileImage");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip accepted",
    data: withCustomerContact(trip),
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

  const trip = await Trip.findById(id);
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  // Decline a pending trip offer (before accepting) — hide from this driver only
  if (trip.status === "pending" && !trip.driverId) {
    await Trip.findByIdAndUpdate(trip._id, {
      $addToSet: { rejectedByDrivers: driver._id },
      ...(reason ? { cancellationReason: reason } : {}),
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Trip declined",
      data: null,
    });
    return;
  }

  // Reject an already accepted / in-progress trip.
  // - default: release back to the pending pool (driver declined after accept)
  // - fullCancel: permanently cancel the ride (cancel-order button)
  const assignedToMe =
    trip.driverId?.toString() === driver._id.toString() &&
    ["accepted", "in_progress"].includes(trip.status);

  if (!assignedToMe) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  if (req.body?.fullCancel === true || req.body?.cancel === true) {
    trip.status = "cancelled";
    trip.cancellationReason = (reason && String(reason).trim()) ? String(reason).trim() : "Driver cancelled";
    trip.cancelledBy = "driver";
    trip.cancelledAt = new Date();
    await trip.save();

    driver.availabilityStatus = "available";
    await driver.save();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Trip cancelled",
      data: trip,
    });
    return;
  }

  await Trip.findByIdAndUpdate(trip._id, {
    $set: {
      driverId: null,
      status: "pending",
      cancellationReason: reason || "",
    },
    $unset: { acceptedAt: 1 },
    $addToSet: { rejectedByDrivers: driver._id },
  });

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

  await trip.populate("customerId", "name phoneNumber profileImage");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trip started",
    data: withCustomerContact(trip),
  });
});

// ============ DRIVER: COMPLETE TRIP ============

export const completeTrip = catchAsync(async (req, res) => {
  const { id } = req.params;
  const {
    finalPrice,
    distanceKm, endTime, vehicleCondition, comments,
    vehiclePlacedCorrectly, customerConfirmed, noAdditionalDamage,
  } = req.body;

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
  trip.completionReport = {
    distanceKm: distanceKm !== undefined && distanceKm !== null && distanceKm !== "" ? Number(distanceKm) : null,
    endTime: endTime || "",
    vehicleCondition: vehicleCondition || "",
    comments: comments || "",
    vehiclePlacedCorrectly: Boolean(vehiclePlacedCorrectly),
    customerConfirmed: Boolean(customerConfirmed),
    noAdditionalDamage: Boolean(noAdditionalDamage),
  };
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
    description: `תשלום נסיעה #${trip.tripNumber}`,
  });

  // Update driver stats
  driver.totalTrips += 1;
  driver.totalEarnings += tripPrice * (1 - commissionPercent / 100);
  driver.totalCommissionPaid += tripPrice * (commissionPercent / 100);
  driver.availabilityStatus = "available";
  await driver.save();

  await Notification.create({
    userId: trip.customerId,
    title: "הנסיעה הושלמה",
    message: `הנסיעה שלך #${trip.tripNumber} הושלמה. אנא דרג את הנהג!`,
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
  trip.cancellationReason = reason || "בוטל על ידי מנהל";
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

  if (driver.userId) {
    await Notification.create({
      userId: driver.userId,
      title: "קריאה חדשה",
      message: `שובצת לקריאת גרירה: ${trip.pickupLocation?.address || ""} → ${
        trip.dropoffLocation?.address || ""
      }`,
      type: "new_trip",
      relatedId: trip._id,
    });
    notifyDriversNewTrip({
      userIds: [driver.userId],
      tripId: trip._id,
      pickupAddress: trip.pickupLocation?.address,
      dropoffAddress: trip.dropoffLocation?.address,
    }).catch((err) => {
      console.error("[assignDriver] push notify failed:", err?.message || err);
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver assigned successfully",
    data: trip,
  });
});

// ============ DRIVER: UPDATE RESCUE PRICE (before accepting) ============

export const updateRescuePrice = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { price } = req.body;

  const newPrice = Number(price);
  if (!Number.isFinite(newPrice) || newPrice <= 0) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid price value");
  }

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found");
  }

  const trip = await Trip.findOne({ _id: id, status: "pending" });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found or not in pending state");
  }

  // Only allow price edits on Rescue trips
  const isRescueOrder =
    trip.tripType === "roadside" ||
    trip.tripType === "rescue" ||
    trip.tripType === "extraction" ||
    trip.priceBreakdown?.includeRescue === true ||
    (trip.notes && (
      String(trip.notes).toLowerCase().includes("rescue") ||
      String(trip.notes).includes("חילוץ")
    ));

  if (!isRescueOrder) {
    throw new AppError(httpStatus.BAD_REQUEST, "Price editing is only allowed for Rescue orders");
  }

  trip.price = newPrice;
  if (trip.priceBreakdown) {
    trip.priceBreakdown.total = newPrice;
  }
  await trip.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Rescue price updated",
    data: { tripId: trip._id, price: trip.price },
  });
});
