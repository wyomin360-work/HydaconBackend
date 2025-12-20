module.exports = {
  "/redeems/list": {
    post: {
      summary: "Get all redeems (paginated)",
      tags: ["Redeems"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                page: {
                  type: "integer",
                  default: 1,
                  description: "Page number",
                },
                limit: {
                  type: "integer",
                  default: 20,
                  description: "Number of redeems per page",
                },
                search: {
                  type: "string",
                  description:
                    "Search by userId, productId, rewardId, or rewardUidCode",
                },
              },
              required: ["page", "limit"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "List of redeems with pagination",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      redeems: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            _id: { type: "string" },
                            userId: { type: "string" },
                            productId: { type: "string" },
                            rewardId: { type: "string" },
                            rewardUidCode: { type: "string" },
                            rewardPoints: { type: "number" },
                            status: { type: "string", example: "SUCCESS" },
                            cardBg: { type: "string", example: "#d0f0f2f0" },
                            createdAt: { type: "string", format: "date-time" },
                            updatedAt: { type: "string", format: "date-time" },
                            __v: { type: "integer" },
                            id: { type: "string" },
                            product: {
                              type: "object",
                              properties: {
                                _id: { type: "string" },
                                name: { type: "string" },
                                description: { type: "string" },
                                netWeight: { type: "string" },
                                price: { type: "number" },
                                rewardPoints: { type: "integer" },
                                __v: { type: "integer" },
                                updatedAt: {
                                  type: "string",
                                  format: "date-time",
                                },
                              },
                            },
                            user: {
                              type: "object",
                              properties: {
                                _id: { type: "string" },
                                name: { type: "string" },
                                email: { type: "string" },
                              },
                            },
                            reward: {
                              type: "object",
                              properties: {
                                _id: { type: "string" },
                                productId: { type: "string" },
                                uidCode: { type: "string" },
                                point: { type: "integer" },
                                expiresAt: {
                                  type: "string",
                                  format: "date-time",
                                },
                                isRedeemed: { type: "boolean" },
                                active: { type: "boolean" },
                                __v: { type: "integer" },
                                redeemedAt: {
                                  type: "string",
                                  format: "date-time",
                                },
                                redeemedBy: { type: "string" },
                              },
                            },
                          },
                        },
                      },
                      limit: { type: "integer", example: 20 },
                      total: { type: "integer", example: 100 },
                      page: { type: "integer", example: 1 },
                      totalPages: { type: "integer", example: 5 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  "/redeems/create": {
    post: {
      summary: "Create a new redeem",
      tags: ["Redeems"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userId", "productId", "rewardId", "rewardUidCode"],
              properties: {
                userId: { type: "string", description: "User ID (UUID)" },
                productId: { type: "string", description: "Product ID (UUID)" },
                rewardId: { type: "string", description: "Reward ID (UUID)" },
                rewardUidCode: {
                  type: "string",
                  description: "Unique code for reward",
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Redeem created successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "redeem successful" },
                  data: {
                    type: "object",
                    properties: {
                      redeemSuccessful: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Invalid input" },
        404: { description: "User, product, or reward not found" },
      },
    },
  },

  "/redeems/details/{redeemId}": {
    get: {
      summary: "Get redeem details by ID",
      tags: ["Redeems"],
      parameters: [
        {
          name: "redeemId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Redeem details",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      user: { type: "object" },
                      product: { type: "object" },
                      reward: { type: "object" },
                      rewardUidCode: { type: "string" },
                      rewardPoints: { type: "number" },
                      status: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
        404: { description: "Redeem not found" },
      },
    },
  },

  "/redeems/delete/{redeemId}": {
    delete: {
      summary: "Delete a redeem by ID",
      tags: ["Redeems"],
      parameters: [
        {
          name: "redeemId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Redeem deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "redeem deleted" },
                  data: {
                    type: "object",
                    properties: {
                      redeemDeleted: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
        404: { description: "Redeem not found" },
      },
    },
  },
};
