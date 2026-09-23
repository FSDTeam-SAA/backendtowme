/**
 * Create or update an administrator account.
 *
 * Credentials are passed in, never hard-coded, so they do not end up committed
 * to the repository.
 *
 *   node utils/createAdmin.js --email admin@example.com --password 'secret' --name 'TOW ME Admin'
 *
 * Re-running with an existing email resets that admin's password.
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
  arg("--phone") || process.env.ADMIN_PHONE || "0500000000",
);

async function run() {
  if (!email || !password) {
    throw new Error(
      "Usage: node utils/createAdmin.js --email <email> --password <password> [--name <name>] [--phone <phone>]",
    );
  }
  if (!process.env.MONGO_DB_URL) {
    throw new Error("MONGO_DB_URL is not set");
  }

  await mongoose.connect(process.env.MONGO_DB_URL);

  const existing = await User.findOne({ email }).select("+password");

  if (existing) {
    existing.name = name;
    existing.role = "admin";
    existing.password = password; // re-hashed by the model's pre-save hook
    existing.isEmailVerified = true;
    existing.isPhoneVerified = true;
    existing.isBlocked = false;
    await existing.save();
    console.log(`Updated existing admin: ${existing.email}`);
  } else {
    const admin = await User.create({
      name,
      email,
      phoneNumber,
      password,
      role: "admin",
      isPhoneVerified: true,
      isEmailVerified: true,
    });
    console.log(`Created admin: ${admin.email}`);
  }

  const total = await User.countDocuments({ role: "admin" });
  console.log(`Total admin accounts: ${total}`);
}

run()
  .catch((error) => {
    console.error("Failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
