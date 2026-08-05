import Notification from "../model/notification.model.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";
import { toHebrew } from "../utils/heLocale.js";

function localizeNotification(doc) {
  const n = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  n.title = toHebrew(n.title);
  n.message = toHebrew(n.message);
  return n;
}

export const getMyNotifications = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Notification.countDocuments({ userId: req.user._id }),
    Notification.countDocuments({ userId: req.user._id, isRead: false }),
  ]);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notifications fetched",
    data: {
      notifications: notifications.map(localizeNotification),
      unreadCount,
    },
    meta: { total, page: Number(page), limit: Number(limit) },
  });
});

export const markAsRead = catchAsync(async (req, res) => {
  const { id } = req.params;

  await Notification.findOneAndUpdate(
    { _id: id, userId: req.user._id },
    { isRead: true, readAt: new Date() }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification marked as read",
    data: null,
  });
});

export const markAllAsRead = catchAsync(async (req, res) => {
  await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "All notifications marked as read",
    data: null,
  });
});

export const deleteNotification = catchAsync(async (req, res) => {
  const { id } = req.params;
  await Notification.findOneAndDelete({ _id: id, userId: req.user._id });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Notification deleted",
    data: null,
  });
});
