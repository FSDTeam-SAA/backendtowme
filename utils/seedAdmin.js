/**
 * Run once to create admin account:
 * node utils/seedAdmin.js
 */
import "dotenv/config";
import mongoose from "mongoose";
import User from "../model/user.model.js";

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_DB_URL);
    console.log("MongoDB connected");

    const exists = await User.findOne({ role: "admin" });
    if (exists) {
      console.log("Admin already exists:", exists.email);
      process.exit(0);
    }

    const admin = await User.create({
      name: "TOW ME Admin",
      email: "admin@towme.com",
      phoneNumber: "0500000000",
      password: "Admin@1234",
      role: "admin",
      isPhoneVerified: true,
      isEmailVerified: true,
    });

    console.log("✅ Admin created:");
    console.log("  Email:", admin.email);
    console.log("  Password: Admin@1234");
    console.log("  Role:", admin.role);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

seedAdmin();
