const { sendSms } = require("../../src/functions/sms");

describe("Twilio Real SMS Send Test", () => {
  it("should send a real SMS via Twilio", async () => {
    // Define your phone number and message here:
    const to = "+918606340493";
    const message = "Greetings from Hydacon! Your verification OTP is: 1234";

    const result = await sendSms(to, message);

    expect(result.success).toBe(true);
    expect(result.sid).toBeDefined();
  });
});
