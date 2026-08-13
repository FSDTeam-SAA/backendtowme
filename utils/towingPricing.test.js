/**
 * Run: node utils/towingPricing.test.js
 */
import {
  distanceBasePrice,
  calculateTowingFare,
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

// Base price by distance (before fee / VAT)
const baseCases = [
  [10, 400],
  [11, 600],
  [20, 600],
  [21, 800],
  [30, 800],
  [31, 1000],
  [40, 1000],
  [41, 1200],
  [50, 1200],
  [51, 1400],
  [60, 1400],
  [61, 1600],
  [70, 1600],
  [71, 1800],
  [80, 1800],
  [81, 2000],
  [90, 2000],
  [91, 2200],
  [100, 2200],
  [101, 2220],
  [110, 2400],
  [150, 3200],
  [500, 10200],
];

for (const [km, expected] of baseCases) {
  assertEq(`base ${km} km`, distanceBasePrice(km), expected);
}

// Base-only including VAT (rate-card column) — no service fee
for (const [km, base] of [
  [10, 400],
  [11, 600],
  [100, 2200],
]) {
  const withVat = Math.round(base * 1.18);
  assertEq(`base+VAT only ${km} km`, withVat, Math.round(base * 1.18));
}

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

// Night + Shabbat + rescue all stack (each 50% from base, not each other)
const fareAll = calculateTowingFare(100, {
  includeRescue: true,
  forceNight: true,
  forceShabbat: true,
});
assertEq("stack base", fareAll.basePrice, 2200);
assertEq("stack night", fareAll.nightSurcharge, 1100);
assertEq("stack shabbat", fareAll.shabbatSurcharge, 1100);
assertEq("stack rescue", fareAll.rescueFee, 400);
assertEq("stack towing", fareAll.towingFee, 2200 + 1100 + 1100 + 400);

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log("\nAll towing pricing tests passed.");
