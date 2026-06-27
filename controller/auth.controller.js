import User from "../model/user.model.js";
import Driver from "../model/driver.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { createToken } from "../utils/authToken.js";
import { generateOTP } from "../utils/commonMethod.js";
import { sendEmail } from "../utils/sendEmail.js";

// ============= CUSTOMER AUTH =============

export const customerRegister = catchAsync(async (req, res) => {
  const { name, phoneNumber, email, password, confirmPassword } = req.body;

  if (!name || !phoneNumber || !password || !confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Name, phone, password and confirm password are required");
  }

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords do not match");
  }

  const exists = await User.findOne({ phoneNumber: phoneNumber.trim() });
  if (exists) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number already registered");
  }

  const user = await User.create({
    name: name.trim(),
    phoneNumber: phoneNumber.trim(),
    email: email ? email.toLowerCase().trim() : null,
    password,
    role: "customer",
  });

  const otp = generateOTP();
  user.setOTP(otp);
  await user.save();

  // In production: send OTP via SMS
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Registered successfully. OTP sent to your phone.",
    data: { phoneNumber: user.phoneNumber, otp }, // remove otp in production
  });
});

export const customerLogin = catchAsync(async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number and password are required");
  }

  const user = await User.findOne({ phoneNumber: phoneNumber.trim(), role: "customer" }).select("+password");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (user.isBlocked) {
    throw new AppError(httpStatus.FORBIDDEN, "Your account has been blocked. Please contact support.");
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Incorrect password");
  }

  const payload = { _id: user._id, phoneNumber: user.phoneNumber, role: user.role };
  const accessToken = createToken(payload, process.env.JWT_ACCESS_SECRET, "7d");
  const refreshToken = createToken(payload, process.env.JWT_REFRESH_SECRET, "30d");

  user.refreshToken = refreshToken;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Login successful",
    data: {
      _id: user._id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage,
      isVip: user.isVip,
      accessToken,
      refreshToken,
    },
  });
});

// ============= DRIVER AUTH =============

export const driverLogin = catchAsync(async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number and password are required");
  }

  const user = await User.findOne({ phoneNumber: phoneNumber.trim(), role: "driver" }).select("+password");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  if (user.isBlocked) {
    throw new AppError(httpStatus.FORBIDDEN, "Your account has been blocked. Contact support.");
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Incorrect password");
  }

  const driverProfile = await Driver.findOne({ userId: user._id });

  const payload = { _id: user._id, phoneNumber: user.phoneNumber, role: user.role };
  const accessToken = createToken(payload, process.env.JWT_ACCESS_SECRET, "7d");
  const refreshToken = createToken(payload, process.env.JWT_REFRESH_SECRET, "30d");

  user.refreshToken = refreshToken;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Login successful",
    data: {
      _id: user._id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      role: user.role,
      profileImage: user.profileImage,
      driverProfile: driverProfile
        ? {
            _id: driverProfile._id,
            firstName: driverProfile.firstName,
            lastName: driverProfile.lastName,
            vehicleType: driverProfile.vehicleType,
            availabilityStatus: driverProfile.availabilityStatus,
            rating: driverProfile.rating,
            totalTrips: driverProfile.totalTrips,
          }
        : null,
      accessToken,
      refreshToken,
    },
  });
});

// ============= SHARED OTP =============

export const verifyOTP = catchAsync(async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number and OTP are required");
  }

  const user = await User.findOne({ phoneNumber: phoneNumber.trim() });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isOTPValid(otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  user.isPhoneVerified = true;
  user.clearOTP();
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Phone verified successfully",
  });
});

export const forgetPassword = catchAsync(async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number is required");
  }

  const user = await User.findOne({ phoneNumber: phoneNumber.trim() });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const otp = generateOTP();
  user.setResetPasswordOTP(otp);
  await user.save();

  // In production: send SMS
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your phone",
    data: { phoneNumber: user.phoneNumber, otp }, // remove otp in production
  });
});

export const verifyResetOTP = catchAsync(async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number and OTP are required");
  }

  const user = await User.findOne({ phoneNumber: phoneNumber.trim() });

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isResetPasswordOTPValid(otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP verified",
    data: { phoneNumber: user.phoneNumber, resetOtpVerified: true },
  });
});

export const resetPassword = catchAsync(async (req, res) => {
  const { phoneNumber, otp, password, confirmPassword } = req.body;

  if (!phoneNumber || !otp || !password || !confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "All fields are required");
  }

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords do not match");
  }

  const user = await User.findOne({ phoneNumber: phoneNumber.trim() }).select("+password");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isResetPasswordOTPValid(otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  user.password = password;
  user.clearResetPasswordOTP();
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Password reset successful",
  });
});

export const logout = catchAsync(async (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized");
  }

  await User.findByIdAndUpdate(userId, { refreshToken: "" });
  res.clearCookie("refreshToken");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Logged out successfully",
    data: {},
  });
});

export const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    throw new AppError(httpStatus.BAD_REQUEST, "Refresh token required");
  }

  let decoded;
  try {
    const jwt = await import("jsonwebtoken");
    decoded = jwt.default.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded._id);
  if (!user || user.refreshToken !== token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
  }

  const payload = { _id: user._id, phoneNumber: user.phoneNumber, role: user.role };
  const newAccessToken = createToken(payload, process.env.JWT_ACCESS_SECRET, "7d");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Token refreshed",
    data: { accessToken: newAccessToken },
  });
});

// ============= ADMIN AUTH =============

export const adminLogin = catchAsync(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError(httpStatus.BAD_REQUEST, "Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim(), role: "admin" }).select("+password");

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "Admin not found");
  }

  const match = await user.comparePassword(password);
  if (!match) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Incorrect password");
  }

  const payload = { _id: user._id, email: user.email, role: user.role };
  const accessToken = createToken(payload, process.env.JWT_ACCESS_SECRET, "1d");
  const refreshToken = createToken(payload, process.env.JWT_REFRESH_SECRET, "7d");

  user.refreshToken = refreshToken;
  await user.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Admin login successful",
    data: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage,
      accessToken,
      refreshToken,
    },
  });
});
