import User from "../model/user.model.js";
import Driver from "../model/driver.model.js";
import Trip from "../model/trip.model.js";
import Transaction from "../model/transaction.model.js";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import httpStatus from "http-status";
import sendResponse from "../utils/sendResponse.js";

// ============ ADMIN: DASHBOARD OVERVIEW ============

export const getDashboardStats = catchAsync(async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    totalDrivers,
    availableDrivers,
    totalCustomers,
    todayTrips,
    totalTrips,
    completedTrips,
  ] = await Promise.all([
    Driver.countDocuments(),
    Driver.countDocuments({ availabilityStatus: "available" }),
    User.countDocuments({ role: "customer" }),
    Trip.countDocuments({ createdAt: { $gte: todayStart } }),
    Trip.countDocuments(),
    Trip.countDocuments({ status: "completed" }),
  ]);

  // Today's revenue
  const todayRevenueRaw = await Transaction.aggregate([
    { $match: { createdAt: { $gte: todayStart }, status: "completed" } },
    { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
  ]);

  // This month's revenue
  const thisMonthRevenueRaw = await Transaction.aggregate([
    { $match: { createdAt: { $gte: thisMonthStart }, status: "completed" } },
    { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
  ]);

  // Last month's revenue
  const lastMonthRevenueRaw = await Transaction.aggregate([
    { $match: { createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd }, status: "completed" } },
    { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
  ]);

  const thisMonthRevenue = thisMonthRevenueRaw[0]?.total || 0;
  const lastMonthRevenue = lastMonthRevenueRaw[0]?.total || 0;
  const revenueChange = lastMonthRevenue === 0
    ? 100
    : Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 * 10) / 10;

  // Average rating
  const avgRatingRaw = await Driver.aggregate([
    { $match: { totalRatings: { $gt: 0 } } },
    { $group: { _id: null, avgRating: { $avg: "$rating" } } },
  ]);
  const avgRating = Math.round((avgRatingRaw[0]?.avgRating || 0) * 10) / 10;

  // Weekly revenue trend (last 7 days)
  const weeklyRevenueTrend = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const rev = await Transaction.aggregate([
      { $match: { createdAt: { $gte: dayStart, $lte: dayEnd }, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$commissionAmount" } } },
    ]);

    weeklyRevenueTrend.push({
      date: dayStart.toISOString().split("T")[0],
      revenue: rev[0]?.total || 0,
    });
  }

  // Trip type distribution
  const tripTypeRaw = await Trip.aggregate([
    { $match: { status: "completed" } },
    { $group: { _id: "$tripType", count: { $sum: 1 } } },
  ]);

  const tripTypeDistribution = tripTypeRaw.map((item) => ({
    type: item._id,
    count: item.count,
    percent: completedTrips > 0 ? Math.round((item.count / completedTrips) * 100) : 0,
  }));

  // Recent trips
  const recentTrips = await Trip.find()
    .populate("customerId", "name phoneNumber profileImage")
    .populate("driverId", "firstName lastName")
    .sort({ createdAt: -1 })
    .limit(5);

  // Top drivers
  const topDrivers = await Driver.find({ totalTrips: { $gt: 0 } })
    .populate("userId", "name profileImage")
    .sort({ totalTrips: -1, totalEarnings: -1 })
    .limit(3)
    .select("firstName lastName totalTrips totalEarnings rating profileImage");

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Dashboard stats fetched",
    data: {
      stats: {
        avgRating,
        availableDrivers,
        todayRevenue: todayRevenueRaw[0]?.total || 0,
        todayTrips,
        totalDrivers,
        totalCustomers,
        totalTrips,
        completedTrips,
        thisMonthRevenue,
        revenueChangePercent: revenueChange,
      },
      weeklyRevenueTrend,
      tripTypeDistribution,
      recentTrips,
      topDrivers,
    },
  });
});

// ============ ADMIN: FINANCIAL ANALYTICS ============

export const getFinancialAnalytics = catchAsync(async (req, res) => {
  const { period = "month", fromDate, toDate } = req.query;

  let dateFilter = {};
  if (fromDate && toDate) {
    dateFilter = { $gte: new Date(fromDate), $lte: new Date(toDate) };
  } else {
    const now = new Date();
    if (period === "week") {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      dateFilter = { $gte: start };
    } else if (period === "month") {
      dateFilter = { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    } else if (period === "year") {
      dateFilter = { $gte: new Date(now.getFullYear(), 0, 1) };
    }
  }

  const matchQuery = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter, status: "completed" } : { status: "completed" };

  // Driver commissions list
  const driverCommissions = await Transaction.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: "$driverId",
        totalRevenue: { $sum: "$amount" },
        totalCommission: { $sum: "$commissionAmount" },
        driverEarnings: { $sum: "$driverEarnings" },
        totalTrips: { $sum: 1 },
        lastPayment: { $max: "$createdAt" },
      },
    },
    {
      $lookup: {
        from: "drivers",
        localField: "_id",
        foreignField: "_id",
        as: "driver",
      },
    },
    { $unwind: "$driver" },
    {
      $project: {
        _id: 0,
        driverId: "$_id",
        firstName: "$driver.firstName",
        lastName: "$driver.lastName",
        phoneNumber: "$driver.phoneNumber",
        profileImage: "$driver.profileImage",
        commissionPercent: "$driver.commissionPercent",
        paymentStatus: "$driver.paymentStatus",
        totalRevenue: 1,
        totalCommission: 1,
        driverEarnings: 1,
        totalTrips: 1,
        lastPayment: 1,
      },
    },
    { $sort: { totalRevenue: -1 } },
  ]);

  // Revenue summary
  const revenueSummary = await Transaction.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amount" },
        totalCommission: { $sum: "$commissionAmount" },
        totalDriverEarnings: { $sum: "$driverEarnings" },
        totalTransactions: { $sum: 1 },
      },
    },
  ]);

  // Daily revenue trend
  const dailyRevenueTrend = await Transaction.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        },
        totalRevenue: { $sum: "$amount" },
        totalCommission: { $sum: "$commissionAmount" },
      },
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    {
      $project: {
        _id: 0,
        date: {
          $concat: [
            { $toString: "$_id.year" }, "-",
            { $cond: [{ $lt: ["$_id.month", 10] }, { $concat: ["0", { $toString: "$_id.month" }] }, { $toString: "$_id.month" }] }, "-",
            { $cond: [{ $lt: ["$_id.day", 10] }, { $concat: ["0", { $toString: "$_id.day" }] }, { $toString: "$_id.day" }] },
          ],
        },
        totalRevenue: 1,
        totalCommission: 1,
      },
    },
  ]);

  // Recent transactions
  const recentTransactions = await Transaction.find(matchQuery)
    .populate("tripId", "tripNumber pickupLocation dropoffLocation")
    .populate("customerId", "name phoneNumber")
    .populate("driverId", "firstName lastName")
    .sort({ createdAt: -1 })
    .limit(10);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Financial analytics fetched",
    data: {
      summary: revenueSummary[0] || { totalRevenue: 0, totalCommission: 0, totalDriverEarnings: 0, totalTransactions: 0 },
      dailyRevenueTrend,
      driverCommissions,
      recentTransactions,
    },
  });
});

// ============ ADMIN: MARK DRIVER PAYMENT ============

export const markDriverPayment = catchAsync(async (req, res) => {
  const { driverId } = req.params;
  const { status = "paid" } = req.body;

  const driver = await Driver.findById(driverId);
  if (!driver) {
    throw new AppError(httpStatus.NOT_FOUND, "Driver not found");
  }

  driver.paymentStatus = status;
  driver.lastPaymentDate = new Date();
  await driver.save();

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: `Payment status updated to ${status}`,
    data: { paymentStatus: driver.paymentStatus, lastPaymentDate: driver.lastPaymentDate },
  });
});
