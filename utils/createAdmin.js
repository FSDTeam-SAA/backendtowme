/**
 * Bootstrap or rotate the single master administrator account.
 *
 * Credentials are passed in, never hard-coded, so they do not end up committed
 * to the repository.
 *
 *   node utils/createAdmin.js --email admin@example.com --password 'secret' --name 'TOW ME Admin'
 *   node utils/createAdmin.js --promote-existing
 *
 * Once a master exists, only that account may be updated here. Other managers
 * are created through authenticated master-only API routes.
 */
import "dotenv/config";
import mongoose from "mongoose";
import User from "../model/user.model.js";
import { normalizePhoneNumber } from "./phoneNumber.js";

const arg = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
};

const email = (arg("--email") || process.env.ADMIN_EMAIL || "").toLowerCase().trim();
const password = arg("--password") || process.env.ADMIN_PASSWORD;
const name = arg("--name") || process.env.ADMIN_NAME || "TOW ME Admin";
const phoneNumber = normalizePhoneNumber(
  arg("--phone") || process.env.ADMIN_PHONE || "",
);
const promoteExisting = process.argv.includes("--promote-existing");

async function run() {
  if (!promoteExisting && (!email || !password || !/^\+972\d{9}$/.test(phoneNumber))) {
    throw new Error(
      "Usage: node utils/createAdmin.js --email <email> --password <password> [--name <name>] [--phone <phone>]",
    );
  }
  if (!process.env.MONGO_DB_URL) {
    throw new Error("MONGO_DB_URL is not set");
  }

  await mongoose.connect(process.env.MONGO_DB_URL);

  if (promoteExisting) {
    const admins = await User.find({ role: "admin" });
    if (admins.length !== 1) {
      throw new Error("Promotion requires exactly one existing administrator");
    }
    const admin = admins[0];
    const master = await User.findOne({ isMasterAdmin: true });
    if (master && master._id.toString() !== admin._id.toString()) {
      throw new Error("A different master administrator already exists");
    }
    if (!admin.isMasterAdmin) {
      admin.isMasterAdmin = true;
      admin.adminUsername = admin.name.trim().toLowerCase();
      admin.authVersion = (admin.authVersion || 0) + 1;
      admin.refreshToken = null;
      await admin.save();
    }
    console.log("Existing administrator is the single Master Administrator");
    return;
  }

  const existing = await User.findOne({ email }).select("+password");
  const master = await User.findOne({ isMasterAdmin: true });
  if (master && master._id.toString() !== existing?._id?.toString()) {
    throw new Error("A master administrator already exists; use the master account to manage other administrators");
  }

  if (existing) {
    if (existing.role !== "admin") throw new Error("Email belongs to a non-administrator account");
    existing.name = name;
    existing.role = "admin";
    existing.isMasterAdmin = true;
    existing.adminUsername = name.trim().toLowerCase();
    existing.password = password; // re-hashed by the model's pre-save hook
    existing.authVersion = (existing.authVersion || 0) + 1;
    existing.isEmailVerified = true;
    existing.isPhoneVerified = true;
    existing.isBlocked = false;
    existing.phoneNumber = phoneNumber;
    await existing.save();
    console.log(`Updated existing admin: ${existing.email}`);
  } else {
    const admin = await User.create({
      name,
      adminUsername: name.trim().toLowerCase(),
      email,
      phoneNumber,
      password,
      role: "admin",
      isMasterAdmin: true,
      isPhoneVerified: true,
      isEmailVerified: true,
    });
    console.log(`Created admin: ${admin.email}`);
  }

  console.log("Single master administrator ready");
}

run()
  .catch((error) => {
    console.error("Failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
