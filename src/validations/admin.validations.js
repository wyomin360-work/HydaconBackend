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

const adminAuditLogsRequestType = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    search: { type: "string" },
    sortBy: { type: "string" },
    sortOrder: { type: "string", enum: ["asc", "desc"] },
    filters: {
      type: "object",
      properties: {
        userId: { type: "string" },
        oldNumber: { type: "string" },
        newNumber: { type: "string" },
        ipAddress: { type: "string" },
        dateFrom: { type: "string" },
        dateTo: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

module.exports = {
  adminLoginRequestType,
  adminRegisterRequestType,
  adminAuditLogsRequestType,
};
