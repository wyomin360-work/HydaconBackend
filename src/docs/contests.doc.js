const contestsPaths = require("../modules/contests/contests.paths");

const root = contestsPaths.root;

module.exports = {
  [`${root}${contestsPaths.adminCreate}`]: {
    post: {
      summary: "Admin Create Contest",
      tags: ["Contests Admin"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "startDate", "endDate"],
              properties: {
                name: { type: "string", example: "Mega Summer Contest" },
                description: {
                  type: "string",
                  example: "Scan products to win exclusive rewards!",
                },
                bannerImage: {
                  type: "string",
                  example: "https://cdn.example.com/banner.jpg",
                },
                rewardSummary: {
                  type: "string",
                  example: "Top 3 winners get bonus points & gifts",
                },
                startDate: {
                  type: "string",
                  format: "date-time",
                  example: "2026-08-01T00:00:00.000Z",
                },
                endDate: {
                  type: "string",
                  format: "date-time",
                  example: "2026-08-31T23:59:59.000Z",
                },
                region: { type: "string", example: "Kerala" },
                productScope: {
                  type: "string",
                  enum: ["EVERY_PRODUCT", "SELECTED_PRODUCTS"],
                  example: "EVERY_PRODUCT",
                },
                metric: {
                  type: "string",
                  enum: ["points", "scan_count"],
                  example: "points",
                },
                tierScope: {
                  type: "string",
                  enum: ["ALL_TIERS", "SELECTED_TIERS"],
                  example: "ALL_TIERS",
                },
                prizes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      rank: { type: "integer", example: 1 },
                      rewardType: {
                        type: "string",
                        enum: ["points", "gift"],
                        example: "points",
                      },
                      points: { type: "integer", example: 500 },
                      giftName: { type: "string", example: "Gold Coin" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Contest created successfully" },
        400: { description: "Bad request / Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },
  [`${root}${contestsPaths.adminUpdate}`]: {
    patch: {
      summary: "Admin Update Contest",
      tags: ["Contests Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "contestId",
          in: "path",
          required: true,
          schema: { type: "string" },
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
                startDate: { type: "string", format: "date-time" },
                endDate: { type: "string", format: "date-time" },
                metric: {
                  type: "string",
                  enum: ["points", "scan_count"],
                  example: "points",
                },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Contest updated successfully" },
        404: { description: "Contest not found" },
      },
    },
  },
  [`${root}${contestsPaths.adminDelete}`]: {
    delete: {
      summary: "Admin Delete Contest",
      tags: ["Contests Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "contestId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Contest deleted successfully" },
        404: { description: "Contest not found" },
      },
    },
  },
  [`${root}${contestsPaths.adminList}`]: {
    get: {
      summary: "Admin List Contests",
      tags: ["Contests Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
        },
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: ["upcoming", "active", "completed"],
          },
        },
      ],
      responses: {
        200: { description: "Paginated list of contests" },
      },
    },
  },
  [`${root}${contestsPaths.adminDetails}`]: {
    get: {
      summary: "Admin Get Contest Details",
      tags: ["Contests Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "contestId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Contest details with entries" },
        404: { description: "Contest not found" },
      },
    },
  },
  [`${root}${contestsPaths.adminFinalise}`]: {
    post: {
      summary: "Admin Finalise Contest",
      tags: ["Contests Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "contestId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Contest finalised & prizes distributed" },
        404: { description: "Contest not found" },
      },
    },
  },
  [`${root}${contestsPaths.userList}`]: {
    get: {
      summary: "User List Contests",
      tags: ["Contests User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", default: 20 },
        },
        {
          name: "status",
          in: "query",
          schema: {
            type: "string",
            enum: ["upcoming", "active", "completed"],
          },
        },
      ],
      responses: {
        200: { description: "List of contests for user" },
      },
    },
  },
  [`${root}${contestsPaths.userDetails}`]: {
    get: {
      summary: "User Get Contest Details",
      tags: ["Contests User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "contestId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Contest details and user rank" },
        404: { description: "Contest not found" },
      },
    },
  },
  [`${root}${contestsPaths.userLeaderboard}`]: {
    get: {
      summary: "User Get Contest Leaderboard",
      tags: ["Contests User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "contestId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Contest leaderboard ranking" },
        404: { description: "Contest not found" },
      },
    },
  },
  [`${root}${contestsPaths.userClaimReward}`]: {
    post: {
      summary: "User Claim Contest Reward",
      tags: ["Contests User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "contestId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Reward claimed successfully" },
        400: { description: "Contest not completed or reward already claimed" },
        404: { description: "Contest or entry not found" },
      },
    },
  },
  [`${root}${contestsPaths.generalLeaderboard}`]: {
    get: {
      summary: "User General All-Time Leaderboard",
      tags: ["Contests User"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "General leaderboard rankings and user nearby rank",
        },
      },
    },
  },
};
