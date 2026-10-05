import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import Trip from "../model/trip.model.js";
import Driver from "../model/driver.model.js";
import User from "../model/user.model.js";
import Notification from "../model/notification.model.js";
import Terms from "../model/terms.model.js";
import { defaultTerms } from "../content/defaultTerms.js";
import { createTrip, estimateTrip } from "../controller/trip.controller.js";

const startApp = async () => {
  const app = express();
  app.use(express.json());
  app.post("/estimate", estimateTrip);
  app.post("/create", (req, _res, next) => {
    req.user = { _id: "507f1f77bcf86cd799439011", name: "Customer", phoneNumber: "+972501234567" };
    next();
  }, createTrip);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};

test("on-site estimate needs only the pickup location", async () => {
  const { server, url } = await startApp();
  try {
    const response = await fetch(`${url}/estimate`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripType: "on_site", pickupLat: 32.0853, pickupLng: 34.7818, vehicleType: "car" }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.data.distanceKm, 0);
    assert.equal(payload.data.distanceSource, "same_location");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("on-site website booking stores the pickup as its destination", async () => {
  const original = { createTrip: Trip.create, createNotification: Notification.create,
    findDriver: Driver.find, findUser: User.find, findTerms: Terms.findOne };
  Terms.findOne = () => ({ sort: () => ({ lean: async () => null }) });
  let created;
  Trip.create = async (data) => {
    created = data;
    return { _id: "507f1f77bcf86cd799439012", tripNumber: "TWTEST", ...data };
  };
  Notification.create = async () => ({});
  Driver.find = () => ({ select: async () => [] });
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  const { server, url } = await startApp();
  try {
    const response = await fetch(`${url}/create`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tripType: "on_site", pickupAddress: "Tel Aviv",
        pickupLat: 32.0853, pickupLng: 34.7818, vehicleInfo: { type: "car" },
        contactName: "Customer", contactPhone: "+972501234567",
        bookingSource: "website", termsAccepted: true, termsVersion: defaultTerms.version }),
    });
    assert.equal(response.status, 201);
    assert.equal(created.tripType, "on_site");
    assert.equal(created.dropoffLocation.address, created.pickupLocation.address);
    assert.deepEqual(created.dropoffLocation.coordinates.coordinates, created.pickupLocation.coordinates.coordinates);
    assert.equal(created.estimatedDistance, 0);
    assert.equal(created.termsVersion, defaultTerms.version);
    assert.ok(created.termsAcceptedAt instanceof Date);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    Trip.create = original.createTrip;
    Notification.create = original.createNotification;
    Driver.find = original.findDriver;
    User.find = original.findUser;
    Terms.findOne = original.findTerms;
  }
});
