/**
 * Normalize phone numbers to a consistent international format (+XXXXXXXX).
 */
export function normalizePhoneNumber(phone) {
  if (phone == null) return "";

  let value = String(phone).trim();
  if (!value) return "";

  value = value.replace(/[\s\-().]/g, "");
  value = value.replace(/^\++/, "+");

  if (!value.startsWith("+")) {
    value = `+${value}`;
  }

  return value;
}

/**
 * Build lookup variants so login works with legacy stored formats.
 */
export function phoneLookupVariants(phone) {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return [];

  const digitsOnly = normalized.replace(/\D/g, "");
  const withoutPlus = normalized.startsWith("+") ? normalized.slice(1) : normalized;

  return [...new Set([normalized, withoutPlus, digitsOnly, `+${digitsOnly}`])];
}

export async function findUserByPhone(Model, phoneNumber, filter = {}, select = null) {
  const variants = phoneLookupVariants(phoneNumber);
  if (variants.length === 0) return null;

  let query = Model.findOne({
    ...filter,
    phoneNumber: { $in: variants },
  });

  if (select) {
    query = query.select(select);
  }

  return query;
}
