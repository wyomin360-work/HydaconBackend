module.exports = {
  "/scratch-cards/list": {
    post: {
      tags: ["Scratch Cards"],
      summary: "List user scratch cards",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                userId: { type: "string", description: "Admin only: target user ID" },
                page: { type: "integer", minimum: 1, default: 1 },
                limit: { type: "integer", minimum: 1, default: 15 },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "List retrieved successfully" },
        400: { description: "Bad Request" },
        401: { description: "Unauthorized" },
      },
    },
  },
  "/scratch-cards/scratch/{id}": {
    post: {
      tags: ["Scratch Cards"],
      summary: "Scratch a card",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Scratch card ID",
        },
      ],
      responses: {
        200: { description: "Card scratched successfully" },
        400: { description: "Bad Request" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Card not found" },
      },
    },
  },
};
