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
    thirdPartyInsuranceDocument: {
      public_id: { type: String, default: "" },
      url: { type: String, default: "" },
    },
    vehicleRegistrationExpiresAt: { type: Date, default: null },
    insuranceExpiresAt: { type: Date, default: null },
    cargoInsuranceExpiresAt: { type: Date, default: null },
    thirdPartyInsuranceExpiresAt: { type: Date, default: null },

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

    // Admin approval. A driver may not go online or receive calls until an
    // administrator approves them and every required document is on file.
    isVerified: { type: Boolean, default: false },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },

    isBlocked: { type: Boolean, default: false },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

/** Documents every driver must upload before they can be approved. */
export const REQUIRED_DRIVER_DOCUMENTS = Object.freeze([
  { field: "vehicleRegistration", label: "Vehicle license" },
  { field: "insuranceDocument", label: "Mandatory insurance" },
  { field: "cargoInsuranceDocument", label: "Cargo in transit insurance" },
  { field: "thirdPartyInsuranceDocument", label: "Third-party / comprehensive insurance" },
]);

driverSchema.methods.missingDocuments = function () {
  return REQUIRED_DRIVER_DOCUMENTS.filter(
    (doc) => !this[doc.field]?.url,
  ).map((doc) => doc.label);
};

/**
 * Whether this driver may go online, be dispatched, and accept calls.
 *
 * Admin approval is the gate. Documents are checked when an administrator
 * approves the driver, not here — otherwise adding a new required document
 * would instantly take every already-approved driver off the road.
 */
driverSchema.methods.canReceiveTrips = function () {
  return (
    this.isVerified === true &&
    this.isBlocked !== true &&
    this.accountStatus !== false
  );
};

driverSchema.index({ currentLocation: "2dsphere" });

const Driver = mongoose.model("Driver", driverSchema);
export default Driver;
