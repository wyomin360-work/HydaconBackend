const adminRegisterRequestType = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    name: { type: "string" },
    password: { type: "string", format: "password" },
  },
  required: ["email", "password", "name"],
  additionalProperties: false,
};

const adminLoginRequestType = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", format: "password" },
  },
  required: ["email", "password"],
  additionalProperties: false,
};

module.exports = {
  adminLoginRequestType,
  adminRegisterRequestType,
};
