let twilio;
try {
  twilio = require("twilio");
} catch (err) {
  console.warn("[SMS] Twilio module not installed; SMS functionality disabled.");
  twilio = null;
}

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

const client = accountSid && authToken && twilio ? twilio(accountSid, authToken) : null;


function isSmsConfigured() {
  const provider = (process.env.SMS_PROVIDER || "").toLowerCase();
  return (
    provider === "twilio" && !!(accountSid && authToken && twilioPhoneNumber)
  );
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
    const detail = error.code
      ? `${error.message} (${error.code})`
      : error.message;
    console.log(
      " 🔴 [SMS] Twilio error:",
      detail,
      accountSid,
      authToken,
      twilioPhoneNumber,
    );
    return { success: false, error: detail };
  }
}

async function sendSms(phone, message) {
  const provider = (process.env.SMS_PROVIDER || "twilio").toLowerCase();
  if (provider !== "twilio") {
    console.log(`🔴 [SMS] Unsupported SMS_PROVIDER: ${provider}`);
    return { success: false, error: `Unsupported SMS_PROVIDER: ${provider}` };
  }
  return sendTwilioSms(phone, message);
}

module.exports = { sendSms, sendTwilioSms, formatPhoneE164, isSmsConfigured };
