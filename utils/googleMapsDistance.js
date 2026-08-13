/**
 * Google Maps driving distance between two coordinates.
 * Uses Routes API (computeRoutes). Falls back to legacy Directions if needed.
 * Requires GOOGLE_MAPS_API_KEY with Routes API (and optionally Directions) enabled.
 */

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";

/**
 * @param {{ lat: number, lng: number }} origin
 * @param {{ lat: number, lng: number }} destination
 * @returns {Promise<{ distanceKm: number, durationMinutes: number, source: string } | null>}
 */
export async function getDrivingDistanceKm(origin, destination) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) {
    console.warn("[maps] GOOGLE_MAPS_API_KEY missing — cannot fetch driving distance");
    return null;
  }

  const lat1 = Number(origin.lat);
  const lng1 = Number(origin.lng);
  const lat2 = Number(destination.lat);
  const lng2 = Number(destination.lng);
  if (![lat1, lng1, lat2, lng2].every((n) => Number.isFinite(n))) {
    return null;
  }

  // Google Maps road route only — never approximate / straight-line.
  const fromRoutes = await _routesApi(apiKey, lat1, lng1, lat2, lng2);
  if (fromRoutes) return { ...fromRoutes, source: "routes_api" };

  const fromDirections = await _legacyDirections(apiKey, lat1, lng1, lat2, lng2);
  if (fromDirections) return { ...fromDirections, source: "directions_api" };

  return null;
}

async function _routesApi(apiKey, lat1, lng1, lat2, lng2) {
  try {
    const res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: lat1, longitude: lng1 } } },
        destination: {
          location: { latLng: { latitude: lat2, longitude: lng2 } },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        computeAlternativeRoutes: false,
        languageCode: "he-IL",
        units: "METRIC",
        regionCode: "IL",
      }),
      signal: AbortSignal.timeout(12000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(
        `[maps] Routes API HTTP ${res.status}:`,
        data?.error?.message || data?.message || ""
      );
      return null;
    }

    const route = data.routes?.[0];
    const meters = Number(route?.distanceMeters);
    if (!Number.isFinite(meters) || meters <= 0) return null;

    // duration is like "1234s"
    let durationMinutes = 0;
    const dur = route?.duration;
    if (typeof dur === "string" && dur.endsWith("s")) {
      const seconds = Number(dur.slice(0, -1));
      if (Number.isFinite(seconds)) {
        durationMinutes = Math.max(1, Math.round(seconds / 60));
      }
    }

    return {
      distanceKm: Math.round((meters / 1000) * 10) / 10,
      durationMinutes,
    };
  } catch (err) {
    console.warn("[maps] Routes API failed:", err?.message || err);
    return null;
  }
}

async function _legacyDirections(apiKey, lat1, lng1, lat2, lng2) {
  try {
    const params = new URLSearchParams({
      origin: `${lat1},${lng1}`,
      destination: `${lat2},${lng2}`,
      mode: "driving",
      units: "metric",
      region: "il",
      language: "he",
      key: apiKey,
    });
    const res = await fetch(`${DIRECTIONS_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();
    if (data.status !== "OK") {
      console.warn(
        `[maps] Directions status=${data.status} ${data.error_message || ""}`
      );
      return null;
    }
    const leg = data.routes?.[0]?.legs?.[0];
    const meters = Number(leg?.distance?.value);
    const seconds = Number(leg?.duration?.value);
    if (!Number.isFinite(meters) || meters <= 0) return null;
    return {
      distanceKm: Math.round((meters / 1000) * 10) / 10,
      durationMinutes: Number.isFinite(seconds)
        ? Math.max(1, Math.round(seconds / 60))
        : 0,
    };
  } catch (err) {
    console.warn("[maps] Directions failed:", err?.message || err);
    return null;
  }
}
