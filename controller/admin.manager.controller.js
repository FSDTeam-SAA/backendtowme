import httpStatus from "http-status";
import User from "../model/user.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import { normalizePhoneNumber } from "../utils/phoneNumber.js";
import { randomBytes } from "node:crypto";

export const ADMIN_PERMISSIONS = ["dashboard", "drivers", "trips", "customers", "finance", "support", "settings"];
const managerFields = "name adminUsername email phoneNumber adminPermissions isBlocked pinSetupPending createdAt";
const managerView = (manager) => ({
  _id: manager._id,
  name: manager.name,
  adminUsername: manager.adminUsername,
  email: manager.email,
  phoneNumber: manager.phoneNumber,
  adminPermissions: manager.adminPermissions,
  isBlocked: manager.isBlocked,
  pinSetupPending: manager.pinSetupPending,
  createdAt: manager.createdAt,
});

const parsePermissions = (value) => {
  if (!Array.isArray(value) || value.some((item) => !ADMIN_PERMISSIONS.includes(item))) {
    throw new AppError(httpStatus.BAD_REQUEST, "Invalid administrator permissions");
  }
  return [...new Set(value)];
};

export const listManagers = catchAsync(async (req, res) => {
  const managers = await User.find({ role: "admin", isMasterAdmin: { $ne: true } })
    .select(managerFields).sort({ createdAt: -1 });
  sendResponse(res, { statusCode: httpStatus.OK, success: true,
    message: "Administrators fetched", data: managers });
});

export const createManager = catchAsync(async (req, res) => {
  const name = String(req.body.name || "").trim();
  const adminUsername = name.toLowerCase();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
  const adminPermissions = parsePermissions(req.body.adminPermissions || []);
  if (!name || !email || !/^\+972\d{9}$/.test(phoneNumber)) {
    throw new AppError(httpStatus.BAD_REQUEST, "Name, email and Israeli phone are required");
  }
  if (await User.findOne({ $or: [{ adminUsername }, { email }, { phoneNumber }] })) {
    throw new AppError(httpStatus.CONFLICT, "Name, email or phone is already in use");
  }
  const manager = await User.create({ name, adminUsername, email, phoneNumber,
    password: randomBytes(32).toString("hex"), role: "admin", adminPermissions,
    mustChangePin: true, pinSetupPending: true,
    isEmailVerified: true, isPhoneVerified: true });
  sendResponse(res, { statusCode: httpStatus.CREATED, success: true,
    message: "Administrator created", data: managerView(manager) });
});

export const updateManager = catchAsync(async (req, res) => {
  const manager = await User.findOne({ _id: req.params.id, role: "admin", isMasterAdmin: { $ne: true } })
    .select("+password");
  if (!manager) throw new AppError(httpStatus.NOT_FOUND, "Administrator not found");
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new AppError(httpStatus.BAD_REQUEST, "Name is required");
    manager.name = name;
    manager.adminUsername = name.toLowerCase();
  }
  if (req.body.email !== undefined) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Valid email is required");
    }
    manager.email = email;
  }
  if (req.body.phoneNumber !== undefined) {
    const phoneNumber = normalizePhoneNumber(req.body.phoneNumber);
    if (!/^\+972\d{9}$/.test(phoneNumber)) {
      throw new AppError(httpStatus.BAD_REQUEST, "Valid Israeli phone is required");
    }
    manager.phoneNumber = phoneNumber;
  }
  if (req.body.adminPermissions !== undefined) {
    manager.adminPermissions = parsePermissions(req.body.adminPermissions);
  }
  if (req.body.isBlocked !== undefined) {
    manager.isBlocked = req.body.isBlocked === true;
    manager.authVersion = (manager.authVersion || 0) + 1;
  }
  const duplicate = await User.findOne({ _id: { $ne: manager._id }, $or: [
    { adminUsername: manager.adminUsername }, { email: manager.email }, { phoneNumber: manager.phoneNumber },
  ] });
  if (duplicate) throw new AppError(httpStatus.CONFLICT, "Name, email or phone is already in use");
  await manager.save();
  if (manager.isBlocked) {
    manager.refreshToken = null;
    await manager.save();
  }
  sendResponse(res, { statusCode: httpStatus.OK, success: true,
    message: "Administrator updated", data: managerView(manager) });
});
