import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import express from "express";
import User from "../model/user.model.js";
import Driver from "../model/driver.model.js";
import { isMasterAdmin, protect, requireAdminPermission } from "../middleware/auth.middleware.js";
import driverRoutes from "../route/driver.route.js";
import { logout } from "../controller/auth.controller.js";

const account = (role, password, adminUsername) => new User({
  name: "Test Manager", email: "manager@example.com", phoneNumber: "+972501234567",
  role, password, adminUsername,
});

test("manager PIN is exactly four digits and customer passwords stay longer", async () => {
  await account("admin", "1234", "test manager").validate();
  await assert.rejects(account("admin", "12345", "test manager").validate());
  const pendingManager = account("admin", "a".repeat(64), "pending manager");
  pendingManager.pinSetupPending = true;
  await pendingManager.validate();
  await assert.rejects(account("admin", "a".repeat(64), "test manager").validate());
  const master = account("admin", "long-master-password", "test master");
  master.isMasterAdmin = true;
  await master.validate();
  await assert.rejects(account("customer", "1234").validate());
});

test("approved drivers still need every required document and an active account", () => {
  const driver = new Driver({ isVerified: true, accountStatus: true, isBlocked: false,
    vehicleRegistration: { url: "vehicle" }, insuranceDocument: { url: "mandatory" },
    cargoInsuranceDocument: { url: "cargo" }, thirdPartyInsuranceDocument: { url: "third-party" },
  });
  assert.equal(driver.canReceiveTrips(), true);
  driver.thirdPartyInsuranceDocument.url = "";
  assert.equal(driver.canReceiveTrips(), false);
  driver.thirdPartyInsuranceDocument.url = "third-party";
  driver.isBlocked = true;
  assert.equal(driver.canReceiveTrips(), false);
});

const runGate = (user) => new Promise((resolve) => {
  requireAdminPermission("drivers")({ user }, {}, (error) => resolve(error || null));
});

test("only the master or an explicitly permitted manager may manage drivers", async () => {
  assert.equal(await runGate({ role: "admin", isMasterAdmin: true }), null);
  assert.equal(await runGate({ role: "admin", adminPermissions: ["drivers"] }), null);
  assert.equal((await runGate({ role: "admin", adminPermissions: ["drivers"], mustChangePin: true })).statusCode, 403);
  assert.equal((await runGate({ role: "admin", adminPermissions: ["support"] })).statusCode, 403);
  assert.equal((await runGate({ role: "customer", adminPermissions: ["drivers"] })).statusCode, 403);
});

test("only the single master may reach administrator management", async () => {
  const run = (user) => new Promise((resolve) => {
    isMasterAdmin({ user }, {}, (error) => resolve(error || null));
  });
  assert.equal(await run({ role: "admin", isMasterAdmin: true }), null);
  assert.equal((await run({ role: "admin", isMasterAdmin: false })).statusCode, 403);
});

test("an old administrator token is rejected after a PIN reset", async () => {
  const originalFind = User.findById;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "admin-access-test-secret";
  User.findById = async () => ({ role: "admin", authVersion: 2, isBlocked: false });
  try {
    const token = jwt.sign({ _id: "507f1f77bcf86cd799439011", authVersion: 1 }, process.env.JWT_ACCESS_SECRET);
    const error = await new Promise((resolve) => {
      protect({ headers: { authorization: `Bearer ${token}` } }, {}, (nextError) => resolve(nextError || null));
    });
    assert.equal(error?.statusCode, 401);
  } finally {
    User.findById = originalFind;
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  }
});

test("a manager with driver access cannot create a driver account", async () => {
  const originalFind = User.findById;
  const previousSecret = process.env.JWT_ACCESS_SECRET;
  process.env.JWT_ACCESS_SECRET = "admin-access-test-secret";
  User.findById = async () => ({
    role: "admin", isMasterAdmin: false, adminPermissions: ["drivers"],
    authVersion: 0, isBlocked: false,
  });
  const app = express();
  app.use("/drivers", driverRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const token = jwt.sign({ _id: "507f1f77bcf86cd799439011", authVersion: 0 }, process.env.JWT_ACCESS_SECRET);
    const response = await fetch(`http://127.0.0.1:${server.address().port}/drivers`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    User.findById = originalFind;
    if (previousSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousSecret;
  }
});

test("administrator logout invalidates issued access tokens", async () => {
  const originalUpdate = User.findByIdAndUpdate;
  let update;
  User.findByIdAndUpdate = async (_id, value) => { update = value; };
  try {
    await new Promise((resolve, reject) => {
      const res = { clearCookie() {}, status() { return this; }, json: resolve };
      logout({ user: { _id: "507f1f77bcf86cd799439011", role: "admin" } }, res, reject);
    });
    assert.equal(update.$set.refreshToken, "");
    assert.equal(update.$inc.authVersion, 1);
  } finally {
    User.findByIdAndUpdate = originalUpdate;
  }
});
