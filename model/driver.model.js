import mongoose, { Schema } from "mongoose";

const driverSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Personal Info
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date },
    idNumber: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },

    profileImage: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },

    // Vehicle Info
    vehicleType: {
      type: String,
      enum: ["regular", "flatbed", "heavy"],
      required: true,
    },
    licenseNumber: { type: String, required: true, trim: true },
    vehicleYear: { type: Number },
    vehicleColor: { type: String, trim: true },
    towingCapacity: {
      type: Number,
      enum: [0, 1.5, 3, 5, 10],
      default: 3,
    },

    // Documents
    vehicleRegistration: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    insuranceDocument: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    cargoInsuranceDocument: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    vehicleRegistrationExpiresAt: { type: Date, default: null },
    insuranceExpiresAt: { type: Date, default: null },
    cargoInsuranceExpiresAt: { type: Date, default: null },

    // Account Settings
    username: { type: String, trim: true },
    operatingArea: [{ type: String }],
    commissionPercent: { type: Number, default: 15, min: 5, max: 30 },
    accountStatus: { type: Boolean, default: true },

    // Status
    availabilityStatus: {
      type: String,
      enum: ["available", "busy", "offline"],
      default: "offline",
    },

    rating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 },
    totalTrips: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    totalCommissionPaid: { type: Number, default: 0 },
    lastPaymentDate: { type: Date },
    paymentStatus: {
      type: String,
      enum: ["paid", "pending", "overdue"],
      default: "pending",
    },

    // Location
    currentLocation: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
    },

    isVerified: { type: Boolean, default: false },
    isBlocked: { type: Boolean, default: false },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

driverSchema.index({ currentLocation: "2dsphere" });

const Driver = mongoose.model("Driver", driverSchema);
export default Driver;
