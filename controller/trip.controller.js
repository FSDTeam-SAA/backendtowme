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
  normalizeVehicleType,
  normalizeWeightBand,
  requiresWeightBand,
  calculateCancellationFee,
  CANCELLATION,
} from "../utils/towingPricing.js";
import { getDrivingDistanceKm } from "../utils/googleMapsDistance.js";
import { emitToAdmins, EVENTS } from "../utils/realtime.js";

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
    console.warn("[maps] driving distance unavailable, using client/haversine fallback:", err?.message || err);
  }

  const bodyDistance = Number(distanceKmOverride);
  if (Number.isFinite(bodyDistance) && bodyDistance > 0) {
    return {
      distanceRaw: roundKm(bodyDistance),
      durationMinutes: null,
      distanceSource: "client_fallback",
    };
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
  obj.customerName = obj.contactInfo?.name || customer?.name || obj.customerName || "";
  obj.customerPhone =
    obj.contactInfo?.phoneNumber || customer?.phoneNumber || customer?.phone || obj.customerPhone || "";
  obj.customerPhoneNumber = obj.customerPhone;
  return obj;
};

const resolvePricingVehicle = ({ vehicleType, weightBand, vehicleWeight }) => {
  const type = normalizeVehicleType(vehicleType || "car");
  if (!type) {
    throw new AppError(httpStatus.BAD_REQUEST, "Unsupported vehicle type");
  }
  const band = requiresWeightBand(type)
    ? normalizeWeightBand(weightBand ?? vehicleWeight)
    : null;
  if (requiresWeightBand(type) && !band) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "A valid weight band is required for trucks and work equipment",
    );
  }
  return { vehicleType: type, weightBand: band };
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
    vehicleType,
    weightBand,
    vehicleWeight,
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
    String(tripType || "").toLowerCase() === "rescue" ||
    String(tripType || "").toLowerCase() === "extraction" ||
    (req.body.notes && (
      String(req.body.notes).toLowerCase().includes("rescue") ||
      String(req.body.notes).includes("חילוץ")
    ));

  const pricingVehicle = resolvePricingVehicle({ vehicleType, weightBand, vehicleWeight });
  const fare = calculateTowingFare(distanceKm, {
    includeRescue: rescueRequested,
    ...pricingVehicle,
  });
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
      vehicleType: fare.vehicleType,
      weightBand: fare.weightBand,
      includedKm: fare.includedKm,
      additionalKmPrice: fare.additionalKmPrice,
      basePrice: fare.basePrice,
      nightSurcharge: fare.nightSurcharge,
      shabbatSurcharge: fare.shabbatSurcharge,
      holidaySurcharge: fare.holidaySurcharge,
      rescueFee: fare.rescueFee,
      towingFee: fare.towingFee,
      serviceFee: fare.serviceFee,
      taxableSubtotal: fare.taxableSubtotal,
      vat: fare.vat,
      vatPercent: fare.vatPercent,
      total: fare.total,
      isNight: fare.isNight,
      isShabbat: fare.isShabbat,
      isHoliday: fare.isHoliday,
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
    contactName, contactPhone, smsUpdates, bookingSource, termsAccepted,
    estimatedDistance, estimatedDuration,
    includeRescue, isRescue,
  } = req.body;

  if (!pickupAddress || !dropoffAddress) {
    throw new AppError(httpStatus.BAD_REQUEST, "Pickup and dropoff addresses are required");
  }
  const resolvedContactName = String(contactName || req.user.name || "").trim();
  const resolvedContactPhone = String(contactPhone || req.user.phoneNumber || "").trim();
  if (!resolvedContactName || !/^\+?\d{9,15}$/.test(resolvedContactPhone.replace(/[\s()-]/g, ""))) {
    throw new AppError(httpStatus.BAD_REQUEST, "Customer name and a valid mobile phone are required");
  }
  if (bookingSource === "website" && termsAccepted !== true) {
    throw new AppError(httpStatus.BAD_REQUEST, "Terms of Use must be accepted");
  }

  const rescueRequested =
    includeRescue === true ||
    isRescue === true ||
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

  const pricingVehicle = resolvePricingVehicle({
    vehicleType: vehicleInfo?.type,
    weightBand: vehicleInfo?.weightBand,
    vehicleWeight: vehicleInfo?.weight,
  });
  const fare = calculateTowingFare(distanceKm, {
    includeRescue: rescueRequested,
    ...pricingVehicle,
  });
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
    vehicleInfo: {
      ...(vehicleInfo || {}),
      type: pricingVehicle.vehicleType,
      weightBand: pricingVehicle.weightBand || "",
    },
    contactInfo: {
      name: resolvedContactName,
      phoneNumber: resolvedContactPhone,
      smsUpdates: smsUpdates !== false,
    },
    bookingSource: bookingSource === "website" ? "website" : "app",
    termsAcceptedAt: termsAccepted === true ? new Date() : undefined,
    price: safePrice,
    estimatedDistance: distanceKm,
    estimatedDuration: durationMinutes,
    priceBreakdown: {
      basePrice: fare.basePrice,
      vehicleType: fare.vehicleType,
      weightBand: fare.weightBand || "",
      includedKm: fare.includedKm,
      additionalKmPrice: fare.additionalKmPrice,
      nightSurcharge: fare.nightSurcharge,
      shabbatSurcharge: fare.shabbatSurcharge,
      holidaySurcharge: fare.holidaySurcharge,
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
      isHoliday: fare.isHoliday,
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

  // Notify available drivers about new pending trip (in-app + device push).
  // Drivers awaiting administrator approval are never dispatched to.
  const availableDrivers = await Driver.find({
    availabilityStatus: "available",
    isVerified: true,
    isBlocked: { $ne: true },
    accountStatus: { $ne: false },
  }).select("userId");
  const driverUserIds = availableDrivers
    .map((d) => d.userId)
    .filter(Boolean);

  await Promise.all(
    driverUserIds.map((userId) =>
      Notification.create({
        userId,
        title: trip.tripType === "on_site" ? "קריאת שירות במקום" : "קריאה חדשה",
        message: trip.tripType === "on_site"
          ? `קריאת שירות במקום: ${pickupAddress}`
          : `קריאת גרירה חדשה: ${pickupAddress} → ${dropoffAddress}`,
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
    tripType: trip.tripType,
  }).catch((err) => {
    console.error("[createTrip] push notify failed:", err?.message || err);
  });

  emitToAdmins(EVENTS.TRIP_CREATED, trip);

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

const destinationQuoteFor = async (trip, body) => {
  if (!["pending", "accepted", "arrived", "in_progress"].includes(trip.status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Destination cannot be changed at this stage");
  }
  const address = String(body.dropoffAddress || "").trim();
  const lat = Number(body.dropoffLat);
  const lng = Number(body.dropoffLng);
  if (!address || !Number.isFinite(lat) || !Number.isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid destination address and coordinates are required");
  }
  const [pickupLng, pickupLat] = trip.pickupLocation.coordinates.coordinates;
  const resolved = await resolveTripDistanceKm({
    pickupLat, pickupLng, dropoffLat: lat, dropoffLng: lng,
  });
  const distanceKm = Math.min(Math.max(0, resolved.distanceRaw), MAX_DISTANCE_KM);
  const fare = calculateTowingFare(distanceKm, {
    vehicleType: trip.vehicleInfo.type || "car",
    weightBand: trip.vehicleInfo.weightBand,
    includeRescue: trip.priceBreakdown?.includeRescue === true,
    forceNight: trip.priceBreakdown?.isNight === true,
    forceShabbat: trip.priceBreakdown?.isShabbat === true,
    forceHoliday: trip.priceBreakdown?.isHoliday === true,
    serviceFee: trip.priceBreakdown?.serviceFee,
  });
  return {
    dropoffAddress: address, dropoffLat: lat, dropoffLng: lng,
    distanceKm, durationMinutes: resolved.durationMinutes,
    price: fare.total, priceBreakdown: fare,
    pricedFrom: "original_pickup",
  };
};

export const quoteDestinationChange = catchAsync(async (req, res) => {
  const trip = await Trip.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!trip) throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  const quote = await destinationQuoteFor(trip, req.body);
  sendResponse(res, { statusCode: httpStatus.OK, success: true,
    message: "Destination change quote", data: quote });
});

export const changeDestination = catchAsync(async (req, res) => {
  const trip = await Trip.findOne({ _id: req.params.id, customerId: req.user._id });
  if (!trip) throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  if (req.body.confirmed !== true || !Number.isFinite(Number(req.body.expectedPrice))) {
    throw new AppError(httpStatus.BAD_REQUEST, "Customer price confirmation is required");
  }
  const quote = await destinationQuoteFor(trip, req.body);
  if (Math.abs(quote.price - Number(req.body.expectedPrice)) > 0.01) {
    throw new AppError(httpStatus.CONFLICT, "Price changed. Request a new quote");
  }
  trip.destinationHistory.push({
    address: trip.dropoffLocation.address,
    coordinates: trip.dropoffLocation.coordinates.coordinates,
    price: trip.price,
    changedAt: new Date(),
  });
  trip.dropoffLocation = { address: quote.dropoffAddress,
    coordinates: { type: "Point", coordinates: [quote.dropoffLng, quote.dropoffLat] } };
  trip.estimatedDistance = quote.distanceKm;
  trip.estimatedDuration = quote.durationMinutes || trip.estimatedDuration;
  trip.price = quote.price;
  trip.priceBreakdown = { ...quote.priceBreakdown,
    includeRescue: trip.priceBreakdown?.includeRescue === true };
  await trip.save();
  if (trip.driverId) {
    const driver = await Driver.findById(trip.driverId).select("userId");
    if (driver?.userId) await Notification.create({ userId: driver.userId,
      title: "Destination updated", message: `Trip #${trip.tripNumber}: ${quote.dropoffAddress}`,
      type: "system", relatedId: trip._id });
  }
  emitToAdmins(EVENTS.TRIP_UPDATED, trip);
  sendResponse(res, { statusCode: httpStatus.OK, success: true,
    message: "Destination updated", data: trip });
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

  if (!["pending", "accepted", "arrived", "in_progress"].includes(trip.status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Trip cannot be cancelled at this stage");
  }

  const assignedDriverId = trip.driverId;
  const { fee, reason: feeReason } = calculateCancellationFee({
    acceptedAt: trip.acceptedAt,
    arrivedAt: trip.arrivedAt,
    startedAt: trip.startedAt,
    fullFare: trip.price,
  });
  if (req.body.expectedFee != null &&
      (!Number.isFinite(Number(req.body.expectedFee)) ||
       Math.abs(Number(req.body.expectedFee) - fee) > 0.01)) {
    throw new AppError(httpStatus.CONFLICT, "Cancellation fee changed. Request a new quote");
  }

  trip.status = "cancelled";
  trip.cancellationReason = (reason && String(reason).trim()) ? String(reason).trim() : "";
  trip.cancelledBy = "customer";
  trip.cancelledAt = new Date();
  trip.cancellationFee = fee;
  trip.cancellationFeeReason = feeReason;
  await trip.save();

  // Free the assigned driver so they can take new calls.
  if (assignedDriverId) {
    await Driver.findByIdAndUpdate(assignedDriverId, {
      availabilityStatus: "available",
    });
  }

  if (fee > 0 && assignedDriverId) {
    await Transaction.create({
      tripId: trip._id,
      customerId: trip.customerId,
      driverId: assignedDriverId,
      amount: fee,
      type: "cancellation_fee",
      paymentMethod: trip.paymentMethod,
      status: "pending",
      description: `Cancellation fee (${feeReason})`,
    });
  }

  emitToAdmins(EVENTS.TRIP_UPDATED, trip);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: fee > 0 ? `Trip cancelled — ${fee} ILS cancellation fee applies` : "Trip cancelled",
    data: trip,
  });
});

// ============ CUSTOMER: CANCELLATION QUOTE ============

export const getCancellationQuote = catchAsync(async (req, res) => {
  const { id } = req.params;

  const trip = await Trip.findOne({ _id: id, customerId: req.user._id });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found");
  }

  const { fee, reason } = calculateCancellationFee({
    acceptedAt: trip.acceptedAt,
    arrivedAt: trip.arrivedAt,
    startedAt: trip.startedAt,
    fullFare: trip.price,
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Cancellation quote",
    data: {
      fee,
      reason,
      currency: "ILS",
      freeWindowMinutes: CANCELLATION.freeWindowMinutes,
      middleWindowMinutes: CANCELLATION.middleWindowMinutes,
      middleFee: CANCELLATION.middleFee,
      lateFee: CANCELLATION.lateFee,
      fullFare: trip.price,
      driverArrived: Boolean(trip.arrivedAt),
    },
  });
});

// ============ DRIVER: MARK ARRIVED AT PICKUP ============

export const markTripArrived = catchAsync(async (req, res) => {
  const { id } = req.params;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  const trip = await Trip.findOne({ _id: id, driverId: driver._id, status: "accepted" });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found or not in accepted state");
  }

  trip.status = "arrived";
  trip.arrivedAt = new Date();
  await trip.save();

  await trip.populate("customerId", "name phoneNumber profileImage");

  emitToAdmins(EVENTS.TRIP_UPDATED, trip);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Arrival confirmed",
    data: withCustomerContact(trip),
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

  if (!driver.canReceiveTrips()) {
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Awaiting administrator approval",
      data: [],
      meta: { total: 0, page: Number(page), limit: Number(limit), totalPages: 0 },
    });
    return;
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

  if (!driver.canReceiveTrips()) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "Your account is awaiting administrator approval",
    );
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

  emitToAdmins(EVENTS.TRIP_UPDATED, trip);

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
    ["accepted", "arrived", "in_progress"].includes(trip.status);

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

    emitToAdmins(EVENTS.TRIP_UPDATED, trip);

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

  const trip = await Trip.findOne({
    _id: id,
    driverId: driver._id,
    status: { $in: ["accepted", "arrived"] },
  });
  if (!trip) {
    throw new AppError(httpStatus.NOT_FOUND, "Trip not found or not in accepted state");
  }

  trip.status = "in_progress";
  // Older driver builds call this endpoint when tracking opens. Only an
  // explicit pickup confirmation may trigger the full-fare cancellation tier.
  if (req.body?.pickupConfirmed === true) {
    trip.startedAt = new Date();
  }
  await trip.save();

  await trip.populate("customerId", "name phoneNumber profileImage");

  emitToAdmins(EVENTS.TRIP_UPDATED, trip);

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

  emitToAdmins(EVENTS.TRIP_UPDATED, trip);

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

  emitToAdmins(EVENTS.TRIP_UPDATED, trip);

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
      tripType: trip.tripType,
    }).catch((err) => {
      console.error("[assignDriver] push notify failed:", err?.message || err);
    });
  }

  emitToAdmins(EVENTS.TRIP_UPDATED, trip);

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
