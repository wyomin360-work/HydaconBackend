module.exports = {
  "/roles": {
    post: {
      tags: ["Roles"],
      summary: "Create a new role",
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
                isActive: { type: "boolean" },
                pointMultiplier: { type: "number" },
                permissions: { type: "array", items: { type: "string" } },
              },
              required: ["name"],
            },
          },
        },
      },
      responses: {
        200: { description: "Role created successfully" },
        400: { description: "Bad request" },
      },
    },
    get: {
      tags: ["Roles"],
      summary: "Get all roles",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "isActive",
          in: "query",
          schema: { type: "boolean" },
          description: "Filter by active status",
        },
      ],
      responses: {
        200: { description: "Roles fetched successfully" },
      },
    },
  },
  "/roles/{roleId}": {
    patch: {
      tags: ["Roles"],
      summary: "Update a role",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "roleId",
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
                isActive: { type: "boolean" },
                pointMultiplier: { type: "number" },
                permissions: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Role updated successfully" },
        404: { description: "Role not found" },
      },
    },
    delete: {
      tags: ["Roles"],
      summary: "Delete a role",
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "roleId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Role deleted successfully" },
        404: { description: "Role not found" },
      },
    },
  },
};
