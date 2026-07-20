/**
 * Pulseem SMS API integration
 * https://api.pulseem.com/api/v1/SmsApi/SendSms
 */

const PULSEEM_API_URL = "https://api.pulseem.com/api/v1/SmsApi/SendSms";

const getApiKey = () => process.env.PULSEEM_API_KEY || "";
const getFromNumber = () => process.env.PULSEEM_FROM_NUMBER || "0508085620";

/**
 * Send SMS via Pulseem
 * @param {string} toNumber - recipient phone number
 * @param {string} message - SMS text
 * @param {string} [reference] - optional reference id
 */
export const sendSms = async (toNumber, message, reference = "") => {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("PULSEEM_API_KEY not set — SMS not sent");
    return { success: false, error: "SMS not configured" };
  }

  const normalizedPhone = String(toNumber).replace(/\D/g, "");
  const payload = {
    sendId: String(Date.now()),
    isAsync: true,
    cbkUrl: "",
    smsSendData: {
      fromNumber: getFromNumber(),
      toNumberList: [normalizedPhone],
      referenceList: [reference || `towme-${Date.now()}`],
      textList: [message],
    },
    isAutomaticUnsubscribeLink: false,
  };

  try {
    const response = await fetch(PULSEEM_API_URL, {
      method: "POST",
      headers: {
        Authorization: `APIKEY ${apiKey}`,
        "Content-Type": "application/json",
        APIKEY: apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Pulseem SMS error:", response.status, data);
      return { success: false, error: data?.message || `HTTP ${response.status}` };
    }

    return { success: true, data };
  } catch (err) {
    console.error("Pulseem SMS request failed:", err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Send OTP code via SMS
 */
export const sendOtpSms = async (phoneNumber, otp) => {
  const message = `קוד האימות שלך ב-TOW ME: ${otp}. הקוד תקף ל-5 דקות.`;
  return sendSms(phoneNumber, message, `otp-${phoneNumber}`);
};
