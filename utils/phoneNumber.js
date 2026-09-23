/**
 * Normalize phone numbers to canonical E.164 (+972XXXXXXXXX for Israeli numbers).
 *
 * Callers may send the same number in several shapes: with or without the
 * national trunk zero, with or without the country code, and older clients
 * concatenated the dial code onto the raw input, producing "+9720526319777".
 * All of those collapse to one canonical value here.
 */

const IL_COUNTRY_CODE = "972";

export function normalizePhoneNumber(phone) {
  if (phone == null) return "";

  let value = String(phone).trim();
  if (!value) return "";

  // RTL input can store the plus at the end: "972...+" → "+972..."
  if (value.endsWith("+") && !value.startsWith("+")) {
    value = `+${value.slice(0, -1)}`;
  }

  const hadPlus = value.startsWith("+");
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (!hadPlus && digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Dial code followed by a trunk zero, e.g. "9720526319777"
  if (digits.startsWith(`${IL_COUNTRY_CODE}0`)) {
    digits = IL_COUNTRY_CODE + digits.slice(IL_COUNTRY_CODE.length + 1);
  } else if (digits.startsWith("0")) {
    digits = IL_COUNTRY_CODE + digits.slice(1);
  } else if (!digits.startsWith(IL_COUNTRY_CODE) && digits.length <= 9) {
    // Bare national number typed without the trunk zero, e.g. "526319777"
    digits = IL_COUNTRY_CODE + digits;
  }

  return `+${digits}`;
}

/**
 * Build lookup variants so accounts created by older clients still match.
 */
export function phoneLookupVariants(phone) {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return [];

  const digits = normalized.slice(1);
  const variants = new Set([normalized, digits]);

  if (digits.startsWith(IL_COUNTRY_CODE)) {
    const national = digits.slice(IL_COUNTRY_CODE.length);
    for (const form of [
      national,
      `0${national}`,
      `${IL_COUNTRY_CODE}0${national}`,
    ]) {
      variants.add(form);
      variants.add(`+${form}`);
    }
  }

  return [...variants];
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
