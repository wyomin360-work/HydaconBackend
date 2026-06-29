const productCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    images: { type: "array", items: { type: "string", format: "uri" } },
    featuredImage: { type: "string", format: "uri" },
    price: { type: "number", minimum: 0 },
    rewardPoints: { type: "integer", minimum: 0 },
    netWeight: { type: "string", minLength: 2 },
  },
  required: ["name", "description", "price", "rewardPoints", "netWeight"],
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
    netWeight: { type: "string", minLength: 2 },
    active: { type: "boolean" },
  },
  additionalProperties: false,
};

module.exports = {
  productCreateRequestType,
  productUpdateRequestType,
};
