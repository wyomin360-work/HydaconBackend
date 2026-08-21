const {
  RuleType,
  RuleScope,
  RuleOperator,
  RuleLogicOperator,
} = require("../schemas/rule-set.schema");

const ruleSetDocs = {
  "/api/v1/rule-sets/create": {
    post: {
      tags: ["Admin - Rule Sets"],
      summary: "Create a new rule set",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                active: { type: "boolean", default: true },
                logicOperator: {
                  type: "string",
                  enum: Object.values(RuleLogicOperator),
                },
                rules: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: Object.values(RuleType) },
                      scope: { type: "string", enum: Object.values(RuleScope) },
                      operator: {
                        type: "string",
                        enum: Object.values(RuleOperator),
                      },
                      value: { description: "Mixed value based on type" },
                      metadata: { type: "object" },
                    },
                    required: ["type", "operator", "value"],
                  },
                },
                tags: { type: "array", items: { type: "string" } },
                validFrom: { type: "string", format: "date-time" },
                validUntil: { type: "string", format: "date-time" },
              },
              required: ["name", "rules"],
            },
            example: {
              name: "Welcome Scratch Card Rules",
              description: "Rules for welcoming new users",
              active: true,
              logicOperator: "AND",
              rules: [
                {
                  type: "REGION",
                  operator: "IN",
                  value: [
                    {
                      locationType: "STATE",
                      country: "INDIA",
                      state: "KERALA",
                    },
                  ],
                },
              ],
            },
          },
        },
      },
      responses: {
        201: { description: "Created Successfully" },
        400: { description: "Bad Request" },
      },
    },
  },
  "/api/v1/rule-sets/list": {
    post: {
      tags: ["Admin - Rule Sets"],
      summary: "List all rule sets",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                page: { type: "number", default: 1 },
                limit: { type: "number", default: 10 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Success" },
      },
    },
  },
  "/api/v1/rule-sets/{id}": {
    get: {
      tags: ["Admin - Rule Sets"],
      summary: "Get rule set details",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "Rule Set ID",
        },
      ],
      responses: {
        200: { description: "Success" },
        404: { description: "Not Found" },
      },
    },
  },
  "/api/v1/rule-sets/update/{id}": {
    patch: {
      tags: ["Admin - Rule Sets"],
      summary: "Update rule set",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "Rule Set ID",
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                active: { type: "boolean" },
                logicOperator: {
                  type: "string",
                  enum: Object.values(RuleLogicOperator),
                },
                rules: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: Object.values(RuleType) },
                      scope: { type: "string", enum: Object.values(RuleScope) },
                      operator: {
                        type: "string",
                        enum: Object.values(RuleOperator),
                      },
                      value: { description: "Mixed value based on type" },
                      metadata: { type: "object" },
                    },
                    required: ["type", "operator", "value"],
                  },
                },
                tags: { type: "array", items: { type: "string" } },
                validFrom: { type: "string", format: "date-time" },
                validUntil: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Updated Successfully" },
        400: { description: "Bad Request" },
        404: { description: "Not Found" },
      },
    },
  },
  "/api/v1/rule-sets/delete/{id}": {
    delete: {
      tags: ["Admin - Rule Sets"],
      summary: "Delete a rule set",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "Rule Set ID",
        },
      ],
      responses: {
        200: { description: "Success" },
        404: { description: "Not Found" },
      },
    },
  },
};

module.exports = ruleSetDocs;
