/**
 * Manufacturers offered in the vehicle picker.
 *
 * The Ministry of Transport WLTP dataset carries the full historical registry,
 * including brands never sold here. Only brands listed below are exposed to the
 * apps. Replace this array wholesale when the client supplies their own list;
 * an empty array disables filtering and falls back to the raw registry.
 */
export const ISRAELI_VEHICLE_BRANDS = [
  "Alfa Romeo", "Aston Martin", "Audi", "BMW", "BYD", "Bentley", "Cadillac",
  "Chery", "Chevrolet", "Chrysler", "Citroen", "Cupra", "DS", "Dacia",
  "Daihatsu", "Dodge", "Ferrari", "Fiat", "Ford", "GMC", "Geely",
  "Great Wall", "Honda", "Hyundai", "Infiniti", "Isuzu", "Iveco", "Jaguar",
  "Jeep", "Kia", "Lamborghini", "Land Rover", "Lexus", "Lynk & Co", "MAN",
  "MG", "Maserati", "Mazda", "Mercedes-Benz", "Mini", "Mitsubishi", "Nissan",
  "Opel", "Peugeot", "Porsche", "Renault", "Rolls-Royce", "Saab", "Scania",
  "Seat", "Skoda", "Skywell", "Smart", "SsangYong", "Subaru", "Suzuki",
  "Tesla", "Toyota", "Volkswagen", "Volvo", "Haval", "Ora", "Voyah", "Xpeng",
  "Nio", "Zeekr", "Omoda", "Jaecoo", "Forthing", "Maxus", "Seres", "Aiways",
];

/** Hebrew registry spellings mapped onto the canonical brand above. */
const BRAND_ALIASES = new Map(
  Object.entries({
    "טויוטה": "Toyota", "יונדאי": "Hyundai", "קיה": "Kia", "מאזדה": "Mazda",
    "סקודה": "Skoda", "סיאט": "Seat", "פולקסווגן": "Volkswagen",
    "מיצובישי": "Mitsubishi", "ניסאן": "Nissan", "סוזוקי": "Suzuki",
    "הונדה": "Honda", "פורד": "Ford", "שברולט": "Chevrolet", "רנו": "Renault",
    "פיג'ו": "Peugeot", "סיטרואן": "Citroen", "אופל": "Opel", "פיאט": "Fiat",
    "ג'יפ": "Jeep", "דאצ'יה": "Dacia", "מרצדס": "Mercedes-Benz",
    "מרצדס בנץ": "Mercedes-Benz", "ב.מ.וו": "BMW", "במוו": "BMW",
    "אאודי": "Audi", "וולוו": "Volvo", "סובארו": "Subaru", "לקסוס": "Lexus",
    "מיני": "Mini", "פורשה": "Porsche", "טסלה": "Tesla", "שרי": "Chery",
    "ג'ילי": "Geely", "אם ג'י": "MG", "ביואיד": "BYD", "האוול": "Haval",
  }),
);

const canonicalKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]/g, "");

const ALLOWED_KEYS = new Set(ISRAELI_VEHICLE_BRANDS.map(canonicalKey));
for (const alias of BRAND_ALIASES.keys()) {
  ALLOWED_KEYS.add(canonicalKey(alias));
}

export function isAllowedBrand(name) {
  if (ISRAELI_VEHICLE_BRANDS.length === 0) return true;
  return ALLOWED_KEYS.has(canonicalKey(name));
}

/** Resolve a registry spelling to its canonical display name. */
export function canonicalBrandName(name) {
  const trimmed = String(name || "").trim();
  const alias = BRAND_ALIASES.get(trimmed);
  if (alias) return alias;

  const key = canonicalKey(trimmed);
  const match = ISRAELI_VEHICLE_BRANDS.find((brand) => canonicalKey(brand) === key);
  return match || trimmed;
}
