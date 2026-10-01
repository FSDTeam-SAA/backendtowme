import Transaction from "../model/transaction.model.js";

/** Earnings displayed as collected, never merely quoted or pending. */
export const settledDriverEarnings = async (driverIds) => {
  if (!driverIds.length) return new Map();
  const rows = await Transaction.aggregate([
    { $match: {
      driverId: { $in: driverIds },
      status: "completed",
      type: { $in: ["trip_payment", "cancellation_fee"] },
    } },
    { $group: { _id: "$driverId", amount: { $sum: "$driverEarnings" } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.amount || 0]));
};
