import { sendOtpSms } from "./pulseemSms.js";

/**
 * Send OTP via Pulseem SMS. In development, logs OTP if SMS fails.
 */
export const deliverOtp = async (phoneNumber, otp) => {
  const result = await sendOtpSms(phoneNumber, otp);

  if (!result.success && process.env.NODE_ENV !== "production") {
    console.log(`[DEV] OTP for ${phoneNumber}: ${otp}`);
  }

  return result;
};
