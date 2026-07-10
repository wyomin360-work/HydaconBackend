const coverageSchema = {
  type: "object",
  properties: {
    enabled: { type: "boolean" },
    calculationType: { type: "string", enum: ["AREA", "JOINT_FILLER"] },
    coveragePerUnit: { type: "number", minimum: 0 },
    coverageUnit: { type: "string", enum: ["sqft", "sqm"] },
    packageWeight: { type: "number", minimum: 0 },
    packageUnit: { type: "string", enum: ["kg", "ltr"] },
    calculatorConfig: {
      type: "object",
      properties: {
        wastagePercentage: { type: "number", minimum: 0, maximum: 100 },
        rounding: { type: "string", enum: ["UP", "NEAREST"] },
        materialDensity: { type: "number", minimum: 0 },
        minTileSize: { type: "number", minimum: 0 },
        maxTileSize: { type: "number", minimum: 0 },
        minJointWidth: { type: "number", minimum: 0 },
        maxJointWidth: { type: "number", minimum: 0 },
        minTileThickness: { type: "number", minimum: 0 },
        maxTileThickness: { type: "number", minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  required: ["enabled"],
  additionalProperties: false,
};

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
    coverage: coverageSchema,
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
    coverage: coverageSchema,
  },
  additionalProperties: false,
};

module.exports = {
  productCreateRequestType,
  productUpdateRequestType,
};
