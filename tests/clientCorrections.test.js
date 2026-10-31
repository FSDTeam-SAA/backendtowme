import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getManufacturers, getModels } from '../controller/vehicle.controller.js';
import { estimateTrip, createTrip, quoteDestinationChange, changeDestination } from '../controller/trip.controller.js';
import { updateDriverProfile } from '../controller/driver.controller.js';
import { HEBREW_VEHICLE_BRANDS } from '../utils/israeliVehicleBrands.js';
import Driver from '../model/driver.model.js';
import User from '../model/user.model.js';
import Trip from '../model/trip.model.js';
import Notification from '../model/notification.model.js';
import Terms from '../model/terms.model.js';
import { defaultTerms } from '../content/defaultTerms.js';

const invoke = (handler, req) => new Promise((resolve, reject) => {
  const res = { status(code) { this.statusCode = code; return this; },
    json(body) { resolve({ status: this.statusCode, ...body }); } };
  handler(req, res, reject);
});

test('vehicle API keeps PDF names and resolves new brands and older registry spellings', async () => {
  const original = globalThis.fetch;
  const registrySpellings = [
    ['אווטאר', 'Avatr', 'אוואטר'],
    ['איווייז', 'Aiways', 'איוויס'],
    ['איון', 'Aion', 'איוון'],
    ['אלפין', 'Alpine', 'אלפיין'],
    ['בי.וי.די', 'BYD', 'בי.ווי.די'],
    ['מזראטי', 'Maserati', 'מזארטי'],
    ['פורטינג', 'Forthing', 'פורתינג'],
    ['OMODA', 'Omoda', 'אומודה'],
    ['Eveasy', 'EVEASY', 'איביזי'],
  ];
  const records = [
    { tozeret_cd: 11, tozar: 'Toyota' },
    { tozeret_cd: 12, tozar: 'טויוטה' },
    ...registrySpellings.map(([tozar], index) => ({ tozeret_cd: 100 + index, tozar })),
  ];
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: true,
    result: { total: records.length, records } }) });
  try {
    const result = await invoke(getManufacturers, { query: {} });
    assert.equal(result.status, 200);
    assert.equal(result.data.length, 77);
    assert.deepEqual(result.data.map((brand) => brand.name), HEBREW_VEHICLE_BRANDS.map(([name]) => name));
    assert.deepEqual(result.data.find((brand) => brand.canonical === 'Toyota').codes, [11, 12]);
    registrySpellings.forEach(([, canonical, name], index) => {
      const brand = result.data.find((item) => item.canonical === canonical);
      assert.equal(brand.name, name);
      assert.deepEqual(brand.codes, [100 + index]);
    });
    const other = result.data.find((brand) => brand.canonical === 'Other');
    assert.ok(other.id < 0);
    assert.deepEqual((await invoke(getModels, { query: { manufacturerId: other.id } })).data, []);
    assert.equal((await invoke(getManufacturers, { query: { q: 'Toyota' } })).data[0].name, 'טויוטה');
  } finally { globalThis.fetch = original; }
});

test('Dolly selection reaches the estimate and persisted booking without stacking recovery charges', async () => {
  const original = { trip: Trip.create, notification: Notification.create,
    driver: Driver.find, user: User.find, terms: Terms.findOne };
  Terms.findOne = () => ({ sort: () => ({ lean: async () => null }) });
  let stored;
  Trip.create = async (data) => { stored = data; return { ...data, _id: '507f1f77bcf86cd799439012', tripNumber: 'DOLLY' }; };
  Notification.create = async () => ({});
  Driver.find = () => ({ select: async () => [] });
  User.find = () => ({ select: () => ({ lean: async () => [] }) });
  try {
    const body = { pickupLat: 32, pickupLng: 34, dropoffLat: 32, dropoffLng: 34,
      pickupAddress: 'Pickup', dropoffAddress: 'Destination', tripType: 'towing',
      vehicleType: 'car', vehicleInfo: { type: 'car' }, includeDolly: true,
      includeRescue: true, notes: 'תקלה: חילוץ דולי',
      termsAccepted: true, termsVersion: defaultTerms.version };
    const estimate = await invoke(estimateTrip, { body });
    assert.equal(estimate.data.dollyFee, 600);
    assert.equal(estimate.data.rescueFee, 0);
    assert.equal(estimate.data.includeRescue, false);
    const created = await invoke(createTrip, { body,
      user: { _id: '507f1f77bcf86cd799439011', name: 'Customer', phoneNumber: '+972506319777' } });
    assert.equal(created.status, 201);
    assert.equal(stored.priceBreakdown.includeDolly, true);
    assert.equal(stored.priceBreakdown.dollyFee, 600);
    assert.equal(stored.priceBreakdown.rescueFee, 0);
    assert.equal(stored.price, estimate.data.total);
    // Mongoose must retain these fields in the database snapshot.
    const document = new Trip(stored).toObject();
    assert.equal(document.priceBreakdown.dollyFee, 600);
    assert.equal(document.priceBreakdown.includeDolly, true);
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    Trip.create = original.trip; Notification.create = original.notification;
    Driver.find = original.driver; User.find = original.user; Terms.findOne = original.terms;
  }
});

test('profile photo upload persists the same retrievable photo in driver and user records', async () => {
  const original = { findOne: Driver.findOne, findById: Driver.findById, update: User.findByIdAndUpdate };
  const previousCwd = process.cwd();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'towme-photo-test-'));
  const cloudKeys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const savedEnv = cloudKeys.map((key) => process.env[key]);
  const driver = { _id: 'driver', profileImage: { url: '' }, async save() {} };
  let userUpdates;
  Driver.findOne = async () => driver;
  Driver.findById = () => ({ populate: async () => ({ ...driver, userId: userUpdates }) });
  User.findByIdAndUpdate = async (_id, update) => { userUpdates = update; };
  try {
    cloudKeys.forEach((key) => { delete process.env[key]; });
    process.chdir(directory);
    const photo = Buffer.from('uploaded-photo-bytes');
    const result = await invoke(updateDriverProfile, { body: {}, user: { _id: 'user' },
      files: { profileImage: [{ buffer: photo }] } });
    assert.equal(result.status, 200);
    assert.ok(driver.profileImage.url.includes('/public/towme/drivers/profiles/'));
    assert.deepEqual(userUpdates.profileImage, driver.profileImage);
    assert.equal(result.data.profileImage.url, driver.profileImage.url);
    const relative = new URL(driver.profileImage.url).pathname.replace(/^\//, '');
    assert.deepEqual(await fs.readFile(path.join(directory, relative)), photo);
  } finally {
    process.chdir(previousCwd);
    cloudKeys.forEach((key, i) => { if (savedEnv[i] === undefined) delete process.env[key]; else process.env[key] = savedEnv[i]; });
    Driver.findOne = original.findOne; Driver.findById = original.findById; User.findByIdAndUpdate = original.update;
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('changing a Dolly destination retains its fixed recovery surcharge', async () => {
  const original = Trip.findOne;
  const trip = { status: 'accepted', vehicleInfo: { type: 'car' },
    pickupLocation: { coordinates: { coordinates: [34, 32] } },
    dropoffLocation: { address: 'Old destination', coordinates: { coordinates: [34, 32] } },
    priceBreakdown: { includeDolly: true, includeRescue: false,
      isNight: false, isShabbat: false, isHoliday: false, serviceFee: 25 },
    price: 1091.5, destinationHistory: [], async save() {} };
  Trip.findOne = async () => trip;
  try {
    const req = { params: { id: 'trip' }, user: { _id: 'customer' },
      body: { dropoffAddress: 'New destination', dropoffLat: 32, dropoffLng: 34 } };
    const quote = await invoke(quoteDestinationChange, req);
    assert.equal(quote.data.priceBreakdown.dollyFee, 600);
    await invoke(changeDestination, { ...req,
      body: { ...req.body, confirmed: true, expectedPrice: quote.data.price } });
    assert.equal(trip.priceBreakdown.includeDolly, true);
    assert.equal(trip.priceBreakdown.dollyFee, 600);
    assert.equal(trip.priceBreakdown.rescueFee, 0);
    assert.equal(trip.price, 1091.5);
  } finally { Trip.findOne = original; }
});
