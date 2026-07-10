// Send referral — POST /referral/send
const sendReferralRequestType = {
  type: "object",
  properties: {
    phoneNumber: {
      type: "string",
      pattern: "^\\+?[0-9]{10,15}$",
    },
    name: {
      type: "string",
    },
  },
  required: ["phoneNumber"],
  additionalProperties: true,
  errorMessage: {
    required: {
      phoneNumber: "Phone number is required.",
    },
    properties: {
      phoneNumber:
        "Phone number must be 10–15 digits, with an optional leading '+'.",
    },
  },
};

module.exports = {
  sendReferralRequestType,
};
