import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
  {
    sender: { type: String, enum: ["customer", "admin"], required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User" },
    content: { type: String, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const supportTicketSchema = new Schema(
  {
    ticketNumber: { type: String, unique: true },

    customerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    tripId: {
      type: Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
    },

    subject: { type: String, required: true },
    messages: [messageSchema],

    status: {
      type: String,
      enum: ["open", "in_progress", "resolved", "closed"],
      default: "open",
    },

    priority: {
      type: String,
      enum: ["normal", "high", "urgent"],
      default: "normal",
    },

    isVipCustomer: { type: Boolean, default: false },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },

    // Quick actions (from figma)
    lastActionType: {
      type: String,
      enum: ["sms_sent", "trip_cancelled", "driver_transferred", "marked_vip", null],
      default: null,
    },
  },
  { timestamps: true }
);

supportTicketSchema.pre("save", async function (next) {
  if (!this.ticketNumber) {
    const count = await mongoose.model("SupportTicket").countDocuments();
    this.ticketNumber = `#${String(count + 1).padStart(4, "0")}`;
  }
  next();
});

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
export default SupportTicket;
