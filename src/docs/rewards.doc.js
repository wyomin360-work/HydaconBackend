module.exports = {
  "/rewards/list": {
    post: {
      summary: "Get all rewards (paginated)",
      tags: ["Rewards"],
      requestBody: {
        required: false,
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
                  description: "Number of rewards per page",
                },
                productId: {
                  type: "string",
                  format: "uuid",
                  description: "Filter by product ID",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "List of rewards with pagination",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "success" },
                  data: {
                    type: "object",
                    properties: {
                      data: {
                        type: "object",
                        properties: {
                          rewards: {
                            type: "array",
                            items: {
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
                                redeemedAt: {
                                  type: "string",
                                  format: "date-time",
                                  nullable: true,
                                },
                                redeemedBy: { type: "string", nullable: true },
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
                              },
                            },
                          },
                          page: { type: "integer", example: 2 },
                          limit: { type: "integer", example: 1 },
                          totalPages: { type: "integer", example: 74 },
                          total: { type: "integer", example: 74 },
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
    },
  },
  "/rewards/create": {
    post: {
      summary: "Create multiple rewards for a product",
      tags: ["Rewards"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["expiresAt", "productId", "count"],
              properties: {
                expiresAt: { type: "string", format: "date-time" },
                productId: { type: "string", format: "uuid" },
                count: { type: "integer", minimum: 1 },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Rewards created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Created 10 rewards" },
                  data: {
                    type: "object",
                    properties: {
                      rewardsAdded: { type: "boolean", example: true },
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
  "/rewards/details/{rewardId}": {
    get: {
      summary: "Get reward details by ID",
      tags: ["Rewards"],
      parameters: [
        {
          name: "rewardId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Reward details",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      productId: { type: "string" },
                      expiresAt: { type: "string", format: "date-time" },
                      uidCode: { type: "string" },
                      point: { type: "integer" },
                      active: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
        404: { description: "Reward not found" },
      },
    },
  },
  "/rewards/update/{rewardId}": {
    patch: {
      summary: "Update reward details",
      tags: ["Rewards"],
      parameters: [
        {
          name: "rewardId",
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
              required: ["rewardPoints", "active"],
              properties: {
                expiresAt: { type: "string", format: "date-time" },
                rewardPoints: { type: "integer", minimum: 0 },
                active: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Reward updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "reward updated" },
                  data: {
                    type: "object",
                    properties: {
                      rewardsUpdated: { type: "boolean", example: true },
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
  "/rewards/delete/{rewardId}": {
    delete: {
      summary: "Delete reward by ID",
      tags: ["Rewards"],
      parameters: [
        {
          name: "rewardId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Reward deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "reward deleted" },
                  data: {
                    type: "object",
                    properties: {
                      rewardDeleted: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
        404: { description: "Reward not found" },
      },
    },
  },
};
