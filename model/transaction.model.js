import mongoose, { Schema } from "mongoose";

const transactionSchema = new Schema(
  {
    transactionId: { type: String, unique: true },

    tripId: {
      type: Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
    },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    driverId: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
    },

    amount: { type: Number, required: true },
    commissionPercent: { type: Number, default: 15 },
    commissionAmount: { type: Number, default: 0 },
    driverEarnings: { type: Number, default: 0 },

    type: {
      type: String,
      enum: ["trip_payment", "commission", "refund", "bonus"],
      default: "trip_payment",
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "card", "wallet"],
      default: "cash",
    },

    status: {
      type: String,
      enum: ["completed", "pending", "cancelled", "refunded"],
      default: "completed",
    },

    description: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

transactionSchema.pre("save", async function () {
  if (!this.transactionId) {
    const count = await mongoose.model("Transaction").countDocuments();
    this.transactionId = `TX${String(count + 1).padStart(6, "0")}`;
  }
  if (this.amount && this.commissionPercent) {
    this.commissionAmount = (this.amount * this.commissionPercent) / 100;
    this.driverEarnings = this.amount - this.commissionAmount;
  }
});

const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
