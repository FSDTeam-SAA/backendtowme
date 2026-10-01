import test from "node:test";
import assert from "node:assert/strict";
import Driver from "../model/driver.model.js";
import Transaction from "../model/transaction.model.js";
import { getDriverFinancials } from "../controller/driver.controller.js";

test("new transactions remain pending until payment settlement", () => {
  const transaction = new Transaction({
    tripId: "507f1f77bcf86cd799439011", customerId: "507f1f77bcf86cd799439012",
    driverId: "507f1f77bcf86cd799439013", amount: 100,
  });
  assert.equal(transaction.status, "pending");
});

test("pending and refunded transactions do not count as settled driver earnings", async () => {
  const original = { findDriver: Driver.findOne, findTransactions: Transaction.find,
    aggregate: Transaction.aggregate };
  Driver.findOne = async () => ({ _id: "507f1f77bcf86cd799439013", commissionPercent: 15 });
  Transaction.find = () => ({ populate: () => ({ sort: async () => [
    { type: "trip_payment", status: "completed", driverEarnings: 85, commissionAmount: 15 },
    { type: "trip_payment", status: "pending", driverEarnings: 170, commissionAmount: 30 },
    { type: "trip_payment", status: "refunded", driverEarnings: 255, commissionAmount: 45 },
  ] }) });
  Transaction.aggregate = async () => [{ total: 85 }];
  try {
    const payload = await new Promise((resolve, reject) => {
      const response = { status(code) { assert.equal(code, 200); return this; }, json: resolve };
      getDriverFinancials({ user: { _id: "507f1f77bcf86cd799439011" }, query: { period: "month" } },
        response, reject);
    });
    assert.equal(payload.data.summary.totalEarned, 85);
    assert.equal(payload.data.summary.totalCommission, 15);
    assert.equal(payload.data.summary.pendingEarnings, 170);
    assert.equal(payload.data.summary.allTimeEarnings, 85);
  } finally {
    Driver.findOne = original.findDriver;
    Transaction.find = original.findTransactions;
    Transaction.aggregate = original.aggregate;
  }
});
