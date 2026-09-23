import {
  calculateTowingFare,
  calculateCancellationFee,
  distanceBasePrice,
  isJewishHoliday,
  normalizeVehicleType,
  normalizeWeightBand,
} from "./towingPricing.js";

let failed = 0;
const assertEq = (label, actual, expected) => {
  if (actual !== expected) {
    failed += 1;
    console.error(`FAIL ${label}: got ${actual}, expected ${expected}`);
  } else {
    console.log(`OK   ${label}: ${actual}`);
  }
};

const priceCases = [
  ["car 5km", 5, { vehicleType: "car" }, 300],
  ["car 5.1km", 5.1, { vehicleType: "car" }, 302],
  ["car 10km", 10, { vehicleType: "car" }, 400],
  ["motorcycle 10km", 10, { vehicleType: "motorcycle" }, 200],
  ["motorcycle 11km", 11, { vehicleType: "motorcycle" }, 215],
  ["truck 2.6-5", 10, { vehicleType: "truck", weightBand: "2.6-5" }, 600],
  ["truck 5.1-8", 10, { vehicleType: "truck", weightBand: "5.1-8" }, 1500],
  ["truck 8.1-12", 10, { vehicleType: "truck", weightBand: "8.1-12" }, 1800],
  ["truck 12.1-20", 10, { vehicleType: "truck", weightBand: "12.1-20" }, 2500],
  ["truck 20.1-60", 10, { vehicleType: "truck", weightBand: "20.1-60" }, 4800],
  ["truck additional km", 11, { vehicleType: "truck", weightBand: "2.6-5" }, 618],
  ["work equipment", 12, { vehicleType: "work_equipment", weightBand: "5.1-8" }, 1536],
];

for (const [label, km, options, expected] of priceCases) {
  assertEq(label, distanceBasePrice(km, options), expected);
}

assertEq("localized private alias", normalizeVehicleType("פרטי"), "car");
assertEq("numeric truck weight", normalizeWeightBand(7.2), "5.1-8");

const car = calculateTowingFare(5, {
  vehicleType: "car", includeRescue: true,
  forceNight: false, forceShabbat: false, forceHoliday: false,
});
assertEq("car rescue", car.rescueFee, 400);
assertEq("service fee", car.serviceFee, 25);
assertEq("car taxable subtotal", car.taxableSubtotal, 725);
assertEq("car VAT", car.vat, 130.5);
assertEq("car total", car.total, 855.5);

const motorcycle = calculateTowingFare(10, {
  vehicleType: "motorcycle", includeRescue: true,
  forceNight: false, forceShabbat: false, forceHoliday: false,
});
assertEq("motorcycle rescue", motorcycle.rescueFee, 200);
assertEq("motorcycle total", motorcycle.total, 501.5);

const surcharges = calculateTowingFare(5, {
  vehicleType: "car", forceNight: true, forceShabbat: true, forceHoliday: false,
});
assertEq("night surcharge", surcharges.nightSurcharge, 150);
assertEq("Shabbat surcharge", surcharges.shabbatSurcharge, 150);
assertEq("night and Shabbat total", surcharges.total, 737.5);

const holiday = calculateTowingFare(5, {
  vehicleType: "car", forceNight: false, forceShabbat: false, forceHoliday: true,
});
assertEq("holiday surcharge", holiday.holidaySurcharge, 150);
assertEq("Rosh Hashanah detection", isJewishHoliday(new Date("2026-09-12T09:00:00Z")), true);

const cancelAt = new Date("2026-09-22T12:00:00Z");
const minutesAgo = (m) => new Date(cancelAt.getTime() - m * 60000);
const cancelFee = (opts) =>
  calculateCancellationFee({ fullFare: 855.5, at: cancelAt, ...opts });

assertEq("cancel before a driver accepts", cancelFee({ acceptedAt: null }).fee, 0);
assertEq("cancel 2 min after accept", cancelFee({ acceptedAt: minutesAgo(2) }).fee, 0);
assertEq("cancel 5 min after accept", cancelFee({ acceptedAt: minutesAgo(5) }).fee, 150);
assertEq("cancel 20 min after accept", cancelFee({ acceptedAt: minutesAgo(20) }).fee, 150);
assertEq(
  "cancel once driver arrived",
  cancelFee({ acceptedAt: minutesAgo(20), arrivedAt: minutesAgo(3) }).fee,
  855.5,
);
assertEq(
  "cancel once the job started",
  cancelFee({ acceptedAt: minutesAgo(20), startedAt: minutesAgo(1) }).fee,
  855.5,
);
assertEq(
  "arrival beats the 5-minute tier",
  cancelFee({ acceptedAt: minutesAgo(2), arrivedAt: minutesAgo(1) }).reason,
  "driver_arrived",
);

let missingWeightRejected = false;
try {
  distanceBasePrice(10, { vehicleType: "truck" });
} catch (error) {
  missingWeightRejected = error instanceof RangeError;
}
assertEq("truck requires weight", missingWeightRejected, true);

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll towing pricing tests passed successfully!");
