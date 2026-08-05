import User from "../model/user.model.js";
import Driver from "../model/driver.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { createToken } from "../utils/authToken.js";
import { generateOTP } from "../utils/commonMethod.js";
import { deliverOtp } from "../utils/sendOtp.js";
import { findUserByPhone, normalizePhoneNumber } from "../utils/phoneNumber.js";

// ============= CUSTOMER AUTH =============

export const customerRegister = catchAsync(async (req, res) => {
  const { name, phoneNumber, email, password, confirmPassword } = req.body;

  if (!phoneNumber || !password || !confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone, password and confirm password are required");
  }

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords do not match");
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  const exists = await findUserByPhone(User, normalizedPhone);
  if (exists) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number already registered");
  }

  const userPayload = {
    // Name is optional in the app's register flow (phone + password only).
    name: name?.trim() || `לקוח ${normalizedPhone.slice(-4)}`,
    phoneNumber: normalizedPhone,
    password,
    role: "customer",
  };
  if (email?.trim()) {
    userPayload.email = email.toLowerCase().trim();
  }

  const user = await User.create(userPayload);

  const otp = generateOTP();
  user.setOTP(otp);
  await user.save();

  await deliverOtp(user.phoneNumber, otp);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Registered successfully. OTP sent to your phone.",
    data: {
      phoneNumber: user.phoneNumber,
      // Expose the OTP outside production to allow testing without SMS delivery.
      ...(process.env.NODE_ENV !== "production" ? { devOtp: otp } : {}),
    },
  });
});

/**
 * Passwordless login for the customer app (Figma flow: phone -> OTP -> in).
 * Auto-registers the phone as a customer on first use, then sends an OTP.
 * The OTP is verified via the shared /auth/verify-otp endpoint.
 */
export const customerOtpRequest = catchAsync(async (req, res) => {
  const { phoneNumber, name } = req.body;

  if (!phoneNumber) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number is required");
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  let user = await findUserByPhone(User, normalizedPhone);
  const isNewUser = !user;

  if (user && user.role !== "customer") {
    throw new AppError(httpStatus.BAD_REQUEST, "This phone number is registered as a driver");
  }

  if (user?.isBlocked) {
    throw new AppError(httpStatus.FORBIDDEN, "Your account has been blocked. Please contact support.");
  }

  if (!user) {
    user = await User.create({
      name: name?.trim() || `לקוח ${normalizedPhone.slice(-4)}`,
      phoneNumber: normalizedPhone,
      // Random throwaway password; this account is used via OTP only.
      password: `Otp!${generateOTP(10)}`,
      role: "customer",
    });
  }

  const otp = generateOTP();
  user.setOTP(otp);
  await user.save();

  await deliverOtp(user.phoneNumber, otp);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your phone",
    data: {
      phoneNumber: user.phoneNumber,
      isNewUser,
      // Expose the OTP outside production to allow testing without SMS delivery.
      ...(process.env.NODE_ENV !== "production" ? { devOtp: otp } : {}),
    },
  });
});

export const customerLogin = catchAsync(async (req, res) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number and password are required");
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  const user = await findUserByPhone(User, normalizedPhone, { role: "customer" }, "+password");

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

export const driverRegister = catchAsync(async (req, res) => {
  const { phoneNumber, email, password, confirmPassword } = req.body;

  if (!phoneNumber || !password || !confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number, password and confirm password are required");
  }

  if (password !== confirmPassword) {
    throw new AppError(httpStatus.BAD_REQUEST, "Passwords do not match");
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  const exists = await findUserByPhone(User, normalizedPhone);
  if (exists) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number already registered");
  }

  if (email) {
    const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (emailExists) {
      throw new AppError(httpStatus.BAD_REQUEST, "Email already registered");
    }
  }

  const userPayload = {
    name: `נהג ${normalizedPhone}`,
    phoneNumber: normalizedPhone,
    password,
    role: "driver",
  };
  if (email?.trim()) {
    userPayload.email = email.toLowerCase().trim();
  }

  const user = await User.create(userPayload);

  await Driver.create({
    userId: user._id,
    firstName: "נהג",
    lastName: "חדש",
    phoneNumber: normalizedPhone,
    email: email ? email.toLowerCase().trim() : "",
    vehicleType: "regular",
    licenseNumber: "ממתין",
    availabilityStatus: "offline",
    isVerified: false,
  });

  const otp = generateOTP();
  user.setOTP(otp);
  await user.save();

  await deliverOtp(normalizedPhone, otp);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Registered successfully. OTP sent to your phone.",
    data: { phoneNumber: user.phoneNumber },
  });
});

export const driverLogin = catchAsync(async (req, res) => {
  const { phoneNumber, email, password } = req.body;

  if ((!phoneNumber && !email) || !password) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone or email and password are required");
  }

  let user;
  if (phoneNumber) {
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
    }
    user = await findUserByPhone(User, normalizedPhone, { role: "driver" }, "+password");
  } else {
    user = await User.findOne({
      email: email.toLowerCase().trim(),
      role: "driver",
    }).select("+password");
  }

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

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  const user = await findUserByPhone(User, normalizedPhone);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  if (!user.isOTPValid(otp)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
  }

  user.isPhoneVerified = true;
  user.clearOTP();

  const payload = { _id: user._id, phoneNumber: user.phoneNumber, role: user.role };
  const accessToken = createToken(payload, process.env.JWT_ACCESS_SECRET, "7d");
  const refreshToken = createToken(payload, process.env.JWT_REFRESH_SECRET, "30d");

  user.refreshToken = refreshToken;
  await user.save();

  let driverProfile = null;
  if (user.role === "driver") {
    const driver = await Driver.findOne({ userId: user._id });
    if (driver) {
      driverProfile = {
        _id: driver._id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        vehicleType: driver.vehicleType,
        availabilityStatus: driver.availabilityStatus,
        rating: driver.rating,
        totalTrips: driver.totalTrips,
      };
    }
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Phone verified successfully",
    data: {
      _id: user._id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage,
      driverProfile,
      accessToken,
      refreshToken,
    },
  });
});

export const resendOTP = catchAsync(async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number is required");
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  const user = await findUserByPhone(User, normalizedPhone);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const otp = generateOTP();
  user.setOTP(otp);
  await user.save();

  await deliverOtp(user.phoneNumber, otp);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP resent to your phone",
    data: { phoneNumber: user.phoneNumber },
  });
});

export const forgetPassword = catchAsync(async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number is required");
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  const user = await findUserByPhone(User, normalizedPhone);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, "User not found");
  }

  const otp = generateOTP();
  user.setResetPasswordOTP(otp);
  await user.save();

  await deliverOtp(user.phoneNumber, otp);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "OTP sent to your phone",
    data: { phoneNumber: user.phoneNumber },
  });
});

export const verifyResetOTP = catchAsync(async (req, res) => {
  const { phoneNumber, otp } = req.body;

  if (!phoneNumber || !otp) {
    throw new AppError(httpStatus.BAD_REQUEST, "Phone number and OTP are required");
  }

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  const user = await findUserByPhone(User, normalizedPhone);

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

  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid phone number is required");
  }

  const user = await findUserByPhone(User, normalizedPhone, {}, "+password");

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
