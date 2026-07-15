const {
  RuleType,
  RuleScope,
  RuleOperator,
  RuleLogicOperator,
} = require("../schemas/rule-set.schema");

const locationSchema = {
  type: "object",
  properties: {
    locationType: { type: "string", enum: ["COUNTRY", "STATE", "DISTRICT"] },
    country: { type: "string", minLength: 1 },
    state: { type: "string", minLength: 1 },
    district: { type: "string", minLength: 1 },
  },
  required: ["locationType", "country"],
  additionalProperties: false,
};

const ruleSchemaDef = {
  type: "object",
  properties: {
    type: { type: "string", enum: Object.values(RuleType) },
    scope: { type: "string", enum: Object.values(RuleScope) },
    operator: { type: "string", enum: Object.values(RuleOperator) },
    value: {}, // Mixed schema in Mongoose, can be anything based on type
    metadata: { type: "object", additionalProperties: true },
  },
  required: ["type", "operator", "value"],
  // Add a conditional validation if type === 'REGION'
  allOf: [
    {
      if: { properties: { type: { const: RuleType.REGION } } },
      then: {
        properties: {
          value: {
            type: "array",
            items: locationSchema,
            minItems: 1,
          },
        },
      },
    },
  ],
  additionalProperties: true,
};

const ruleSetCreateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    active: { type: "boolean" },
    logicOperator: { type: "string", enum: Object.values(RuleLogicOperator) },
    rules: {
      type: "array",
      items: ruleSchemaDef,
    },
    tags: { type: "array", items: { type: "string" } },
    validFrom: { type: "string", format: "date-time" },
    validUntil: { type: "string", format: "date-time" },
  },
  required: ["name", "rules"],
  additionalProperties: true,
};

const ruleSetUpdateRequestType = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    description: { type: "string" },
    active: { type: "boolean" },
    logicOperator: { type: "string", enum: Object.values(RuleLogicOperator) },
    rules: {
      type: "array",
      items: ruleSchemaDef,
    },
    tags: { type: "array", items: { type: "string" } },
    validFrom: { type: "string", format: "date-time" },
    validUntil: { type: "string", format: "date-time" },
  },
  additionalProperties: false,
};

module.exports = {
  ruleSetCreateRequestType,
  ruleSetUpdateRequestType,
};
