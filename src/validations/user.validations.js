const userRegisterRequestType = {
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    password: { type: 'string', format: 'password' },
    avatarId: { type: 'string', minLength: 10 },
    roleId: { type: 'string', minLength: 10 },
  },
  required: ['email', 'password', 'name'],
  additionalProperties: false
}

const userLoginRequestType = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", format: "password" },
  },
  required: ["email", "password"],
  additionalProperties: false,
};

const userProfileUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 2 },
    avatarId: { type: "string" },
    dob: { type: "string" },
    mobileNumber: { type: "string" },
    shopName: { type: "string" },
    experience: { type: "number" },
    areaOfOperation: { type: "string" },
    profilePhoto: { type: "string" },
  },
  additionalProperties: false,
};

const userFcmRequestType = {
  type: "object",
  properties: {
    fcmToken: { type: "string", minLength: 5 },
  },
  required: ["fcmToken"],
  additionalProperties: false,
};

const userBankDetailsRequestType = {
  type: "object",
  properties: {
    userName: {
      type: "string",
      minLength: 2,
    },
    accountNumber: {
      type: "string",
      pattern: "^[0-9]{9,18}$",
    },
    ifscCode: {
      type: "string",
      pattern: "^[A-Z]{4}0[A-Z0-9]{6}$",
    },
  },
  required: ["userName", "accountNumber", "ifscCode"],
  additionalProperties: false,
  errorMessage: {
    required: {
      userName: "User name is required",
      accountNumber: "Account number is required",
      ifscCode: "IFSC code is required",
    },
    properties: {
      userName: "User name must be at least 2 characters long",
      accountNumber: "Account number must be between 9 and 18 digits",
      ifscCode: "IFSC code must be 11 characters, e.g., SBIN0001234",
    },
    additionalProperties: "No extra properties are allowed",
  },
};

module.exports = {
  userLoginRequestType,
  userRegisterRequestType,
  userBankDetailsRequestType,
  userProfileUpdateRequestType,
  userFcmRequestType,
};
