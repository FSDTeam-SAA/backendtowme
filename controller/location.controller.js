import httpStatus from "http-status";
import AppError from "../errors/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

function readCache(key) {
  const item = cache.get(key);
  if (!item || Date.now() - item.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function writeCache(key, data) {
  if (cache.size > 300) cache.clear();
  cache.set(key, { at: Date.now(), data });
  return data;
}

async function nominatim(path, params) {
  const url = new URL(`${NOMINATIM_URL}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "he,en;q=0.8",
      "User-Agent": "TowMe/1.0 (https://towmedn.com)",
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new AppError(httpStatus.BAD_GATEWAY, "Location service is temporarily unavailable");
  }
  return response.json();
}

function normalizePlace(place) {
  const lat = Number(place?.lat);
  const lng = Number(place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    id: String(place.place_id || `${lat},${lng}`),
    label: String(place.display_name || "").trim(),
    lat,
    lng,
  };
}

export const searchLocations = catchAsync(async (req, res) => {
  const query = String(req.query.q || "").trim();
  if (query.length < 3 || query.length > 160) {
    throw new AppError(httpStatus.BAD_REQUEST, "Enter at least 3 characters to search for an address");
  }

  const key = `search:${query.toLowerCase()}`;
  let places = readCache(key);
  if (!places) {
    const data = await nominatim("/search", {
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "il",
      limit: "6",
    });
    places = writeCache(key, data.map(normalizePlace).filter(Boolean));
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Locations fetched",
    data: places,
  });
});

export const reverseGeocode = catchAsync(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new AppError(httpStatus.BAD_REQUEST, "Valid latitude and longitude are required");
  }

  const key = `reverse:${lat.toFixed(5)},${lng.toFixed(5)}`;
  let place = readCache(key);
  if (!place) {
    const data = await nominatim("/reverse", {
      lat: String(lat),
      lon: String(lng),
      format: "jsonv2",
      zoom: "18",
      addressdetails: "1",
    });
    place = writeCache(key, normalizePlace(data) || {
      id: `${lat},${lng}`,
      label: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
      lat,
      lng,
    });
  }

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Location fetched",
    data: place,
  });
});
