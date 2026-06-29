module.exports = {
  "/documents": {
    post: {
      tags: ["Documents"],
      summary: "Add new documents",
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                documents: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      docId: { type: "string" },
                      docName: { type: "string" },
                      docSize: { type: "number" },
                      docType: { type: "string" },
                      docUrl: { type: "string" },
                      number: { type: "string" },
                    },
                    required: ["docId", "docName", "docType", "docUrl"],
                  },
                },
              },
              required: ["documents"],
            },
          },
        },
      },
      responses: {
        201: { description: "Documents added successfully" },
        400: { description: "Bad request or duplicates found" },
      },
    },
    get: {
      tags: ["Documents"],
      summary: "List documents",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
        { name: "docName", in: "query", schema: { type: "string" } },
        { name: "docType", in: "query", schema: { type: "string" } },
        { name: "ownerId", in: "query", schema: { type: "string" }, description: "Admin only" },
      ],
      responses: {
        200: { description: "Documents retrieved successfully" },
      },
    },
  },
  "/documents/{docId}": {
    get: {
      tags: ["Documents"],
      summary: "Get document details",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "docId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Document retrieved successfully" },
        404: { description: "Document not found" },
      },
    },
    patch: {
      tags: ["Documents"],
      summary: "Update a document",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "docId",
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
                docName: { type: "string" },
                docSize: { type: "number" },
                comment: { type: "string" },
                number: { type: "string" },
                lock: { type: "boolean" },
                status: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Document updated successfully" },
        400: { description: "Bad request or document is locked" },
        404: { description: "Document not found" },
      },
    },
    delete: {
      tags: ["Documents"],
      summary: "Delete a document",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "docId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Document deleted successfully" },
        400: { description: "Document is locked" },
        404: { description: "Document not found" },
      },
    },
  },
};
