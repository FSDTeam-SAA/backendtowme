import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { normalizePhoneNumber } from "../utils/phoneNumber.js";

/**
 * Brute-force protection for credential endpoints.
 *
 * Tuned to be forgiving to real people and expensive for attackers:
 *  - only failed attempts count (`skipSuccessfulRequests`), so a user who
 *    signs in correctly never accumulates a penalty
 *  - short windows, so a locked-out admin waits minutes rather than hours
 *  - the response says exactly how long to wait, and sets Retry-After, so the
 *    UI can show a countdown instead of a dead end
 *
 * OTP keys on the phone number, not the IP: Israeli carriers put thousands of
 * subscribers behind one CGNAT address and a per-IP cap would lock out
 * unrelated customers.
 */

const retryMessage = (seconds) => {
  if (seconds <= 90) {
    return `יותר מדי ניסיונות. נסה שוב בעוד ${Math.max(1, Math.ceil(seconds))} שניות.`;
  }
  return `יותר מדי ניסיונות. נסה שוב בעוד ${Math.ceil(seconds / 60)} דקות.`;
};

const handler = (req, res, next, options) => {
  const resetAt = req.rateLimit?.resetTime?.getTime?.();
  const remainingMs = resetAt ? Math.max(0, resetAt - Date.now()) : options.windowMs;
  const retryAfterSeconds = Math.ceil(remainingMs / 1000);

  res.setHeader("Retry-After", retryAfterSeconds);
  res.status(429).json({
    success: false,
    message: retryMessage(retryAfterSeconds),
    retryAfterSeconds,
  });
};

const base = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler,
};

/**
 * Admin sign-in. A short window keeps an admin who mistypes from being locked
 * out for long, while still capping an attacker to a few attempts per minute.
 */
export const adminLoginLimiter = rateLimit({
  ...base,
  windowMs: 5 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
});

/** Customer and driver sign-in / registration. Failures only. */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 5 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
});

/** OTP sending costs money per SMS, so it counts every request. */
export const otpLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60 * 1000,
  limit: 6,
  keyGenerator: (req) => {
    const phone = normalizePhoneNumber(req.body?.phoneNumber || "");
    return phone || ipKeyGenerator(req.ip);
  },
});
