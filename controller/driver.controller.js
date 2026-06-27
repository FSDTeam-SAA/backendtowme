import User from "../model/user.model.js";
import Driver from "../model/driver.model.js";
import Trip from "../model/trip.model.js";
import Transaction from "../model/transaction.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";
import { generateOTP } from "../utils/commonMethod.js";
import { createToken } from "../utils/authToken.js";

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

  const existingUser = await User.findOne({ phoneNumber: phoneNumber.trim() });
  if (existingUser) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number already registered");
  }

  // Create user account
  const user = await User.create({
    name: `${firstName} ${lastName}`,
    phoneNumber: phoneNumber.trim(),
    email: email ? email.toLowerCase().trim() : null,
    password,
    role: "driver",
    isPhoneVerified: true,
  });

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

  if (req.files?.vehicleRegistration?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.vehicleRegistration[0].buffer, { folder: "towme/drivers/docs" });
    vehicleRegistration = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }

  if (req.files?.insuranceDocument?.[0]) {
    const uploaded = await uploadOnCloudinary(req.files.insuranceDocument[0].buffer, { folder: "towme/drivers/docs" });
    insuranceDocument = { public_id: uploaded.public_id, url: uploaded.secure_url };
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
    phoneNumber: phoneNumber.trim(),
    profileImage,
    vehicleType,
    licenseNumber: licenseNumber.trim(),
    vehicleYear: vehicleYear ? Number(vehicleYear) : null,
    vehicleColor: vehicleColor || "",
    towingCapacity: towingCapacity ? Number(towingCapacity) : 3,
    vehicleRegistration,
    insuranceDocument,
    username: username || "",
    operatingArea: areas,
    commissionPercent: commissionPercent ? Number(commissionPercent) : 15,
    accountStatus: accountStatus !== undefined ? accountStatus : true,
    isVerified: true,
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
    page = 1, limit = 10, status, vehicleType, search,
    sortBy = "createdAt", sortOrder = "desc"
  } = req.query;

  const skip = (Number(page) - 1) * Number(limit);

  const query = {};
  if (status === "available") query.availabilityStatus = "available";
  else if (status === "unavailable") query.availabilityStatus = { $ne: "available" };
  if (vehicleType) query.vehicleType = vehicleType;
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
      drivers,
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
    .limit(10)
    .populate("customerId", "name phoneNumber profileImage");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver fetched successfully",
    data: { driver, recentTrips },
  });
});

// ============ ADMIN: UPDATE DRIVER ============

export const updateDriver = catchAsync(async (req, res) => {
  const { id } = req.params;
  const updateData = { ...req.body };

  const driver = await Driver.findById(id);
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
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

  if (updateData.operatingArea && typeof updateData.operatingArea === "string") {
    updateData.operatingArea = JSON.parse(updateData.operatingArea);
  }

  const updatedDriver = await Driver.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver updated successfully",
    data: updatedDriver,
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

  user.isBlocked = !user.isBlocked;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: user.isBlocked ? "Driver blocked successfully" : "Driver unblocked successfully",
    data: { isBlocked: user.isBlocked },
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
  const driver = await Driver.findOne({ userId: req.user._id }).populate("userId", "name phoneNumber email profileImage");

  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Driver profile fetched",
    data: driver,
  });
});

// ============ DRIVER: UPDATE MY PROFILE ============

export const updateDriverProfile = catchAsync(async (req, res) => {
  const { firstName, lastName, email, vehicleColor } = req.body;

  const driver = await Driver.findOne({ userId: req.user._id });
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found");
  }

  if (firstName) driver.firstName = firstName.trim();
  if (lastName) driver.lastName = lastName.trim();
  if (email) driver.email = email.toLowerCase().trim();
  if (vehicleColor) driver.vehicleColor = vehicleColor;

  if (req.file) {
    const uploaded = await uploadOnCloudinary(req.file.buffer, { folder: "towme/drivers/profiles" });
    driver.profileImage = { public_id: uploaded.public_id, url: uploaded.secure_url };
    await User.findByIdAndUpdate(req.user._id, { profileImage: driver.profileImage });
  }

  await driver.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated successfully",
    data: driver,
  });
});

// ============ DRIVER: TOGGLE AVAILABILITY ============

export const toggleAvailability = catchAsync(async (req, res) => {
  const { status } = req.body;

  if (!["available", "busy", "offline"].includes(status)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Status must be: available, busy, or offline");
  }

  const driver = await Driver.findOneAndUpdate(
    { userId: req.user._id },
    { availabilityStatus: status },
    { new: true }
  );

  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

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
    { $match: { driverId: driver._id, createdAt: { $gte: todayStart }, status: "completed" } },
    { $group: { _id: null, total: { $sum: "$driverEarnings" } } },
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Trips fetched",
    data: {
      trips,
      summary: {
        totalTrips: driver.totalTrips,
        todayTrips,
        weeklyTrips,
        totalEarnings: driver.totalEarnings,
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

  const totalEarned = transactions.reduce((sum, t) => sum + (t.driverEarnings || 0), 0);
  const totalCommission = transactions.reduce((sum, t) => sum + (t.commissionAmount || 0), 0);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Financial history fetched",
    data: {
      transactions,
      summary: {
        totalEarned,
        totalCommission,
        totalTrips: transactions.length,
        commissionPercent: driver.commissionPercent,
        allTimeEarnings: driver.totalEarnings,
      },
    },
  });
});
