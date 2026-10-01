import jwt from "jsonwebtoken";
import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import User from "../model/user.model.js";
import catchAsync from "../utils/catchAsync.js";

export const protect = catchAsync(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Token not found");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  } catch (error) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Invalid or expired token");
  }

  const user = await User.findById(decoded._id);
  if (!user) {
    throw new AppError(httpStatus.UNAUTHORIZED, "User not found");
  }

  if (user.role === "admin" && Number(decoded.authVersion || 0) !== Number(user.authVersion || 0)) {
    throw new AppError(httpStatus.UNAUTHORIZED, "Administrator session expired");
  }

  if (user.isBlocked) {
    throw new AppError(httpStatus.FORBIDDEN, "Your account has been blocked. Contact support.");
  }

  req.user = user;
  next();
});

export const isAdmin = catchAsync(async (req, res, next) => {
  if (req.user?.role !== "admin") {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied. Admin only.");
  }
  next();
});

export const isMasterAdmin = catchAsync(async (req, res, next) => {
  if (req.user?.role !== "admin" || req.user?.isMasterAdmin !== true) {
    throw new AppError(httpStatus.FORBIDDEN, "Master administrator access required");
  }

  next();
});

export const requireAdminPermission = (permission) => catchAsync(async (req, res, next) => {
  if (req.user?.role !== "admin" ||
      (!req.user.isMasterAdmin &&
       (req.user.mustChangePin || !req.user.adminPermissions?.includes(permission)))) {
    throw new AppError(httpStatus.FORBIDDEN, `Missing administrator permission: ${permission}`);
  }
  next();
});

export const isDriver = catchAsync(async (req, res, next) => {
  if (req.user?.role !== "driver") {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied. Driver only.");
  }
  next();
});

export const isCustomer = catchAsync(async (req, res, next) => {
  if (req.user?.role !== "customer") {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied. Customer only.");
  }
  next();
});

export const isAdminOrDriver = catchAsync(async (req, res, next) => {
  if (!["admin", "driver"].includes(req.user?.role)) {
    throw new AppError(httpStatus.FORBIDDEN, "Access denied.");
  }
  next();
});
