/**
 * Official towing rate card (מחירון גרירות).
 *
 * Base by distance bands; over 100 km → 2200 + (km − 100) × 20.
 * Extras on BASE only: rescue +400, Shabbat/holidays +50%, night 00:00–06:00 +50%.
 * Service fee ₪25 is added before VAT. VAT 18% (rounded for display).
 */

export const PRICING = {
  serviceFee: 25,
  vatPercent: 18,
  avgSpeedKmh: 40,
  pickupBufferMin: 12,
  rescueFee: 400,
  over100PerKm: 20,
  /** Inclusive upper-km → base price (before VAT / surcharges). */
  distanceTiers: [
    { maxKm: 10, price: 400 },
    { maxKm: 20, price: 600 },
    { maxKm: 30, price: 800 },
    { maxKm: 40, price: 1000 },
    { maxKm: 50, price: 1200 },
    { maxKm: 60, price: 1400 },
    { maxKm: 70, price: 1600 },
    { maxKm: 80, price: 1800 },
    { maxKm: 90, price: 2000 },
    { maxKm: 100, price: 2200 },
  ],
};

export const haversineKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

/** Round to 1 decimal place (km). */
export const roundKm = (km) => Math.round((Number(km) || 0) * 10) / 10;

/**
 * Distance-tier base towing price (before surcharges / fee / VAT).
 * Whole extra km above 100 are charged via ceil so fractional km bills a full km.
 */
export const distanceBasePrice = (distanceKm) => {
  const km = Math.max(0, Number(distanceKm) || 0);
  if (km <= 0) return PRICING.distanceTiers[0].price;
  for (const tier of PRICING.distanceTiers) {
    if (km <= tier.maxKm) return tier.price;
  }
  const overKm = Math.ceil(km - 100);
  return 2200 + overKm * PRICING.over100PerKm;
};

export const israelDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { weekday, hour, minute, minutesOfDay: hour * 60 + minute };
};

/** Night: 00:00–06:00 Israel time. */
export const isNightShift = (date = new Date()) => {
  const { hour } = israelDateParts(date);
  return hour >= 0 && hour < 6;
};

/** Shabbat window: Friday 15:00 → Saturday 21:00 (Israel). */
export const isShabbatWindow = (date = new Date()) => {
  const { weekday, minutesOfDay } = israelDateParts(date);
  if (weekday === "Fri" && minutesOfDay >= 15 * 60) return true;
  if (weekday === "Sat" && minutesOfDay < 21 * 60) return true;
  return false;
};

/**
 * Full fare breakdown.
 * Order: base → +rescue → +50% night of base → +50% Shabbat of base → +service fee → VAT.
 *
 * @param {number} distanceKm
 * @param {{ includeRescue?: boolean, at?: Date, forceNight?: boolean, forceShabbat?: boolean }} [opts]
 */
export const calculateTowingFare = (distanceKm, opts = {}) => {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const includeRescue = Boolean(opts.includeRescue);
  const base = distanceBasePrice(distanceKm);
  const night =
    typeof opts.forceNight === "boolean" ? opts.forceNight : isNightShift(at);
  const shabbat =
    typeof opts.forceShabbat === "boolean"
      ? opts.forceShabbat
      : isShabbatWindow(at);

  // 50% of BASE only — never of VAT-inclusive or rescue-inclusive amounts.
  const nightSurcharge = night ? Math.round(base * 0.5) : 0;
  const shabbatSurcharge = shabbat ? Math.round(base * 0.5) : 0;
  const rescueFee = includeRescue ? PRICING.rescueFee : 0;

  const towingFee = base + rescueFee + nightSurcharge + shabbatSurcharge;
  const serviceFee = PRICING.serviceFee;
  const taxableSubtotal = towingFee + serviceFee;
  const vat = Math.round((taxableSubtotal * PRICING.vatPercent) / 100);
  const total = taxableSubtotal + vat;

  return {
    basePrice: base,
    nightSurcharge,
    shabbatSurcharge,
    rescueFee,
    towingFee,
    serviceFee,
    taxableSubtotal,
    vat,
    vatPercent: PRICING.vatPercent,
    total,
    isNight: night,
    isShabbat: shabbat,
  };
};
