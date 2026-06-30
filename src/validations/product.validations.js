const productCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    images: { type: "array", items: { type: "string", format: "uri" } },
    featuredImage: { type: "string", format: "uri" },
    price: { type: "number", minimum: 0 },
    rewardPoints: { type: "integer", minimum: 0 },
    weightValue: { type: "number", minimum: 0 },
    weightUnit: { type: "string", enum: ["kg", "g", "l", "ml"] },
    tdsDocument: { type: "string", pattern: "^([0-9a-fA-F]{24}|)$" },
  },
  required: [
    "name",
    "description",
    "price",
    "rewardPoints",
    "weightValue",
    "weightUnit",
  ],
  additionalProperties: true,
};

const productUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    images: { type: "array", items: { type: "string", format: "uri" } },
    featuredImage: { type: "string", format: "uri" },
    price: { type: "number", minimum: 0 },
    rewardPoints: { type: "integer", minimum: 0 },
    weightValue: { type: "number", minimum: 0 },
    weightUnit: { type: "string", enum: ["kg", "g", "l", "ml"] },
    tdsDocument: { type: "string", pattern: "^([0-9a-fA-F]{24}|)$" },
    active: { type: "boolean" },
  },
  additionalProperties: false,
};

module.exports = {
  productCreateRequestType,
  productUpdateRequestType,
};
