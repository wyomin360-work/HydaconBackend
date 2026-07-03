const categoryCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    active: { type: "boolean" },
  },
  required: ["name"],
  additionalProperties: true,
};

const categoryUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    active: { type: "boolean" },
  },
  additionalProperties: false,
};

const giftCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    giftType: { type: "string", enum: ["physical", "voucher"] },
    categoryId: { type: "string", minLength: 24, maxLength: 24 },
    priceInCoins: { type: "number", minimum: 0 },
    stockQuantity: { type: "number", minimum: 0 },
    image: { type: "string" },
    active: { type: "boolean" },
    ruleSetId: { type: "string" },
  },
  required: [
    "name",
    "description",
    "giftType",
    "priceInCoins",
    "stockQuantity",
  ],
  additionalProperties: true,
};

const giftUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    giftType: { type: "string", enum: ["physical", "voucher"] },
    categoryId: { type: "string", minLength: 24, maxLength: 24 },
    priceInCoins: { type: "number", minimum: 0 },
    stockQuantity: { type: "number", minimum: 0 },
    image: { type: "string" },
    active: { type: "boolean" },
    ruleSetId: { type: "string" },
  },
  additionalProperties: false,
};

module.exports = {
  categoryCreateRequestType,
  categoryUpdateRequestType,
  giftCreateRequestType,
  giftUpdateRequestType,
};
