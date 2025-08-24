module.exports = {
  "/admin/auth/register": {
    post: {
      summary: "Register a new admin",
      tags: ["Admin"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "password"],
              properties: {
                name: { type: "string", example: "John Doe" },
                email: { type: "string", format: "email", example: "admin@example.com" },
                password: { type: "string", format: "password", example: "StrongPassword123" }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: "Registration successful",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Registration successful" },
                  data: {
                    type: "object",
                    properties: {
                      _id: { type: "string", example: "64b5f4c8a4e6f9c7e3a4a8b1" },
                      name: { type: "string", example: "John Doe" },
                      email: { type: "string", format: "email", example: "admin@example.com" },
                      accessToken: { type: "string", example: "eyJhbGciOi..." },
                      refreshToken: { type: "string", example: "eyJhbGciOi..." }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: "Email already exists or invalid data" }
      }
    }
  },

  "/admin/auth/login": {
    post: {
      summary: "Login admin",
      tags: ["Admin"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email", example: "admin@example.com" },
                password: { type: "string", format: "password", example: "StrongPassword123" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Login successful",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "registration success" },
                  data: {
                    type: "object",
                    properties: {
                      _id: { type: "string", example: "64b5f4c8a4e6f9c7e3a4a8b1" },
                      name: { type: "string", example: "John Doe" },
                      email: { type: "string", format: "email", example: "admin@example.com" },
                      accessToken: { type: "string", example: "eyJhbGciOi..." },
                      refreshToken: { type: "string", example: "eyJhbGciOi..." }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: "Invalid credentials" }
      }
    }
  },

  "/admin/auth/logout": {
    post: {
      summary: "Logout admin",
      tags: ["Admin"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Logout successful",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Logged Out successfully" },
                  data: {
                    type: "object",
                    properties: {
                      loggedOut: { type: "boolean", example: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};
