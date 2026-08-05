/**
 * Hebrew locale helpers for TOW ME (Israel).
 * Translates English API / system strings to Hebrew at response time.
 * Enum codes (pending, towing, …) stay English in DB; use labelHe() for display.
 */

const STATUS_HE = {
  pending: "ממתין",
  accepted: "התקבל",
  in_progress: "בביצוע",
  completed: "הושלם",
  cancelled: "בוטל",
  rejected: "נדחה",
  available: "זמין",
  busy: "עסוק",
  offline: "לא מחובר",
  paid: "שולם",
  refunded: "הוחזר",
  overdue: "באיחור",
  open: "פתוח",
  resolved: "נפתר",
  closed: "סגור",
  normal: "רגיל",
  high: "גבוה",
  urgent: "דחוף",
  customer: "לקוח",
  driver: "נהג",
  admin: "מנהל",
  cash: "מזומן",
  card: "כרטיס",
  wallet: "ארנק",
  towing: "גרירה",
  roadside: "סיוע בדרך",
  flatbed: "משטח",
  new_booking: "הזמנה חדשה",
  regular: "רגיל",
  heavy: "כבד",
  trip_payment: "תשלום נסיעה",
  commission: "עמלה",
  new_trip: "נסיעה חדשה",
  trip_accepted: "נסיעה התקבלה",
  trip_completed: "נסיעה הושלמה",
  trip_cancelled: "נסיעה בוטלה",
};

const EN_TO_HE = {
  // Auth
  "Phone, password and confirm password are required":
    "נדרשים מספר טלפון, סיסמה ואימות סיסמה",
  "Passwords do not match": "הסיסמאות אינן תואמות",
  "Valid phone number is required": "נדרש מספר טלפון תקין",
  "Phone number already registered": "מספר הטלפון כבר רשום במערכת",
  "Registered successfully. OTP sent to your phone.":
    "ההרשמה הצליחה. קוד אימות נשלח לטלפון שלך",
  "Phone number is required": "נדרש מספר טלפון",
  "This phone number is registered as a driver":
    "מספר טלפון זה רשום כנהג",
  "Your account has been blocked. Please contact support.":
    "החשבון שלך נחסם. אנא פנה לתמיכה",
  "Your account has been blocked. Contact support.":
    "החשבון שלך נחסם. פנה לתמיכה",
  "OTP sent to your phone": "קוד אימות נשלח לטלפון שלך",
  "Phone number and password are required": "נדרשים מספר טלפון וסיסמה",
  "User not found": "המשתמש לא נמצא",
  "Incorrect password": "סיסמה שגויה",
  "Login successful": "ההתחברות הצליחה",
  "Phone number, password and confirm password are required":
    "נדרשים מספר טלפון, סיסמה ואימות סיסמה",
  "Email already registered": "האימייל כבר רשום במערכת",
  "Phone or email and password are required":
    "נדרשים טלפון או אימייל וסיסמה",
  "Driver not found": "הנהג לא נמצא",
  "Phone number and OTP are required": "נדרשים מספר טלפון וקוד אימות",
  "Invalid or expired OTP": "קוד אימות שגוי או שפג תוקפו",
  "Phone verified successfully": "הטלפון אומת בהצלחה",
  "OTP resent to your phone": "קוד אימות נשלח מחדש לטלפון שלך",
  "OTP verified": "הקוד אומת",
  "All fields are required": "יש למלא את כל השדות",
  "Password reset successful": "איפוס הסיסמה הצליח",
  "Unauthorized": "אין הרשאה",
  "Logged out successfully": "התנתקת בהצלחה",
  "Refresh token required": "נדרש טוקן רענון",
  "Invalid or expired refresh token": "טוקן רענון שגוי או שפג תוקפו",
  "Invalid refresh token": "טוקן רענון שגוי",
  "Token refreshed": "הטוקן עודכן",
  "Email and password are required": "נדרשים אימייל וסיסמה",
  "Admin not found": "המנהל לא נמצא",
  "Admin login successful": "התחברות מנהל הצליחה",

  // Trips
  "Pickup and dropoff coordinates are required":
    "נדרשות נקודות איסוף ויעד",
  "Trip estimate calculated": "הערכת הנסיעה חושבה",
  "Trip not found": "הנסיעה לא נמצאה",
  "Access denied": "הגישה נדחתה",
  "No driver assigned yet": "עדיין לא שובץ נהג",
  "Driver location fetched": "מיקום הנהג התקבל",
  "Pickup and dropoff addresses are required":
    "נדרשות כתובות איסוף ויעד",
  "Trip request created": "בקשת הנסיעה נוצרה",
  "Trips fetched": "הנסיעות התקבלו",
  "Trip fetched": "הנסיעה התקבלה",
  "Trip cannot be cancelled at this stage":
    "לא ניתן לבטל את הנסיעה בשלב זה",
  "Trip cancelled": "הנסיעה בוטלה",
  "Rating must be between 1 and 5": "הדירוג חייב להיות בין 1 ל־5",
  "Can only rate completed trips": "ניתן לדרג רק נסיעות שהושלמו",
  "You have already rated this trip": "כבר דירגת נסיעה זו",
  "Rating submitted": "הדירוג נשלח",
  "Driver profile not found": "פרופיל הנהג לא נמצא",
  "Pending trips fetched": "נסיעות ממתינות התקבלו",
  "You must be available to accept trips":
    "עליך להיות זמין כדי לקבל נסיעות",
  "Trip not found or already taken": "הנסיעה לא נמצאה או שכבר נלקחה",
  "Trip accepted": "הנסיעה התקבלה",
  "Trip declined": "הנסיעה נדחתה",
  "Trip rejected": "הנסיעה נדחתה",
  "Trip not found or not in accepted state":
    "הנסיעה לא נמצאה או שאינה במצב שהתקבל",
  "Trip started": "הנסיעה החלה",
  "Trip not found or not in progress":
    "הנסיעה לא נמצאה או שאינה בביצוע",
  "Trip completed": "הנסיעה הושלמה",
  "Cannot cancel a completed trip": "לא ניתן לבטל נסיעה שהושלמה",
  "Trip cancelled by admin": "הנסיעה בוטלה על ידי מנהל",
  "Driver assigned successfully": "הנהג שובץ בהצלחה",

  // Driver
  "Required fields: firstName, lastName, phoneNumber, vehicleType, licenseNumber, password":
    "שדות חובה: שם פרטי, שם משפחה, טלפון, סוג רכב, מספר רישוי, סיסמה",
  "Driver created successfully": "הנהג נוצר בהצלחה",
  "Drivers fetched successfully": "הנהגים התקבלו בהצלחה",
  "Driver fetched successfully": "הנהג התקבל בהצלחה",
  "Driver updated successfully": "הנהג עודכן בהצלחה",
  "Driver user account not found": "חשבון המשתמש של הנהג לא נמצא",
  "Driver deleted successfully": "הנהג נמחק בהצלחה",
  "Driver profile fetched": "פרופיל הנהג התקבל",
  "Profile updated successfully": "הפרופיל עודכן בהצלחה",
  "Status must be: available, busy, or offline":
    "הסטטוס חייב להיות: זמין, עסוק או לא מחובר",
  "Latitude and longitude are required": "נדרשים קו רוחב וקו אורך",
  "Location updated": "המיקום עודכן",
  "Financial history fetched": "היסטוריה פיננסית התקבלה",
  "All password fields are required": "יש למלא את כל שדות הסיסמה",
  "Password must be at least 6 characters":
    "הסיסמה חייבת להכיל לפחות 6 תווים",
  "Current password is incorrect": "הסיסמה הנוכחית שגויה",
  "Password changed successfully": "הסיסמה שונתה בהצלחה",

  // Customer
  "Profile fetched": "הפרופיל התקבל",
  "Profile updated": "הפרופיל עודכן",
  "Customers fetched": "הלקוחות התקבלו",
  "Customer fetched": "הלקוח התקבל",
  "Customer blocked": "הלקוח נחסם",
  "Customer unblocked": "החסימה הוסרה",
  "Customer marked as VIP": "הלקוח סומן כ־VIP",
  "VIP status removed": "סטטוס VIP הוסר",
  "Customer deleted": "הלקוח נמחק",

  // Support
  "Subject and message are required": "נדרשים נושא והודעה",
  "Support ticket created": "פניית התמיכה נוצרה",
  "Tickets fetched": "הפניות התקבלו",
  "Message is required": "נדרשת הודעה",
  "Ticket not found": "הפנייה לא נמצאה",
  "Ticket is closed": "הפנייה סגורה",
  "Message sent": "ההודעה נשלחה",
  "Ticket fetched": "הפנייה התקבלה",
  "Reply sent": "התשובה נשלחה",
  "Ticket updated": "הפנייה עודכנה",
  "Trip cancelled successfully": "הנסיעה בוטלה בהצלחה",
  "No active trip to cancel": "אין נסיעה פעילה לביטול",
  "No available driver found": "לא נמצא נהג זמין",
  "Driver transferred successfully": "הנהג הועבר בהצלחה",
  "No driver to transfer": "אין נהג להעברה",
  "Unknown action": "פעולה לא ידועה",

  // Notifications
  "Notifications fetched": "ההתראות התקבלו",
  "Notification marked as read": "ההתראה סומנה כנקראה",
  "All notifications marked as read": "כל ההתראות סומנו כנקראו",
  "Notification deleted": "ההתראה נמחקה",

  // Admin
  "Dashboard stats fetched": "נתוני לוח הבקרה התקבלו",
  "Financial analytics fetched": "ניתוח פיננסי התקבל",

  // Middleware / errors
  "Token not found": "הטוקן לא נמצא",
  "Invalid or expired token": "טוקן שגוי או שפג תוקפו",
  "Access denied. Admin only.": "הגישה נדחתה. למנהלים בלבד",
  "Access denied. Driver only.": "הגישה נדחתה. לנהגים בלבד",
  "Access denied. Customer only.": "הגישה נדחתה. ללקוחות בלבד",
  "Access denied.": "הגישה נדחתה",
  "API Not Found !!": "ה־API לא נמצא",
  "Invalid ID": "מזהה לא תקין",
  "Validation Error": "שגיאת אימות",
  "Name is required": "נדרש שם",
  "Password is required": "נדרשת סיסמה",
  "TOW ME Backend is running!": "שרת TOW ME פעיל!",
  "SMS not configured": "שירות ה־SMS לא הוגדר",

  // System defaults stored on trips
  "Cancelled by admin": "בוטל על ידי מנהל",
  "Cancelled via support": "בוטל דרך התמיכה",
  "Cancelled by customer": "בוטל על ידי הלקוח",
  "Driver declined": "הנהג דחה",
  "Driver cancelled after accept": "הנהג ביטל לאחר קבלה",
  PENDING: "ממתין",

  // Notification templates (legacy English in DB)
  "Trip Requested": "בקשת נסיעה נשלחה",
  "Driver Accepted": "הנהג קיבל את הקריאה",
  "Trip Completed": "הנסיעה הושלמה",
};

const DYNAMIC_PATTERNS = [
  {
    re: /^Availability set to (.+)$/i,
    to: (m) => `הזמינות הוגדרה ל־${labelHe(m[1])}`,
  },
  {
    re: /^Payment status updated to (.+)$/i,
    to: (m) => `סטטוס התשלום עודכן ל־${labelHe(m[1])}`,
  },
  {
    re: /^Trip #(.+) payment$/i,
    to: (m) => `תשלום נסיעה #${m[1]}`,
  },
  {
    re: /^Your trip #(.+) has been placed\. Waiting for driver\.$/i,
    to: (m) => `הנסיעה שלך #${m[1]} נקלטה. ממתין לנהג.`,
  },
  {
    re: /^Driver (.+) has accepted your trip #(.+)\.$/i,
    to: (m) => `הנהג ${m[1]} קיבל את הנסיעה שלך #${m[2]}.`,
  },
  {
    re: /^Your trip #(.+) has been completed\. Please rate your driver!$/i,
    to: (m) => `הנסיעה שלך #${m[1]} הושלמה. אנא דרג את הנהג!`,
  },
  {
    re: /^Driver (.+)$/i,
    to: (m) => `נהג ${m[1]}`,
  },
  {
    re: /^(.+) is already exists$/i,
    to: (m) => `${m[1]} כבר קיים במערכת`,
  },
];

/** Map a known enum / English token to Hebrew label. */
export function labelHe(value) {
  if (value == null) return "";
  const key = String(value).trim();
  if (!key) return "";
  const lower = key.toLowerCase();
  if (STATUS_HE[lower] != null) return STATUS_HE[lower];
  if (EN_TO_HE[key] != null) return EN_TO_HE[key];
  return key;
}

/**
 * Translate an English (or mixed) user-facing message to Hebrew.
 * Unknown strings are returned unchanged (assumed already Hebrew).
 */
export function toHebrew(message) {
  if (message == null) return message;
  if (typeof message !== "string") return message;
  const trimmed = message.trim();
  if (!trimmed) return message;

  if (EN_TO_HE[trimmed] != null) return EN_TO_HE[trimmed];

  for (const { re, to } of DYNAMIC_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return to(m);
  }

  // Whole-string enum
  const asLabel = STATUS_HE[trimmed.toLowerCase()];
  if (asLabel != null) return asLabel;

  return message;
}

/** Translate notification title + message for storage / response. */
export function heNotification(title, message) {
  return {
    title: toHebrew(title),
    message: toHebrew(message),
  };
}

export default { toHebrew, labelHe, heNotification, STATUS_HE, EN_TO_HE };
