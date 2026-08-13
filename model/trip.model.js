import mongoose, { Schema } from "mongoose";

const tripSchema = new Schema(
  {
    tripNumber: { type: String, unique: true },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },

    // Trip Type
    tripType: {
      type: String,
      enum: ["towing", "roadside", "flatbed", "new_booking"],
      default: "towing",
    },

    // Locations
    pickupLocation: {
      address: { type: String, required: true },
      coordinates: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },

    dropoffLocation: {
      address: { type: String, required: true },
      coordinates: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], default: [0, 0] },
      },
    },

    // Vehicle Info (customer's broken vehicle)
    vehicleInfo: {
      make: { type: String, default: "" },
      model: { type: String, default: "" },
      color: { type: String, default: "" },
      licensePlate: { type: String, default: "" },
      year: { type: Number },
      type: { type: String, default: "" }, // category: car / truck / motorcycle / etc.
    },

    // Pricing
    price: { type: Number, default: 0 },
    estimatedDistance: { type: Number, default: 0 }, // km
    estimatedDuration: { type: Number, default: 0 }, // minutes
    /** Snapshot of rate-card breakdown at booking time. */
    priceBreakdown: {
      basePrice: { type: Number, default: 0 },
      nightSurcharge: { type: Number, default: 0 },
      shabbatSurcharge: { type: Number, default: 0 },
      rescueFee: { type: Number, default: 0 },
      towingFee: { type: Number, default: 0 },
      serviceFee: { type: Number, default: 0 },
      taxableSubtotal: { type: Number, default: 0 },
      vat: { type: Number, default: 0 },
      vatPercent: { type: Number, default: 18 },
      total: { type: Number, default: 0 },
      includeRescue: { type: Boolean, default: false },
      isNight: { type: Boolean, default: false },
      isShabbat: { type: Boolean, default: false },
    },

    // Status
    status: {
      type: String,
      enum: ["pending", "accepted", "in_progress", "completed", "cancelled"],
      default: "pending",
    },

    cancellationReason: { type: String, default: "" },
    cancelledBy: { type: String, enum: ["customer", "driver", "admin", null], default: null },

    // Timestamps
    acceptedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },

    // Rating & Review
    customerRating: { type: Number, min: 1, max: 5, default: null },
    customerReview: { type: String, default: "" },
    driverRating: { type: Number, min: 1, max: 5, default: null },

    // Payment
    paymentMethod: {
      type: String,
      enum: ["cash", "card", "wallet"],
      default: "cash",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded"],
      default: "pending",
    },

    notes: { type: String, default: "" },

    // Drivers who declined this pending offer (so it is not shown to them again)
    rejectedByDrivers: [{ type: Schema.Types.ObjectId, ref: "Driver" }],

    // Driver's completion report (filled when finishing the tow)
    completionReport: {
      distanceKm: { type: Number, default: null },
      endTime: { type: String, default: "" },
      vehicleCondition: { type: String, default: "" },
      comments: { type: String, default: "" },
      vehiclePlacedCorrectly: { type: Boolean, default: false },
      customerConfirmed: { type: Boolean, default: false },
      noAdditionalDamage: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

// Auto-generate trip number
tripSchema.pre("save", async function () {
  if (!this.tripNumber) {
    const count = await mongoose.model("Trip").countDocuments();
    this.tripNumber = `TW${String(count + 1).padStart(4, "0")}`;
  }
});

tripSchema.index({ "pickupLocation.coordinates": "2dsphere" });
tripSchema.index({ "dropoffLocation.coordinates": "2dsphere" });

const Trip = mongoose.model("Trip", tripSchema);
export default Trip;
