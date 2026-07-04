module.exports = {
  "/videos/": {
    post: {
      summary: "Create a new video",
      tags: ["Videos"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["title", "thumbnailUrl", "videoUrl"],
              properties: {
                title: { type: "string", minLength: 1, example: "How to use HydaCon" },
                description: { type: "string", example: "A step-by-step guide" },
                thumbnailUrl: { type: "string", format: "uri", example: "https://cdn.example.com/thumb.jpg" },
                videoUrl: { type: "string", format: "uri", example: "https://cdn.example.com/video.mp4" },
                duration: { type: "string", example: "02:30" },
                categoryId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
                productId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d2" },
                tags: { type: "array", items: { type: "string" }, example: ["tutorial", "hydacon"] },
                language: { type: "string", example: "en" },
                region: { type: "string", example: "IN" },
                sortOrder: { type: "integer", minimum: 0, example: 1 },
                featured: { type: "boolean", example: false },
                active: { type: "boolean", example: true },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Video created successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Video created successfully" },
                  data: { $ref: "#/components/schemas/Video" },
                },
              },
            },
          },
        },
        400: { description: "Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/videos/list": {
    post: {
      summary: "Get paginated list of videos (Admin)",
      tags: ["Videos"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                page: { type: "integer", default: 1, example: 1 },
                limit: { type: "integer", default: 10, example: 10 },
                search: { type: "string", description: "Search by title", example: "tutorial" },
                categoryId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
                productId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d2" },
                language: { type: "string", example: "en" },
                active: { type: "boolean", example: true },
                featured: { type: "boolean", example: false },
                sortBy: {
                  type: "string",
                  enum: ["views", "saves", "newest", "createdAt", "sortOrder"],
                  default: "createdAt",
                  example: "views",
                },
                sortOrder: {
                  type: "string",
                  enum: ["asc", "desc"],
                  default: "desc",
                  example: "desc",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Paginated list of videos",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Videos fetched successfully" },
                  data: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Video" },
                      },
                      total: { type: "integer", example: 42 },
                      page: { type: "integer", example: 1 },
                      limit: { type: "integer", example: 10 },
                      totalPages: { type: "integer", example: 5 },
                    },
                  },
                },
              },
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/videos/featured": {
    get: {
      summary: "Get all featured active videos (Mobile / Admin)",
      tags: ["Videos"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "List of featured videos sorted by sortOrder",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Featured videos fetched successfully" },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Video" },
                  },
                },
              },
            },
          },
        },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/videos/{id}": {
    get: {
      summary: "Get single video by ID",
      tags: ["Videos"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Video MongoDB ObjectId",
        },
      ],
      responses: {
        200: {
          description: "Video details",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Video fetched successfully" },
                  data: { $ref: "#/components/schemas/Video" },
                },
              },
            },
          },
        },
        404: { description: "Video not found" },
        401: { description: "Unauthorized" },
      },
    },
    patch: {
      summary: "Update a video by ID (Admin only)",
      tags: ["Videos"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
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
                title: { type: "string" },
                description: { type: "string" },
                thumbnailUrl: { type: "string", format: "uri" },
                videoUrl: { type: "string", format: "uri" },
                duration: { type: "string" },
                categoryId: { type: "string" },
                productId: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                language: { type: "string" },
                region: { type: "string" },
                sortOrder: { type: "integer", minimum: 0 },
                featured: { type: "boolean" },
                active: { type: "boolean" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Video updated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Video updated successfully" },
                  data: { $ref: "#/components/schemas/Video" },
                },
              },
            },
          },
        },
        404: { description: "Video not found" },
        401: { description: "Unauthorized" },
      },
    },
    delete: {
      summary: "Hard delete a video by ID (Admin only) — removes document and all analytics",
      tags: ["Videos"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Video deleted successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Video deleted successfully" },
                  data: { $ref: "#/components/schemas/Video" },
                },
              },
            },
          },
        },
        404: { description: "Video not found" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/videos/{id}/status": {
    patch: {
      summary: "Toggle active/inactive status of a video (Admin only)",
      tags: ["Videos"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Video status toggled",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Video status updated successfully" },
                  data: { $ref: "#/components/schemas/Video" },
                },
              },
            },
          },
        },
        404: { description: "Video not found" },
        401: { description: "Unauthorized" },
      },
    },
  },

  "/videos/{id}/metrics": {
    post: {
      summary: "Increment a video engagement metric (views / saves / shares)",
      tags: ["Videos"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
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
              required: ["metricType"],
              properties: {
                metricType: {
                  type: "string",
                  enum: ["views", "saves", "shares"],
                  example: "views",
                  description: "The metric counter to increment by 1",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Metric incremented successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Video metrics updated successfully" },
                  data: { $ref: "#/components/schemas/Video" },
                },
              },
            },
          },
        },
        400: { description: "Invalid metric type" },
        404: { description: "Video not found" },
        401: { description: "Unauthorized" },
      },
    },
  },
};
