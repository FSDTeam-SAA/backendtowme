import catchAsync from "../utils/catchAsync.js";
import sendResponse from "../utils/sendResponse.js";
import AppError from "../errors/AppError.js";
import httpStatus from "http-status";

const DATASTORE_URL = "https://data.gov.il/api/3/action/datastore_search";

/** Official WLTP vehicle makes & models (Ministry of Transport). */
const WLTP_MODELS_RESOURCE = "142afde2-6228-49f9-8a29-9b6c3a0cbe40";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

let manufacturersCache = null;
let manufacturersCachedAt = 0;
/** @type {Map<string, { at: number, models: any[] }>} */
const modelsCache = new Map();

async function datastoreSearch({
  resourceId,
  filters,
  q,
  fields,
  limit = 100,
  offset = 0,
}) {
  const params = new URLSearchParams();
  params.set("resource_id", resourceId);
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (filters) params.set("filters", JSON.stringify(filters));
  if (q) params.set("q", q);
  if (fields) params.set("fields", fields);

  const res = await fetch(`${DATASTORE_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      `data.gov.il request failed (${res.status})`
    );
  }
  const json = await res.json();
  if (!json?.success) {
    throw new AppError(
      httpStatus.BAD_GATEWAY,
      json?.error?.message || "data.gov.il returned an error"
    );
  }
  return json.result || {};
}

function normalizeText(raw) {
  return String(raw || "")
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Build manufacturer list ONLY from the WLTP models dataset so every brand
 * has at least one model row (fixes empty Model after Brand select).
 */
async function loadManufacturers() {
  const now = Date.now();
  if (manufacturersCache && now - manufacturersCachedAt < CACHE_TTL_MS) {
    return manufacturersCache;
  }

  const byName = new Map();
  let offset = 0;
  const pageSize = 32000;

  while (true) {
    const result = await datastoreSearch({
      resourceId: WLTP_MODELS_RESOURCE,
      fields: "tozeret_cd,tozeret_nm,tozar",
      limit: pageSize,
      offset,
    });
    const records = result.records || [];
    if (!records.length) break;

    for (const record of records) {
      const code = Number(record.tozeret_cd);
      if (!Number.isFinite(code)) continue;

      const name = normalizeText(record.tozar || record.tozeret_nm);
      if (!name) continue;

      const key = name.toLowerCase();
      const existing = byName.get(key);
      if (existing) {
        if (!existing.codes.includes(code)) existing.codes.push(code);
      } else {
        byName.set(key, {
          id: code,
          name,
          codes: [code],
        });
      }
    }

    offset += records.length;
    const total = result.total ?? offset;
    if (offset >= total || records.length < pageSize) break;
  }

  const list = Array.from(byName.values())
    .map((m) => {
      m.codes.sort((a, b) => a - b);
      m.id = m.codes[0];
      return m;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "he"));

  manufacturersCache = list;
  manufacturersCachedAt = now;
  return list;
}

async function loadModelsForCodes(codes) {
  const uniqueCodes = [...new Set(codes.map(Number).filter(Number.isFinite))];
  if (!uniqueCodes.length) return [];

  const cacheKey = uniqueCodes.slice().sort((a, b) => a - b).join(",");
  const cached = modelsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.models;
  }

  const byModel = new Map();
  let offset = 0;
  const pageSize = 32000;

  while (true) {
    const result = await datastoreSearch({
      resourceId: WLTP_MODELS_RESOURCE,
      filters: { tozeret_cd: uniqueCodes },
      fields: "tozeret_cd,degem_cd,degem_nm,kinuy_mishari",
      limit: pageSize,
      offset,
    });
    const records = result.records || [];
    if (!records.length) break;

    for (const record of records) {
      const degemNm = normalizeText(record.degem_nm);
      const commercial = normalizeText(record.kinuy_mishari);
      // Prefer commercial name (Corolla); fall back to technical degem_nm.
      const name = commercial || degemNm;
      if (!name) continue;

      const key = name.toLowerCase();
      if (byModel.has(key)) continue;

      const degemCd = Number(record.degem_cd);
      byModel.set(key, {
        id: Number.isFinite(degemCd) ? degemCd : byModel.size + 1,
        name,
        degem_nm: degemNm,
        degem_cd: Number.isFinite(degemCd) ? degemCd : null,
        tozeret_cd: Number(record.tozeret_cd) || null,
      });
    }

    offset += records.length;
    const total = result.total ?? offset;
    if (offset >= total || records.length < pageSize) break;
  }

  const models = Array.from(byModel.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "he")
  );
  modelsCache.set(cacheKey, { at: Date.now(), models });
  return models;
}

function resolveManufacturer(manufacturers, manufacturerId) {
  const id = Number(manufacturerId);
  if (!Number.isFinite(id)) return null;
  return (
    manufacturers.find((m) => m.id === id || m.codes.includes(id)) || null
  );
}

export const getManufacturers = catchAsync(async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const manufacturers = await loadManufacturers();
  const filtered = q
    ? manufacturers.filter((m) => m.name.toLowerCase().includes(q))
    : manufacturers;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Manufacturers fetched",
    data: filtered.map(({ id, name, codes }) => ({ id, name, codes })),
  });
});

export const getModels = catchAsync(async (req, res) => {
  const manufacturerId = req.query.manufacturerId ?? req.query.tozeret_cd;
  if (manufacturerId == null || String(manufacturerId).trim() === "") {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "manufacturerId is required"
    );
  }

  const manufacturers = await loadManufacturers();
  const manufacturer = resolveManufacturer(manufacturers, manufacturerId);
  const codes = manufacturer?.codes?.length
    ? manufacturer.codes
    : [Number(manufacturerId)];

  const models = await loadModelsForCodes(codes);
  const q = String(req.query.q || "").trim().toLowerCase();
  const filtered = q
    ? models.filter((m) => m.name.toLowerCase().includes(q))
    : models;

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Models fetched",
    data: filtered.map(({ id, name, degem_nm, degem_cd, tozeret_cd }) => ({
      id,
      name,
      degem_nm,
      degem_cd,
      tozeret_cd,
    })),
  });
});
