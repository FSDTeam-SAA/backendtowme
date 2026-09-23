/** Official TOW-ME towing rate card. All listed prices exclude 18% VAT. */

export const VEHICLE_TYPES = Object.freeze({
  CAR: "car",
  MOTORCYCLE: "motorcycle",
  TRUCK: "truck",
  WORK_EQUIPMENT: "work_equipment",
});

export const TRUCK_WEIGHT_BANDS = Object.freeze({
  "2.6-5": 600,
  "5.1-8": 1500,
  "8.1-12": 1800,
  "12.1-20": 2500,
  "20.1-60": 4800,
});

export const PRICING = Object.freeze({
  vatPercent: 18,
  serviceFee: 25,
  avgSpeedKmh: 40,
  pickupBufferMin: 12,
  vehicles: Object.freeze({
    car: Object.freeze({ includedKm: 5, basePrice: 300, additionalKmPrice: 20, rescueFee: 400 }),
    motorcycle: Object.freeze({ includedKm: 10, basePrice: 200, additionalKmPrice: 15, rescueFee: 200 }),
    truck: Object.freeze({ includedKm: 10, additionalKmPrice: 18, rescueFee: 400 }),
    work_equipment: Object.freeze({ includedKm: 10, additionalKmPrice: 18, rescueFee: 400 }),
  }),
});

/**
 * Cancellation policy shown on the customer's cancellation-warning screen.
 * The fee only starts once a driver is committed to the job — a pending trip
 * nobody accepted costs nothing to drop.
 */
export const CANCELLATION = Object.freeze({
  freeWindowMinutes: 5,
  lateFee: 150,
});

export const calculateCancellationFee = ({
  acceptedAt,
  arrivedAt,
  startedAt,
  fullFare = 0,
  at = new Date(),
} = {}) => {
  // startedAt counts as arrival: the driver app moves straight to in_progress
  // once the driver reaches the customer and begins the job.
  if (arrivedAt || startedAt) {
    return { fee: Number(Number(fullFare).toFixed(2)), reason: "driver_arrived" };
  }
  if (!acceptedAt) {
    return { fee: 0, reason: "no_driver_assigned" };
  }

  const elapsedMinutes = (at.getTime() - new Date(acceptedAt).getTime()) / 60000;
  if (elapsedMinutes < CANCELLATION.freeWindowMinutes) {
    return { fee: 0, reason: "within_free_window" };
  }
  return { fee: CANCELLATION.lateFee, reason: "late_cancellation" };
};

const VEHICLE_ALIASES = new Map([
  ["car", VEHICLE_TYPES.CAR], ["private", VEHICLE_TYPES.CAR],
  ["private_car", VEHICLE_TYPES.CAR], ["suv", VEHICLE_TYPES.CAR],
  ["van", VEHICLE_TYPES.CAR], ["פרטי", VEHICLE_TYPES.CAR],
  ["רכב פרטי", VEHICLE_TYPES.CAR], ["motorcycle", VEHICLE_TYPES.MOTORCYCLE],
  ["scooter", VEHICLE_TYPES.MOTORCYCLE], ["אופנוע", VEHICLE_TYPES.MOTORCYCLE],
  ["truck", VEHICLE_TYPES.TRUCK], ["heavy", VEHICLE_TYPES.TRUCK],
  ["משאית", VEHICLE_TYPES.TRUCK], ["work_equipment", VEHICLE_TYPES.WORK_EQUIPMENT],
  ["work equipment", VEHICLE_TYPES.WORK_EQUIPMENT],
  ["work vehicle", VEHICLE_TYPES.WORK_EQUIPMENT],
  ["forklift", VEHICLE_TYPES.WORK_EQUIPMENT], ["כלי עבודה", VEHICLE_TYPES.WORK_EQUIPMENT],
]);

export const normalizeVehicleType = (value) => {
  const key = String(value || "").trim().toLowerCase().replaceAll("-", "_");
  return VEHICLE_ALIASES.get(key) || null;
};

export const normalizeWeightBand = (value) => {
  const text = String(value || "").trim().toLowerCase().replace(/\s*(tons?|tonnes?|t|nis)\s*/g, "");
  if (Object.hasOwn(TRUCK_WEIGHT_BANDS, text)) return text;
  const weight = Number(value);
  if (!Number.isFinite(weight)) return null;
  if (weight >= 2.6 && weight <= 5) return "2.6-5";
  if (weight > 5 && weight <= 8) return "5.1-8";
  if (weight > 8 && weight <= 12) return "8.1-12";
  if (weight > 12 && weight <= 20) return "12.1-20";
  if (weight > 20 && weight <= 60) return "20.1-60";
  return null;
};

export const requiresWeightBand = (vehicleType) =>
  vehicleType === VEHICLE_TYPES.TRUCK || vehicleType === VEHICLE_TYPES.WORK_EQUIPMENT;

export const haversineKm = (lat1, lng1, lat2, lng2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

export const roundKm = (km) => Math.round((Number(km) || 0) * 10) / 10;

export const distanceBasePrice = (distanceKm, { vehicleType = "car", weightBand } = {}) => {
  const type = normalizeVehicleType(vehicleType);
  if (!type) throw new RangeError("Unsupported vehicle type");
  const rate = PRICING.vehicles[type];
  let basePrice = rate.basePrice;
  if (requiresWeightBand(type)) {
    const band = normalizeWeightBand(weightBand);
    if (!band) throw new RangeError("A valid vehicle weight band is required");
    basePrice = TRUCK_WEIGHT_BANDS[band];
  }
  const km = Math.max(0, Number(distanceKm) || 0);
  const extraKm = Math.max(0, km - rate.includedKm);
  return Number((basePrice + extraKm * rate.additionalKmPrice).toFixed(2));
};

export const israelDateParts = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit",
    minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  return { weekday: get("weekday"), hour, minute, minutesOfDay: hour * 60 + minute };
};

export const isNightShift = (date = new Date()) => {
  const { hour } = israelDateParts(date);
  return hour >= 0 && hour < 6;
};

export const isShabbatWindow = (date = new Date()) => {
  const { weekday, minutesOfDay } = israelDateParts(date);
  return (weekday === "Fri" && minutesOfDay >= 15 * 60) ||
    (weekday === "Sat" && minutesOfDay < 21 * 60);
};

/** Major Jewish public holidays observed in Israel, using the Hebrew calendar. */
export const isJewishHoliday = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-u-ca-hebrew", {
    timeZone: "Asia/Jerusalem", day: "numeric", month: "long",
  }).formatToParts(date);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const month = (parts.find((part) => part.type === "month")?.value || "").toLowerCase();
  const dates = new Set([
    "1 tishri", "2 tishri", "10 tishri", "15 tishri", "22 tishri",
    "15 nisan", "21 nisan", "6 sivan",
  ]);
  return dates.has(`${day} ${month}`);
};

export const calculateTowingFare = (distanceKm, opts = {}) => {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const vehicleType = normalizeVehicleType(opts.vehicleType || "car");
  if (!vehicleType) throw new RangeError("Unsupported vehicle type");
  const weightBand = requiresWeightBand(vehicleType) ? normalizeWeightBand(opts.weightBand) : null;
  const rate = PRICING.vehicles[vehicleType];
  const base = distanceBasePrice(distanceKm, { vehicleType, weightBand });
  const night = typeof opts.forceNight === "boolean" ? opts.forceNight : isNightShift(at);
  const shabbat = typeof opts.forceShabbat === "boolean" ? opts.forceShabbat : isShabbatWindow(at);
  const holiday = typeof opts.forceHoliday === "boolean" ? opts.forceHoliday : isJewishHoliday(at);
  const nightSurcharge = night ? Number((base * 0.5).toFixed(2)) : 0;
  const shabbatSurcharge = shabbat ? Number((base * 0.5).toFixed(2)) : 0;
  const holidaySurcharge = holiday && !shabbat ? Number((base * 0.5).toFixed(2)) : 0;
  const rescueFee = opts.includeRescue ? rate.rescueFee : 0;
  const towingFee = Number(
    (base + rescueFee + nightSurcharge + shabbatSurcharge + holidaySurcharge).toFixed(2),
  );
  const serviceFee = typeof opts.serviceFee === "number" ? opts.serviceFee : PRICING.serviceFee;
  const taxableSubtotal = Number((towingFee + serviceFee).toFixed(2));
  const vat = Number((taxableSubtotal * (PRICING.vatPercent / 100)).toFixed(2));
  const total = Number((taxableSubtotal + vat).toFixed(2));
  return {
    vehicleType, weightBand, includedKm: rate.includedKm,
    additionalKmPrice: rate.additionalKmPrice, basePrice: base,
    nightSurcharge, shabbatSurcharge, holidaySurcharge, rescueFee,
    towingFee, serviceFee, taxableSubtotal, vat,
    vatPercent: PRICING.vatPercent, total, isNight: night,
    isShabbat: shabbat, isHoliday: holiday,
  };
};
