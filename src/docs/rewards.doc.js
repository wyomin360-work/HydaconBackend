module.exports = {
  "/rewards/batches": {
    post: {
      summary: "List reward batches with stored counts",
      tags: ["Rewards"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["page", "limit"],
              properties: {
                page: { type: "integer", minimum: 1, default: 1 },
                limit: { type: "integer", minimum: 1, maximum: 200, default: 20 },
                productId: { type: "string" },
                search: { type: "string", description: "Prefix search on batchUid" },
                startDate: { type: "string" },
                endDate: { type: "string" },
                activityStatus: { type: "string", enum: ["active", "inactive"] },
                status: { type: "string", enum: ["creating", "complete", "failed"] },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Paginated batches with product and active/inactive/total counts",
        },
      },
    },
  },
  "/rewards/batches/{batchId}": {
    get: {
      summary: "Get reward batch metadata by ID",
      tags: ["Rewards"],
      parameters: [{ name: "batchId", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Reward batch metadata" }, 404: { description: "Batch not found" } },
    },
    patch: {
      summary: "Update unscanned rewards in a batch",
      tags: ["Rewards"],
      parameters: [{ name: "batchId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                expiresAt: { type: "string", format: "date-time", description: "Must be in the future" },
                endDate: { type: "string", format: "date-time", description: "Alias for expiresAt; must be in the future" },
                rewardPoints: { type: "integer", minimum: 0 },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Updated unscanned batch rewards" }, 400: { description: "Expiry date must be in the future" } },
    },
    delete: {
      summary: "Delete a reward batch",
      description: "Hard-deletes active rewards, soft-deletes inactive rewards, and hides the batch from batch listings.",
      tags: ["Rewards"],
      parameters: [{ name: "batchId", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Batch deleted" }, 404: { description: "Batch not found" } },
    },
  },
  "/rewards/batches/{batchId}/deactivate": {
    patch: {
      summary: "Deactivate all active rewards in a batch",
      tags: ["Rewards"],
      parameters: [{ name: "batchId", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Active batch rewards deactivated" }, 404: { description: "Batch not found" } },
    },
  },
  "/rewards/batches/{batchId}/rewards": {
    post: {
      summary: "List rewards belonging to a batch",
      tags: ["Rewards"],
      parameters: [{ name: "batchId", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["page", "limit"],
              properties: { page: { type: "integer" }, limit: { type: "integer" }, search: { type: "string" } },
            },
          },
        },
      },
      responses: { 200: { description: "Paginated rewards and batch metadata" }, 404: { description: "Batch not found" } },
    },
  },
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
                count: { type: "integer", minimum: 1, maximum: 10000 },
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
                      batchId: { type: "string", example: "64a1b2c3d4e5f67890123456" },
                      totalCount: { type: "integer", example: 10 },
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
  "/rewards/bulk-update": {
    patch: {
      summary: "Bulk update active rewards",
      tags: ["Rewards"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["rewardIds"],
              properties: {
                rewardIds: {
                  type: "array",
                  items: { type: "string" },
                  example: ["64a1b2c3d4e5f67890123456", "64a1b2c3d4e5f67890123457"],
                },
                rewardPoints: { type: "integer", minimum: 0, example: 100 },
                expiresAt: { type: "string", format: "date-time", example: "2026-12-31T23:59:59.999Z" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Rewards bulk updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "rewards updated" },
                  data: {
                    type: "object",
                    properties: {
                      matchedCount: { type: "integer", example: 5 },
                      modifiedCount: { type: "integer", example: 5 },
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
  "/rewards/batch-update": {
    patch: {
      summary: "Batch update rewards by created date and product ID",
      tags: ["Rewards"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["productId", "createdDate"],
              properties: {
                productId: { type: "string", example: "64a1b2c3d4e5f67890123456" },
                createdDate: { type: "string", example: "2026-09-25" },
                rewardPoints: { type: "integer", minimum: 0, example: 100 },
                expiresAt: { type: "string", format: "date-time", example: "2026-12-31T23:59:59.999Z" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Rewards batch updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "rewards updated" },
                  data: {
                    type: "object",
                    properties: {
                      matchedCount: { type: "integer", example: 10 },
                      modifiedCount: { type: "integer", example: 10 },
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
