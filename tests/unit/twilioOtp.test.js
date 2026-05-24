const { sendSms } = require("../../src/functions/sms");

describe("Twilio Real SMS Send Test", () => {
  it("should send a real SMS via Twilio", async () => {
    // Define your phone number and message here:
    const to = "+918606340493";
    const message = "Greetings from Hydacon! Your verification OTP is: 1234";

    console.log(`[TEST] Sending real Twilio SMS to: ${to}`);
    console.log(`[TEST] Loaded TWILIO_ACCOUNT_SID: ${process.env.TWILIO_ACCOUNT_SID ? process.env.TWILIO_ACCOUNT_SID.substring(0, 7) + "..." : "undefined"}`);
    console.log(`[TEST] Loaded TWILIO_PHONE_NUMBER: ${process.env.TWILIO_PHONE_NUMBER || "undefined"}`);
    const result = await sendSms(to, message);
    console.log("[TEST] Twilio response result:", result);

    expect(result.success).toBe(true);
    expect(result.sid).toBeDefined();
  });
});
