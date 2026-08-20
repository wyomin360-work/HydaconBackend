const loyaltyPaths = require("../modules/loyalty/loyalty.paths");

const root = loyaltyPaths.root;

module.exports = {
  [`${root}${loyaltyPaths.summary}`]: {
    get: {
      summary: "Get User Loyalty Summary",
      tags: ["Loyalty User"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "User loyalty summary fetched successfully" },
        401: { description: "Unauthorized" },
      },
    },
  },
  [`${root}${loyaltyPaths.progression}`]: {
    get: {
      summary: "Get User Tier Progression Metadata",
      tags: ["Loyalty User"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "User tier progression metadata fetched successfully",
        },
        401: { description: "Unauthorized" },
      },
    },
  },
  [`${root}${loyaltyPaths.claimReward}`]: {
    post: {
      summary: "Claim User Unlocked Tier Rewards",
      tags: ["Loyalty User"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                seasonId: { type: "string" },
                tierId: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Tier rewards claimed successfully" },
        400: { description: "No eligible tiers or no rewards available" },
        403: { description: "Tier not reached yet" },
        409: { description: "Rewards already claimed" },
      },
    },
  },
  [`${root}${loyaltyPaths.admin.tiers}`]: {
    get: {
      summary: "List Loyalty Tiers",
      tags: ["Loyalty Admin"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "Tiers listed successfully" },
      },
    },
    post: {
      summary: "Create Loyalty Tier",
      tags: ["Loyalty Admin"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "key", "rank"],
              properties: {
                name: { type: "string", example: "Gold" },
                key: { type: "string", example: "gold" },
                rank: { type: "integer", example: 3 },
                colorIdentity: { type: "string", example: "#FFD700" },
                qualificationPoint: { type: "number", example: 1000 },
                threshold: { type: "number", example: 1000 },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Tier created successfully" },
        400: { description: "Invalid tier data" },
      },
    },
  },
  [`${root}${loyaltyPaths.admin.seasons}`]: {
    get: {
      summary: "List Loyalty Seasons",
      tags: ["Loyalty Admin"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "Seasons listed successfully" },
      },
    },
    post: {
      summary: "Create Loyalty Season",
      tags: ["Loyalty Admin"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string", example: "Season 1" },
                code: { type: "string", example: "S1" },
                startDate: { type: "string", format: "date-time" },
                endDate: { type: "string", format: "date-time" },
                active: { type: "boolean", example: true },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Season created successfully" },
      },
    },
  },
  [`${root}${loyaltyPaths.admin.tierConfigurations}`]: {
    get: {
      summary: "List Tier Configurations",
      tags: ["Loyalty Admin"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "Tier configurations listed successfully" },
      },
    },
    post: {
      summary: "Create Tier Configuration",
      tags: ["Loyalty Admin"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["seasonId", "tierId"],
              properties: {
                seasonId: { type: "string" },
                tierId: { type: "string" },
                qualificationPoint: { type: "number", example: 500 },
                threshold: { type: "number", example: 500 },
                pointMultiplier: { type: "number", example: 1.2 },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Tier configuration created successfully" },
      },
    },
  },
};
