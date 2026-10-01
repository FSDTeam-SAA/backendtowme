import User from "../model/user.model.js";
import Driver from "../model/driver.model.js";
import Trip from "../model/trip.model.js";
import Transaction from "../model/transaction.model.js";
import Notification from "../model/notification.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import { generateOTP } from "../utils/commonMethod.js";
import { createToken } from "../utils/authToken.js";
import { emitToAdmins, EVENTS } from "../utils/realtime.js";
import { findUserByPhone, normalizePhoneNumber } from "../utils/phoneNumber.js";
import { settledDriverEarnings } from "../utils/settledDriverEarnings.js";

// ============ ADMIN: CREATE DRIVER ============

export const createDriver = catchAsync(async (req, res) => {
  const {
    firstName, lastName, dateOfBirth, idNumber, email, phoneNumber,
    vehicleType, licenseNumber, vehicleYear, vehicleColor, towingCapacity,
    username, password, operatingArea, commissionPercent, accountStatus,
  } = req.body;

  if (!firstName || !lastName || !phoneNumber || !vehicleType || !licenseNumber || !password) {
    throw new AppError(httpStatus.BAD_REQUEST, "Required fields: firstName, lastName, phoneNumber, vehicleType, licenseNumber, password");
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!/^\+972\d{9}$/.test(normalizedPhone)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid Israeli phone number is required");
  }
  const existingUser = await findUserByPhone(User, normalizedPhone);
  if (existingUser) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number already registered");
  }

  // Create user account
  const userPayload = {
    name: `${firstName} ${lastName}`,
    phoneNumber: normalizedPhone,
    password,
    role: "driver",
    isPhoneVerified: true,
  };
  if (email?.trim()) {
    userPayload.email = email.toLowerCase().trim();
  }

  const user = await User.create(userPayload);

  // Handle profile image
  let profileImage = { public_id: "", url: "" };
  if (req.files?.profileImage?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.profileImage[0].buffer, { folder: "towme/drivers/profiles" });
    profileImage = { public_id: uploaded.public_id, url: uploaded.secure_url };
    await User.findByIdAndUpdate(user._id, { profileImage });
  }

  // Handle documents
  let vehicleRegistration = { public_id: "", url: "" };
  let insuranceDocument = { public_id: "", url: "" };
  let cargoInsuranceDocument = { public_id: "", url: "" };
  let thirdPartyInsuranceDocument = { public_id: "", url: "" };

  if (req.files?.vehicleRegistration?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.vehicleRegistration[0].buffer, { folder: "towme/drivers/docs" });
    vehicleRegistration = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }

  if (req.files?.insuranceDocument?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.insuranceDocument[0].buffer, { folder: "towme/drivers/docs" });
    insuranceDocument = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }
  if (req.files?.cargoInsuranceDocument?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.cargoInsuranceDocument[0].buffer, { folder: "towme/drivers/docs" });
    cargoInsuranceDocument = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }
  if (req.files?.thirdPartyInsuranceDocument?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.thirdPartyInsuranceDocument[0].buffer, { folder: "towme/drivers/docs" });
    thirdPartyInsuranceDocument = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }

  // Parse operatingArea
  let areas = [];
  if (operatingArea) {
    areas = Array.isArray(operatingArea) ? operatingArea : JSON.parse(operatingArea);
  }

  const driver = await Driver.create({
    userId: user._id,
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    dateOfBirth: dateOfBirth || null,
    idNumber: idNumber || "",
    email: email ? email.toLowerCase().trim() : "",
    phoneNumber: normalizedPhone,
    profileImage,
    vehicleType,
    licenseNumber: licenseNumber.trim(),
    vehicleYear: vehicleYear ? Number(vehicleYear) : null,
    vehicleColor: vehicleColor || "",
    towingCapacity: towingCapacity ? Number(towingCapacity) : 3,
    vehicleRegistration,
    insuranceDocument,
    cargoInsuranceDocument,
    thirdPartyInsuranceDocument,
    username: username || "",
    operatingArea: areas,
    commissionPercent: commissionPercent ? Number(commissionPercent) : 15,
    accountStatus: accountStatus !== undefined ? accountStatus : true,
    isVerified: false,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Driver created successfully",
    data: { user, driver },
  });
});

// ============ ADMIN: GET ALL DRIVERS ============

export const getAllDrivers = catchAsync(async (req, res) => {
  const {
    page = 1, limit = 10, status, vehicleType, search, city,
    sortBy = "createdAt", sortOrder = "desc"
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const query = {};
  if (status === "available") query.availabilityStatus = "available";
  else if (status === "unavailable") query.availabilityStatus = { $ne: "available" };
  if (vehicleType) query.vehicleType = vehicleType;
  if (city) query.operatingArea = { $regex: city, $options: "i" };
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
      { licenseNumber: { $regex: search, $options: "i" } },
      { idNumber: { $regex: search, $options: "i" } },
    ];
  }

  const sortObj = { [sortBy]: sortOrder === "asc" ? 1 : -1 };
  const [drivers, total] = await Promise.all([
    Driver.find(query).populate("userId", "name email phoneNumber profileImage isBlocked").sort(sortObj).skip(skip).limit(Number(limit)),
    Driver.countDocuments(query),
  ]);
  const earnings = await settledDriverEarnings(drivers.map((driver) => driver._id));
  const driversWithEarnings = drivers.map((driver) => ({
    ...driver.toObject(), totalEarnings: earnings.get(String(driver._id)) || 0,
  }));

  const available = await Driver.countDocuments({ availabilityStatus: "available" });
  const unavailable = await Driver.countDocuments({ availabilityStatus: { $ne: "available" } });
  const newThisMonth = await Driver.countDocuments({
    createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
  });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Drivers fetched successfully",
    data: {
      drivers: driversWithEarnings,
      stats: { total, available, unavailable, newThisMonth },
    },
    meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
  });
});

// ============ ADMIN: GET SINGLE DRIVER ============

export const getDriverById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const driver = await Driver.findById(id).populate("userId", "name email phoneNumber profileImage isBlocked createdAt");

  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  const recentTrips = await Trip.find({ driverId: driver._id })
    .sort({ createdAt: -1 })
    .populate("customerId", "name phoneNumber profileImage");
  const earnings = await settledDriverEarnings([driver._id]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver fetched successfully",
    data: { driver: { ...driver.toObject(), totalEarnings: earnings.get(String(driver._id)) || 0 }, recentTrips },
  });
});

// ============ ADMIN: UPDATE DRIVER ============

export const updateDriver = catchAsync(async (req, res) => {
  const { id } = req.params;
  const allowed = [
    "firstName", "lastName", "dateOfBirth", "idNumber", "email", "phoneNumber",
    "vehicleType", "licenseNumber", "vehicleYear", "vehicleColor", "towingCapacity",
    "username", "operatingArea", "commissionPercent", "accountStatus", "notes",
  ];
  const updateData = Object.fromEntries(
    allowed.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]]),
  );

  const driver = await Driver.findById(id);
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  if (updateData.phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(updateData.phoneNumber);
    if (!/^\+972\d{9}$/.test(normalizedPhone)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Valid Israeli phone number is required");
    }
    const owner = await findUserByPhone(User, normalizedPhone, { _id: { $ne: driver.userId } });
    if (owner) throw new AppError(httpStatus.CONFLICT, "Phone number already registered");
    updateData.phoneNumber = normalizedPhone;
  }

  if (req.files?.profileImage?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.profileImage[0].buffer, { folder: "towme/drivers/profiles" });
    updateData.profileImage = { public_id: uploaded.public_id, url: uploaded.secure_url };
    await User.findByIdAndUpdate(driver.userId, { profileImage: updateData.profileImage });
  }

  if (req.files?.vehicleRegistration?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.vehicleRegistration[0].buffer, { folder: "towme/drivers/docs" });
    updateData.vehicleRegistration = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }

  if (req.files?.insuranceDocument?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.insuranceDocument[0].buffer, { folder: "towme/drivers/docs" });
    updateData.insuranceDocument = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }
  if (req.files?.cargoInsuranceDocument?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.cargoInsuranceDocument[0].buffer, { folder: "towme/drivers/docs" });
    updateData.cargoInsuranceDocument = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }
  if (req.files?.thirdPartyInsuranceDocument?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.thirdPartyInsuranceDocument[0].buffer, { folder: "towme/drivers/docs" });
    updateData.thirdPartyInsuranceDocument = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }

  if (updateData.operatingArea && typeof updateData.operatingArea === "string") {
    updateData.operatingArea = JSON.parse(updateData.operatingArea);
  }

  const updatedDriver = await Driver.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
  const accountUpdates = {};
  if (updateData.firstName || updateData.lastName) {
    accountUpdates.name = `${updatedDriver.firstName} ${updatedDriver.lastName}`.trim();
  }
  if (updateData.phoneNumber) accountUpdates.phoneNumber = updateData.phoneNumber;
  if (updateData.email) accountUpdates.email = updateData.email;
  if (Object.keys(accountUpdates).length) await User.findByIdAndUpdate(driver.userId, accountUpdates, { runValidators: true });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver updated successfully",
    data: updatedDriver,
  });
});

// ============ ADMIN: APPROVE/REJECT DRIVER ============

export const setDriverApproval = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { approved, reason } = req.body;

  if (typeof approved !== "boolean") {
    throw new AppError(httpStatus.BAD_REQUEST, "Field 'approved' must be true or false");
  }

  const driver = await Driver.findById(id);
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  if (approved) {
    const driverUser = await User.findById(driver.userId);
    if (driver.isBlocked || driverUser?.isBlocked) {
      throw new AppError(httpStatus.BAD_REQUEST, "Unlock this driver before approving them");
    }
    const missing = driver.missingDocuments();
    if (missing.length) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        `Driver is missing required documents: ${missing.join(", ")}`,
      );
    }
    driver.isVerified = true;
    driver.approvedAt = new Date();
    driver.rejectionReason = "";
  } else {
    const wasApproved = driver.isVerified;
    driver.isVerified = false;
    driver.approvedAt = null;
    driver.rejectionReason = reason ? String(reason).trim() : "";
    driver.availabilityStatus = "offline";
    if (wasApproved) {
      driver.isBlocked = true;
      await User.findByIdAndUpdate(driver.userId, { isBlocked: true, refreshToken: null });
    }
  }

  await driver.save();

  await Notification.create({
    userId: driver.userId,
    title: approved ? "החשבון אושר" : "החשבון לא אושר",
    message: approved
      ? "החשבון שלך אושר. אפשר להתחיל לקבל קריאות."
      : driver.rejectionReason || "החשבון שלך לא אושר. פנה לתמיכה לפרטים.",
    type: "system",
    relatedId: driver._id,
  });

  emitToAdmins(EVENTS.DRIVER_UPDATED, driver);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: approved ? "Driver approved" : "Driver approval revoked",
    data: {
      isVerified: driver.isVerified,
      approvedAt: driver.approvedAt,
      rejectionReason: driver.rejectionReason,
    },
  });
});

// ============ ADMIN: BLOCK/UNBLOCK DRIVER ============

export const toggleDriverBlock = catchAsync(async (req, res) => {
  const { id } = req.params;

  const driver = await Driver.findById(id);
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  const user = await User.findById(driver.userId);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver user account not found");
  }

  const code = String(req.body.code || "");
  const manager = await User.findById(req.user._id).select("+password");
  if (!code || !(await manager.comparePassword(code))) {
    throw new AppError(httpStatus.FORBIDDEN, "Invalid manager code");
  }
  user.isBlocked = !(driver.isBlocked || user.isBlocked);
  driver.isBlocked = user.isBlocked;
  if (driver.isBlocked) {
    driver.availabilityStatus = "offline";
    user.refreshToken = null;
  }
  await driver.save();
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: user.isBlocked ? "Driver blocked successfully" : "Driver unblocked successfully",
    data: { isBlocked: driver.isBlocked },
  });
});

// ============ ADMIN: DELETE DRIVER ============

export const deleteDriver = catchAsync(async (req, res) => {
  const { id } = req.params;

  const driver = await Driver.findById(id);
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  await User.findByIdAndDelete(driver.userId);
  await Driver.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver deleted successfully",
    data: null,
  });
});

// ============ DRIVER: GET MY PROFILE ============

export const getDriverProfile = catchAsync(async (req, res) => {
  const driver = await Driver.findOne({ userId: req.user._id }).populate("userId", "name phoneNumber email profileImage isBlocked");

  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found");
  }
  const earnings = await settledDriverEarnings([driver._id]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver profile fetched",
    data: { ...driver.toObject(), totalEarnings: earnings.get(String(driver._id)) || 0 },
  });
});

// ============ DRIVER: UPDATE MY PROFILE ============

export const updateDriverProfile = catchAsync(async (req, res) => {
  const {
    firstName, lastName, email, vehicleColor,
    phoneNumber, operatingArea, vehicleType, licenseNumber, vehicleYear,
    vehicleRegistrationExpiresAt, insuranceExpiresAt, cargoInsuranceExpiresAt,
    thirdPartyInsuranceExpiresAt,
  } = req.body;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found");
  }

  const userUpdates = {};

  if (firstName) driver.firstName = firstName.trim();
  if (lastName !== undefined) driver.lastName = String(lastName).trim();
  if (firstName || lastName !== undefined) {
    userUpdates.name = `${driver.firstName} ${driver.lastName}`.trim();
  }

  if (email !== undefined) {
    const normalizedEmail = String(email).toLowerCase().trim();
    driver.email = normalizedEmail;
    userUpdates.email = normalizedEmail || undefined;
  }
  if (vehicleColor) driver.vehicleColor = vehicleColor;
  if (phoneNumber) {
    driver.phoneNumber = phoneNumber.trim();
    userUpdates.phoneNumber = phoneNumber.trim();
  }
  if (operatingArea !== undefined) {
    if (operatingArea === "" || operatingArea === null) {
      driver.operatingArea = [];
    } else {
      driver.operatingArea = Array.isArray(operatingArea)
        ? operatingArea
        : String(operatingArea).split(",").map((s) => s.trim()).filter(Boolean);
    }
  }
  if (vehicleType && ["regular", "flatbed", "heavy"].includes(vehicleType)) {
    driver.vehicleType = vehicleType;
  }
  if (licenseNumber) driver.licenseNumber = licenseNumber.trim();
  if (vehicleYear !== undefined && vehicleYear !== null && vehicleYear !== "") {
    driver.vehicleYear = Number(vehicleYear);
  }

  if (vehicleRegistrationExpiresAt) {
    driver.vehicleRegistrationExpiresAt = new Date(vehicleRegistrationExpiresAt);
  }
  if (insuranceExpiresAt) {
    driver.insuranceExpiresAt = new Date(insuranceExpiresAt);
  }
  if (cargoInsuranceExpiresAt) {
    driver.cargoInsuranceExpiresAt = new Date(cargoInsuranceExpiresAt);
  }
  if (thirdPartyInsuranceExpiresAt) {
    driver.thirdPartyInsuranceExpiresAt = new Date(thirdPartyInsuranceExpiresAt);
  }

  const files = req.files || {};
  const uploadDoc = async (fileList, folder) => {
    if (!fileList?.[0]) return null;
    const uploaded = await uploadOnCloudinary(fileList[0].buffer, { folder });
    return { public_id: uploaded.public_id, url: uploaded.secure_url };
  };

  const profileImage = await uploadDoc(files.profileImage, "towme/drivers/profiles");
  if (profileImage) {
    driver.profileImage = profileImage;
    userUpdates.profileImage = profileImage;
  }

  const vehicleRegistration = await uploadDoc(files.vehicleRegistration, "towme/drivers/docs");
  if (vehicleRegistration) {
    driver.vehicleRegistration = vehicleRegistration;
    if (!driver.vehicleRegistrationExpiresAt) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      driver.vehicleRegistrationExpiresAt = d;
    }
  }

  const insuranceDocument = await uploadDoc(files.insuranceDocument, "towme/drivers/docs");
  if (insuranceDocument) {
    driver.insuranceDocument = insuranceDocument;
    if (!driver.insuranceExpiresAt) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      driver.insuranceExpiresAt = d;
    }
  }

  const cargoInsuranceDocument = await uploadDoc(files.cargoInsuranceDocument, "towme/drivers/docs");
  if (cargoInsuranceDocument) {
    driver.cargoInsuranceDocument = cargoInsuranceDocument;
    if (!driver.cargoInsuranceExpiresAt) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      driver.cargoInsuranceExpiresAt = d;
    }
  }

  const thirdPartyInsuranceDocument = await uploadDoc(
    files.thirdPartyInsuranceDocument,
    "towme/drivers/docs",
  );
  if (thirdPartyInsuranceDocument) {
    driver.thirdPartyInsuranceDocument = thirdPartyInsuranceDocument;
    if (!driver.thirdPartyInsuranceExpiresAt) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + 1);
      driver.thirdPartyInsuranceExpiresAt = d;
    }
  }

  await driver.save();

  if (Object.keys(userUpdates).length > 0) {
    await User.findByIdAndUpdate(req.user._id, userUpdates);
  }

  const updated = await Driver.findById(driver._id).populate(
    "userId",
    "name phoneNumber email profileImage"
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: updated,
  });
});

// ============ DRIVER: TOGGLE AVAILABILITY ============

export const toggleAvailability = catchAsync(async (req, res) => {
  const { status } = req.body;

  if (!["available", "busy", "offline"].includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Status must be: available, busy, or offline");
  }

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  if (status !== "offline" && !driver.canReceiveTrips()) {
    const missing = driver.missingDocuments();
    throw new AppError(
      httpStatus.FORBIDDEN,
      missing.length
        ? `Your account is awaiting approval. Upload these documents so an administrator can approve you: ${missing.join(", ")}`
        : "Your account is awaiting administrator approval",
    );
  }

  driver.availabilityStatus = status;
  await driver.save();

  emitToAdmins(EVENTS.DRIVER_UPDATED, driver);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Availability set to ${status}`,
    data: { availabilityStatus: driver.availabilityStatus },
  });
});

// ============ DRIVER: UPDATE LOCATION ============

export const updateLocation = catchAsync(async (req, res) => {
  const { latitude, longitude } = req.body;

  if (latitude === undefined || longitude === undefined) {
    throw new AppError(httpStatus.BAD_REQUEST, "Latitude and longitude are required");
  }

  const driver = await Driver.findOneAndUpdate(
    { userId: req.user._id },
    { currentLocation: { type: "Point", coordinates: [Number(longitude), Number(latitude)] } },
    { new: true }
  );

  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Location updated",
    data: { currentLocation: driver.currentLocation },
  });
});

// ============ DRIVER: GET MY TRIPS ============

export const getMyTrips = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  const query = { driverId: driver._id };
  if (status) query.status = status;

  const [trips, total] = await Promise.all([
    Trip.find(query)
      .populate("customerId", "name phoneNumber profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Trip.countDocuments(query),
  ]);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayTrips = await Trip.countDocuments({ driverId: driver._id, createdAt: { $gte: todayStart } });
  const weeklyTrips = await Trip.countDocuments({
    driverId: driver._id,
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });

  const earningsToday = await Transaction.aggregate([
    { $match: { driverId: driver._id, createdAt: { $gte: todayStart }, status: "completed",
      type: { $in: ["trip_payment", "cancellation_fee"] } } },
    { $group: { _id: null, total: { $sum: "$driverEarnings" } } },
  ]);
  const allTimeEarnings = await settledDriverEarnings([driver._id]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trips fetched",
    data: {
      trips: trips.map((t) => {
        const obj = typeof t.toObject === "function" ? t.toObject() : { ...t };
        const customer = obj.customerId && typeof obj.customerId === "object" ? obj.customerId : null;
        if (customer) {
          obj.customerName = customer.name || "";
          obj.customerPhone = customer.phoneNumber || customer.phone || "";
          obj.customerPhoneNumber = obj.customerPhone;
        }
        return obj;
      }),
      summary: {
        totalTrips: driver.totalTrips,
        todayTrips,
        weeklyTrips,
        totalEarnings: allTimeEarnings.get(String(driver._id)) || 0,
        earningsToday: earningsToday[0]?.total || 0,
      },
    },
    meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
  });
});

// ============ DRIVER: GET FINANCIAL HISTORY ============

export const getDriverFinancials = catchAsync(async (req, res) => {
  const { period = "month" } = req.query;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  let dateFilter = new Date();
  if (period === "week") dateFilter.setDate(dateFilter.getDate() - 7);
  else if (period === "month") dateFilter.setMonth(dateFilter.getMonth() - 1);
  else if (period === "year") dateFilter.setFullYear(dateFilter.getFullYear() - 1);

  const transactions = await Transaction.find({
    driverId: driver._id,
    createdAt: { $gte: dateFilter },
  })
    .populate("tripId", "tripNumber pickupLocation dropoffLocation createdAt")
    .sort({ createdAt: -1 });

  const settled = transactions.filter((item) => item.status === "completed" &&
    ["trip_payment", "cancellation_fee"].includes(item.type));
  const pending = transactions.filter((item) => item.status === "pending" &&
    ["trip_payment", "cancellation_fee"].includes(item.type));
  const totalEarned = settled.reduce((sum, item) => sum + (item.driverEarnings || 0), 0);
  const totalCommission = settled.reduce((sum, item) => sum + (item.commissionAmount || 0), 0);
  const pendingEarnings = pending.reduce((sum, item) => sum + (item.driverEarnings || 0), 0);
  const allTime = await Transaction.aggregate([
    { $match: { driverId: driver._id, status: "completed",
      type: { $in: ["trip_payment", "cancellation_fee"] } } },
    { $group: { _id: null, total: { $sum: "$driverEarnings" } } },
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Financial history fetched",
    data: {
      transactions,
      summary: {
        totalEarned,
        totalCommission,
        pendingEarnings,
        totalTrips: transactions.length,
        commissionPercent: driver.commissionPercent,
        allTimeEarnings: allTime[0]?.total || 0,
      },
    },
  });
});

// ============ DRIVER: REGISTER / UPDATE FCM TOKEN ============

export const registerFcmToken = catchAsync(async (req, res) => {
  const { token, pushEnabled, alertSoundsEnabled } = req.body;
  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (typeof pushEnabled === "boolean") {
    user.pushNotificationsEnabled = pushEnabled;
  }
  if (typeof alertSoundsEnabled === "boolean") {
    user.alertSoundsEnabled = alertSoundsEnabled;
  }

  if (token && typeof token === "string" && token.trim()) {
    const clean = token.trim();
    if (!user.fcmTokens.includes(clean)) {
      user.fcmTokens.push(clean);
    }
    // Keep list bounded
    if (user.fcmTokens.length > 10) {
      user.fcmTokens = user.fcmTokens.slice(-10);
    }
  }

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "FCM token registered",
    data: {
      pushNotificationsEnabled: user.pushNotificationsEnabled,
      alertSoundsEnabled: user.alertSoundsEnabled,
      tokenCount: user.fcmTokens.length,
    },
  });
});

export const removeFcmToken = catchAsync(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    throw new AppError(httpStatus.BAD_REQUEST, "token is required");
  }
  await User.updateOne(
    { _id: req.user._id },
    { $pull: { fcmTokens: token.trim() } }
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "FCM token removed",
    data: null,
  });
});

// ============ DRIVER: CHANGE PASSWORD ============

export const changeDriverPassword = catchAsync(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "All password fields are required");
  }

  if (newPassword !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords do not match");
  }

  if (newPassword.length < 6) {
    throw new AppError(httpStatus.BAD_REQUEST, "Password must be at least 6 characters");
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password changed successfully",
    data: null,
  });
});
