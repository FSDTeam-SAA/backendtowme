import User from "../model/user.model.js";
import Trip from "../model/trip.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { uploadOnCloudinary } from "../utils/commonMethod.js";

// ============ CUSTOMER: GET MY PROFILE ============

export const getCustomerProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id).select("-password -refreshToken -otp -resetPasswordOtp");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const totalTrips = await Trip.countDocuments({ customerId: req.user._id });
  const completedTrips = await Trip.countDocuments({ customerId: req.user._id, status: "completed" });
  const lastTrip = await Trip.findOne({ customerId: req.user._id }).sort({ createdAt: -1 }).lean();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile fetched",
    data: { ...user.toObject(), totalTrips, completedTrips, lastTrip },
  });
});

// ============ CUSTOMER: UPDATE MY PROFILE ============

export const updateCustomerProfile = catchAsync(async (req, res) => {
  const { name, email, city } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (name) user.name = name.trim();
  if (email) user.email = email.toLowerCase().trim();
  if (city) user.city = city.trim();

  if (req.file) {
    const uploaded = await uploadOnCloudinary(req.file.buffer, { folder: "towme/customers/profiles" });
    user.profileImage = { public_id: uploaded.public_id, url: uploaded.secure_url };
  }

  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Profile updated",
    data: user,
  });
});

// ============ CUSTOMER: CHANGE PASSWORD ============

export const changeCustomerPassword = catchAsync(async (req, res) => {
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

// ============ ADMIN: GET ALL CUSTOMERS ============

export const getAllCustomers = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, search, city, status, fromDate, toDate } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const query = { role: "customer" };

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { phoneNumber: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (city) query.city = { $regex: city, $options: "i" };
  if (status === "active") query.isBlocked = false;
  else if (status === "blocked") query.isBlocked = true;

  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) query.createdAt.$lte = new Date(toDate);
  }

  const [users, total] = await Promise.all([
    User.find(query)
      .select("-password -refreshToken -otp -resetPasswordOtp")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    User.countDocuments(query),
  ]);

  // Add trip count to each customer
  const customersWithTrips = await Promise.all(
    users.map(async (u) => {
      const [totalTrips, totalPaid] = await Promise.all([
        Trip.countDocuments({ customerId: u._id }),
        Trip.aggregate([
          { $match: { customerId: u._id, status: "completed" } },
          { $group: { _id: null, total: { $sum: "$price" } } },
        ]),
      ]);
      const lastTrip = await Trip.findOne({ customerId: u._id }).sort({ createdAt: -1 }).lean();
      return {
        ...u.toObject(),
        totalTrips,
        totalPaid: totalPaid[0]?.total || 0,
        lastActivity: lastTrip?.createdAt || u.createdAt,
      };
    })
  );

  const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const newThisMonth = await User.countDocuments({ role: "customer", createdAt: { $gte: thisMonth } });
  const active = await User.countDocuments({ role: "customer", isBlocked: false });
  const vip = await User.countDocuments({ role: "customer", isVip: true });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Customers fetched",
    data: {
      customers: customersWithTrips,
      stats: { total, active, vip, newThisMonth },
    },
    meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
  });
});

// ============ ADMIN: GET SINGLE CUSTOMER ============

export const getCustomerById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, role: "customer" }).select("-password -refreshToken -otp -resetPasswordOtp");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Customer not found");
  }

  const [trips, totalPaid] = await Promise.all([
    Trip.find({ customerId: id })
      .populate("driverId", "firstName lastName vehicleType")
      .sort({ createdAt: -1 })
      .limit(20),
    Trip.aggregate([
      { $match: { customerId: user._id, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$price" } } },
    ]),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Customer fetched",
    data: {
      customer: user,
      trips,
      totalPaid: totalPaid[0]?.total || 0,
    },
  });
});

// ============ ADMIN: TOGGLE CUSTOMER BLOCK ============

export const toggleCustomerBlock = catchAsync(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, role: "customer" });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Customer not found");
  }

  user.isBlocked = !user.isBlocked;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: user.isBlocked ? "Customer blocked" : "Customer unblocked",
    data: { isBlocked: user.isBlocked },
  });
});

// ============ ADMIN: TOGGLE VIP STATUS ============

export const toggleVipStatus = catchAsync(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, role: "customer" });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Customer not found");
  }

  user.isVip = !user.isVip;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: user.isVip ? "Customer marked as VIP" : "VIP status removed",
    data: { isVip: user.isVip },
  });
});

// ============ ADMIN: DELETE CUSTOMER ============

export const deleteCustomer = catchAsync(async (req, res) => {
  const { id } = req.params;

  const user = await User.findOne({ _id: id, role: "customer" });
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Customer not found");
  }

  await User.findByIdAndDelete(id);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Customer deleted",
    data: null,
  });
});
