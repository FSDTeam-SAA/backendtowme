import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let initialized = false;

function initFirebaseAdmin() {
  if (initialized) return admin.apps.length > 0;
  if (admin.apps.length > 0) {
    initialized = true;
    return true;
  }

  try {
    const jsonInline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const jsonPath =
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
      path.join(__dirname, "..", "firebase-service-account.json");

    let credential;
    if (jsonInline && jsonInline.trim()) {
      credential = admin.credential.cert(JSON.parse(jsonInline));
    } else if (fs.existsSync(jsonPath)) {
      const raw = fs.readFileSync(jsonPath, "utf8");
      credential = admin.credential.cert(JSON.parse(raw));
    } else {
      console.warn(
        "[push] Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or add backendtowme/firebase-service-account.json"
      );
      initialized = true;
      return false;
    }

    admin.initializeApp({ credential });
    initialized = true;
    console.log("[push] Firebase Admin initialized");
    return true;
  } catch (err) {
    console.error("[push] Firebase Admin init failed:", err.message);
    initialized = true;
    return false;
  }
}

/**
 * Send a high-priority "new towing call" push to one or more FCM tokens.
 * Works when the driver app is open, backgrounded, or killed.
 */
export async function sendNewTripPush({
  tokens,
  tripId,
  title,
  body,
  soundEnabled = true,
}) {
  const unique = [...new Set((tokens || []).filter(Boolean))];
  if (!unique.length) return { successCount: 0, failureCount: 0 };

  if (!initFirebaseAdmin()) {
    return { successCount: 0, failureCount: unique.length, skipped: true };
  }

  const message = {
    tokens: unique,
    notification: {
      title: title || "קריאה חדשה",
      body: body || "התקבלה קריאת גרירה חדשה",
    },
    data: {
      type: "new_trip",
      tripId: String(tripId || ""),
      title: title || "קריאה חדשה",
      body: body || "התקבלה קריאת גרירה חדשה",
      click_action: "FLUTTER_NOTIFICATION_CLICK",
    },
    android: {
      priority: "high",
      notification: {
        channelId: "new_tow_calls",
        sound: soundEnabled ? "default" : undefined,
        defaultSound: soundEnabled,
        priority: "high",
        visibility: "public",
        notificationCount: 1,
        tag: `trip_${tripId}`,
      },
    },
    apns: {
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert",
      },
      payload: {
        aps: {
          alert: {
            title: title || "קריאה חדשה",
            body: body || "התקבלה קריאת גרירה חדשה",
          },
          sound: soundEnabled ? "default" : undefined,
          badge: 1,
          "content-available": 1,
          "mutable-content": 1,
        },
      },
    },
  };

  try {
    const result = await admin.messaging().sendEachForMulticast(message);
    if (result.failureCount > 0) {
      const dead = [];
      result.responses.forEach((res, idx) => {
        if (!res.success) {
          const code = res.error?.code || "";
          if (
            code.includes("registration-token-not-registered") ||
            code.includes("invalid-registration-token")
          ) {
            dead.push(unique[idx]);
          }
        }
      });
      if (dead.length) {
        return { ...result, deadTokens: dead };
      }
    }
    return result;
  } catch (err) {
    console.error("[push] sendNewTripPush failed:", err.message);
    return { successCount: 0, failureCount: unique.length, error: err.message };
  }
}

export async function notifyDriversNewTrip({
  userIds,
  tripId,
  pickupAddress,
  dropoffAddress,
}) {
  const User = (await import("../model/user.model.js")).default;
  const users = await User.find({
    _id: { $in: userIds },
    role: "driver",
    pushNotificationsEnabled: { $ne: false },
  })
    .select("fcmTokens pushNotificationsEnabled alertSoundsEnabled")
    .lean();

  const results = [];
  for (const user of users) {
    const tokens = user.fcmTokens || [];
    if (!tokens.length) continue;
    const title = "קריאה חדשה";
    const body = `קריאת גרירה חדשה: ${pickupAddress || "מיקום"} → ${
      dropoffAddress || "יעד"
    }`;
    const pushResult = await sendNewTripPush({
      tokens,
      tripId,
      title,
      body,
      soundEnabled: user.alertSoundsEnabled !== false,
    });

    // Prune invalid tokens
    if (pushResult.deadTokens?.length) {
      await User.updateOne(
        { _id: user._id },
        { $pull: { fcmTokens: { $in: pushResult.deadTokens } } }
      );
    }
    results.push({ userId: user._id, ...pushResult });
  }
  return results;
}
