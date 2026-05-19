const createRoleRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 2 },
    description: { type: "string" },
    isActive: { type: "boolean" },
    pointMultiplier: { type: "number", minimum: 0 },
    permissions: { type: "array", items: { type: "string" } },
  },
  required: ["name"],
  additionalProperties: false,
};

const updateRoleRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 2 },
    description: { type: "string" },
    isActive: { type: "boolean" },
    pointMultiplier: { type: "number", minimum: 0 },
    permissions: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

module.exports = {
  createRoleRequestType,
  updateRoleRequestType,
};
