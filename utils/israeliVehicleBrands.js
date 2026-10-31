/**
 * Manufacturers offered in the vehicle picker.
 *
 * The Ministry of Transport WLTP dataset carries the full historical registry,
 * including brands never sold here. Only brands listed below are exposed to the
 * apps. Hebrew display names/order follow the client's cars (2).pdf list.
 * Canonical English aliases are retained for government registry matching.
 */
// Client-approved PDF order and spellings; also used by the customer website.
export const HEBREW_VEHICLE_BRANDS = [
  ["IM","IM"],
  ["אאודי","Audi"],
  ["אבארט","Abarth"],
  ["אוואטר","Avatr"],
  ["אומודה","Omoda"],
  ["אופל","Opel"],
  ["אורה","Ora"],
  ["איביזי","EVEASY"],
  ["איוויס","Aiways"],
  ["איווקו","Iveco"],
  ["איוון","Aion"],
  ["אינפיניטי","Infiniti"],
  ["איסוזו","Isuzu"],
  ["אלפא רומאו","Alfa Romeo"],
  ["אלפיין","Alpine"],
  ["אם ג'י","MG"],
  ["אסטון מרטין","Aston Martin"],
  ["אקספנג","Xpeng"],
  ["ב.מ.וו","BMW"],
  ["בי.ווי.די","BYD"],
  ["בנטלי","Bentley"],
  ["ג'אק","JAC"],
  ["ג'ילי","Geely"],
  ["ג'יפ","Jeep"],
  ["ג'נסיס","Genesis"],
  ["דאיון","Dayun"],
  ["דאצ'יה","Dacia"],
  ["דודג'","Dodge"],
  ["דונגפנג","Dongfeng"],
  ["די אס","DS"],
  ["דיפאל","Deepal"],
  ["הונגצ'י","Hongqi"],
  ["הונדה","Honda"],
  ["וואי","Wey"],
  ["וויה","Voyah"],
  ["וולוו","Volvo"],
  ["זיקר","Zeekr"],
  ["טויוטה","Toyota"],
  ["טסלה","Tesla"],
  ["יגואר","Jaguar"],
  ["יונדאי","Hyundai"],
  ["לינק אנד קו","Lynk & Co"],
  ["ליפמוטור","Leapmotor"],
  ["לנד רובר","Land Rover"],
  ["לקסוס","Lexus"],
  ["מאזדה","Mazda"],
  ["מזארטי","Maserati"],
  ["מיני","Mini"],
  ["מיצובישי","Mitsubishi"],
  ["מקסוס","Maxus"],
  ["מרצדס - בנץ","Mercedes-Benz"],
  ["ניאו","Nio"],
  ["ניסאן","Nissan"],
  ["סאנגיונג","SsangYong"],
  ["סובארו","Subaru"],
  ["סוזוקי","Suzuki"],
  ["סיאט","Seat"],
  ["סיטרואן","Citroen"],
  ["סמארט","Smart"],
  ["סקודה","Skoda"],
  ["סקייוול","Skywell"],
  ["סרס","Seres"],
  ["פולסטאר","Polestar"],
  ["פולקסווגן","Volkswagen"],
  ["פורד","Ford"],
  ["פורשה","Porsche"],
  ["פורתינג","Forthing"],
  ["פיאט","Fiat"],
  ["פיג'ו","Peugeot"],
  ["צ'רי","Chery"],
  ["קאדילק","Cadillac"],
  ["קופרה","Cupra"],
  ["קיה","Kia"],
  ["ראם","Ram"],
  ["רנו","Renault"],
  ["שברולט","Chevrolet"],
  ["אחר","Other"],
];

export const ISRAELI_VEHICLE_BRANDS = HEBREW_VEHICLE_BRANDS
  .filter(([, canonical]) => canonical !== "Other").map(([, canonical]) => canonical);

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
    // Retain registry/previous-app spellings while displaying the PDF labels.
    "אווטאר": "Avatr", "איווייז": "Aiways", "איון": "Aion",
    "אלפין": "Alpine", "בי.וי.די": "BYD", "מזראטי": "Maserati",
    "פורטינג": "Forthing",
  }),
);

const canonicalKey = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿]/g, "");

for (const [hebrew, canonical] of HEBREW_VEHICLE_BRANDS) {
  BRAND_ALIASES.set(hebrew, canonical);
}

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
