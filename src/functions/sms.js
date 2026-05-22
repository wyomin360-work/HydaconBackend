const twilio = require("twilio");

function trimEnv(value) {
  if (!value) return "";
  return String(value).split("#")[0].trim();
}

function formatPhoneE164(phone) {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (String(phone).startsWith("+")) return String(phone).trim();
  return `+${digits}`;
}

const accountSid = trimEnv(process.env.TWILIO_ACCOUNT_SID);
const authToken = trimEnv(process.env.TWILIO_AUTH_TOKEN);
const twilioPhoneNumber = trimEnv(process.env.TWILIO_PHONE_NUMBER);

const client =
  accountSid && authToken ? twilio(accountSid, authToken) : null;

function isSmsConfigured() {
  const provider = (process.env.SMS_PROVIDER || "").toLowerCase();
  return provider === "twilio" && !!(accountSid && authToken && twilioPhoneNumber);
}

async function sendTwilioSms(phoneNumber, message) {
  if (!client) {
    console.error("[SMS] Twilio client not initialized. Check .env variables.");
    return { success: false, error: "Twilio not configured" };
  }

  try {
    const to = formatPhoneE164(phoneNumber);
    console.log("[SMS] Sending OTP to", to);
    const result = await client.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to,
    });
    return { success: true, sid: result.sid };
  } catch (error) {
    const detail = error.code ? `${error.message} (${error.code})` : error.message;
    console.error("[SMS] Twilio error:", detail);
    return { success: false, error: detail };
  }
}

async function sendSms(phone, message) {
  const provider = (process.env.SMS_PROVIDER || "twilio").toLowerCase();
  if (provider !== "twilio") {
    console.error(`[SMS] Unsupported SMS_PROVIDER: ${provider}`);
    return false;
  }
  const result = await sendTwilioSms(phone, message);
  return result.success;
}

module.exports = { sendSms, sendTwilioSms, formatPhoneE164, isSmsConfigured };
