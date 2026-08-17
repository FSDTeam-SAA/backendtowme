/**
 * Run: node utils/towingPricing.test.js
 */
import {
  distanceBasePrice,
  calculateTowingFare,
} from "./towingPricing.js";

let failed = 0;
const assertEq = (label, actual, expected) => {
  if (Math.abs(actual - expected) > 0.01) {
    failed += 1;
    console.error(`FAIL ${label}: got ${actual}, expected ${expected}`);
  } else {
    console.log(`OK   ${label}: ${actual}`);
  }
};

// Base price by decimal distance (before fee / VAT)
const baseCases = [
  [1.0, 400],
  [5.0, 400],
  [9.9, 400],
  [10.0, 400],
  [10.1, 402],
  [11.0, 420],
  [11.2, 424],
  [14.3, 486],
  [19.9, 598],
  [20.0, 600],
  [20.1, 602],
  [21.0, 620],
  [29.9, 798],
  [30.0, 800],
  [40.0, 1000],
  [50.0, 1200],
  [60.0, 1400],
  [61.6, 1432],
  [70.0, 1600],
  [80.0, 1800],
  [90.0, 2000],
  [99.8, 2196],
  [100.0, 2200],
  [100.1, 2202],
  [101.0, 2220],
  [101.5, 2230],
  [105.7, 2314],
  [120.0, 2600],
  [500.0, 10200],
];

for (const [km, expected] of baseCases) {
  assertEq(`base ${km} km`, distanceBasePrice(km), expected);
}

// Decimal VAT test cases (14.3 KM & 61.6 KM)
const fare14_3 = calculateTowingFare(14.3, { includeRescue: false, forceNight: false, forceShabbat: false });
assertEq("14.3 KM base", fare14_3.basePrice, 486);
assertEq("14.3 KM taxable", fare14_3.taxableSubtotal, 486 + 25);
assertEq("14.3 KM VAT", fare14_3.vat, Math.round((486 + 25) * 0.18));

const fare61_6 = calculateTowingFare(61.6, { includeRescue: false, forceNight: false, forceShabbat: false });
assertEq("61.6 KM base", fare61_6.basePrice, 1432);
assertEq("61.6 KM taxable", fare61_6.taxableSubtotal, 1432 + 25);
assertEq("61.6 KM VAT", fare61_6.vat, Math.round((1432 + 25) * 0.18));

// 500 km full payment breakdown (no night / Shabbat / rescue)
const fare500 = calculateTowingFare(500, {
  includeRescue: false,
  forceNight: false,
  forceShabbat: false,
});
assertEq("500 base", fare500.basePrice, 10200);
assertEq("500 towingFee", fare500.towingFee, 10200);
assertEq("500 serviceFee", fare500.serviceFee, 25);
assertEq("500 taxable", fare500.taxableSubtotal, 10225);
assertEq("500 vat", fare500.vat, 1841);
assertEq("500 total", fare500.total, 12066);

// Rescue stacks on base
const fareRescue = calculateTowingFare(10, {
  includeRescue: true,
  forceNight: false,
  forceShabbat: false,
});
assertEq("rescue towing", fareRescue.towingFee, 400 + 400);
assertEq("rescue fee line", fareRescue.rescueFee, 400);

// Night 50% of BASE only
const fareNight = calculateTowingFare(10, {
  includeRescue: false,
  forceNight: true,
  forceShabbat: false,
});
assertEq("night surcharge", fareNight.nightSurcharge, 200);
assertEq("night towing", fareNight.towingFee, 600);

// Shabbat 50% of BASE only
const fareShabbat = calculateTowingFare(10, {
  includeRescue: false,
  forceNight: false,
  forceShabbat: true,
});
assertEq("shabbat surcharge", fareShabbat.shabbatSurcharge, 200);

// Overlap guard: Night + Shabbat does not stack double 50%
const fareOverlap = calculateTowingFare(100, {
  includeRescue: true,
  forceNight: true,
  forceShabbat: true,
});
assertEq("overlap base", fareOverlap.basePrice, 2200);
assertEq("overlap night", fareOverlap.nightSurcharge, 1100);
assertEq("overlap shabbat", fareOverlap.shabbatSurcharge, 0);
assertEq("overlap rescue", fareOverlap.rescueFee, 400);
assertEq("overlap towing", fareOverlap.towingFee, 2200 + 1100 + 400);

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll towing pricing tests passed successfully!");
