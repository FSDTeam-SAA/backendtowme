import SupportTicket from "../model/support.model.js";
import User from "../model/user.model.js";
import Trip from "../model/trip.model.js";
import Driver from "../model/driver.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";

// ============ CUSTOMER: CREATE SUPPORT TICKET ============

export const createTicket = catchAsync(async (req, res) => {
  const { subject, message, tripId } = req.body;

  if (!subject || !message) {
    throw new AppError(httpStatus.BAD_REQUEST, "Subject and message are required");
  }

  const user = await User.findById(req.user._id);

  const ticket = await SupportTicket.create({
    customerId: req.user._id,
    tripId: tripId || null,
    subject,
    messages: [{ sender: "customer", senderId: req.user._id, content: message }],
    isVipCustomer: user.isVip || false,
  });

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Support ticket created",
    data: ticket,
  });
});

// ============ CUSTOMER: GET MY TICKETS ============

export const getMyTickets = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [tickets, total] = await Promise.all([
    SupportTicket.find({ customerId: req.user._id })
      .populate("tripId", "tripNumber status pickupLocation dropoffLocation")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    SupportTicket.countDocuments({ customerId: req.user._id }),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tickets fetched",
    data: tickets,
    meta: { total, page: Number(page), limit: Number(limit) },
  });
});

// ============ CUSTOMER: SEND MESSAGE IN TICKET ============

export const sendCustomerMessage = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message) {
    throw new AppError(httpStatus.BAD_REQUEST, "Message is required");
  }

  const ticket = await SupportTicket.findOne({ _id: id, customerId: req.user._id });
  if (!ticket) {
    throw new AppError(httpStatus.NOT_FOUND, "Ticket not found");
  }

  if (ticket.status === "closed") {
    throw new AppError(httpStatus.BAD_REQUEST, "Ticket is closed");
  }

  ticket.messages.push({ sender: "customer", senderId: req.user._id, content: message });
  if (ticket.status === "resolved") ticket.status = "open";
  await ticket.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Message sent",
    data: ticket,
  });
});

// ============ ADMIN: GET ALL TICKETS ============

export const getAllTickets = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, priority, search } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const query = {};
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (search) {
    query.$or = [
      { ticketNumber: { $regex: search, $options: "i" } },
      { subject: { $regex: search, $options: "i" } },
    ];
  }

  const [tickets, total] = await Promise.all([
    SupportTicket.find(query)
      .populate("customerId", "name phoneNumber profileImage isVip")
      .populate("tripId", "tripNumber status driverId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    SupportTicket.countDocuments(query),
  ]);

  const open = await SupportTicket.countDocuments({ status: "open" });
  const inProgress = await SupportTicket.countDocuments({ status: "in_progress" });
  const resolved = await SupportTicket.countDocuments({ status: "resolved" });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Tickets fetched",
    data: {
      tickets,
      stats: { total, open, inProgress, resolved },
    },
    meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
  });
});

// ============ ADMIN: GET SINGLE TICKET ============

export const getTicketById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const ticket = await SupportTicket.findById(id)
    .populate("customerId", "name phoneNumber email profileImage isVip city createdAt")
    .populate("tripId", "tripNumber status driverId pickupLocation dropoffLocation createdAt price");

  if (!ticket) {
    throw new AppError(httpStatus.NOT_FOUND, "Ticket not found");
  }

  // Get customer's trip history
  const customerTrips = await Trip.find({ customerId: ticket.customerId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("tripNumber status createdAt price");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Ticket fetched",
    data: { ticket, customerTrips },
  });
});

// ============ ADMIN: REPLY TO TICKET ============

export const adminReply = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { message } = req.body;

  if (!message) {
    throw new AppError(httpStatus.BAD_REQUEST, "Message is required");
  }

  const ticket = await SupportTicket.findById(id);
  if (!ticket) {
    throw new AppError(httpStatus.NOT_FOUND, "Ticket not found");
  }

  ticket.messages.push({ sender: "admin", senderId: req.user._id, content: message });
  if (ticket.status === "open") ticket.status = "in_progress";
  await ticket.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Reply sent",
    data: ticket,
  });
});

// ============ ADMIN: UPDATE TICKET STATUS ============

export const updateTicketStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, priority } = req.body;

  const ticket = await SupportTicket.findById(id);
  if (!ticket) {
    throw new AppError(httpStatus.NOT_FOUND, "Ticket not found");
  }

  if (status) ticket.status = status;
  if (priority) ticket.priority = priority;
  if (status === "resolved") ticket.resolvedAt = new Date();

  await ticket.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Ticket updated",
    data: ticket,
  });
});

// ============ ADMIN: QUICK ACTIONS ============

export const quickAction = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  const ticket = await SupportTicket.findById(id).populate("customerId").populate("tripId");
  if (!ticket) {
    throw new AppError(httpStatus.NOT_FOUND, "Ticket not found");
  }

  let resultMessage = "";

  switch (action) {
    case "cancel_trip":
      if (ticket.tripId && ["pending", "accepted"].includes(ticket.tripId.status)) {
        await Trip.findByIdAndUpdate(ticket.tripId._id, {
          status: "cancelled",
          cancellationReason: "Cancelled via support",
          cancelledBy: "admin",
          cancelledAt: new Date(),
        });
        resultMessage = "Trip cancelled successfully";
      } else {
        throw new AppError(httpStatus.BAD_REQUEST, "No active trip to cancel");
      }
      break;

    case "mark_vip":
      await User.findByIdAndUpdate(ticket.customerId._id, { isVip: true });
      ticket.isVipCustomer = true;
      await ticket.save();
      resultMessage = "Customer marked as VIP";
      break;

    case "transfer_driver":
      if (ticket.tripId && ticket.tripId.driverId) {
        const newDriver = await Driver.findOne({ availabilityStatus: "available", _id: { $ne: ticket.tripId.driverId } });
        if (!newDriver) {
          throw new AppError(httpStatus.NOT_FOUND, "No available driver found");
        }
        await Trip.findByIdAndUpdate(ticket.tripId._id, { driverId: newDriver._id });
        await Driver.findByIdAndUpdate(ticket.tripId.driverId, { availabilityStatus: "available" });
        await Driver.findByIdAndUpdate(newDriver._id, { availabilityStatus: "busy" });
        resultMessage = "Driver transferred successfully";
      } else {
        throw new AppError(httpStatus.BAD_REQUEST, "No driver to transfer");
      }
      break;

    default:
      throw new AppError(httpStatus.BAD_REQUEST, "Unknown action");
  }

  ticket.lastActionType = action === "cancel_trip" ? "trip_cancelled" : action === "mark_vip" ? "marked_vip" : "driver_transferred";
  await ticket.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: resultMessage,
    data: null,
  });
});
