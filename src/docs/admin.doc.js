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
                email: {
                  type: "string",
                  format: "email",
                  example: "admin@example.com",
                },
                password: {
                  type: "string",
                  format: "password",
                  example: "StrongPassword123",
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "Registration successful",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Registration successful",
                  },
                  data: {
                    type: "object",
                    properties: {
                      _id: {
                        type: "string",
                        example: "64b5f4c8a4e6f9c7e3a4a8b1",
                      },
                      name: { type: "string", example: "John Doe" },
                      email: {
                        type: "string",
                        format: "email",
                        example: "admin@example.com",
                      },
                      accessToken: { type: "string", example: "eyJhbGciOi..." },
                      refreshToken: {
                        type: "string",
                        example: "eyJhbGciOi...",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Email already exists or invalid data" },
      },
    },
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
                email: {
                  type: "string",
                  format: "email",
                  example: "admin@example.com",
                },
                password: {
                  type: "string",
                  format: "password",
                  example: "StrongPassword123",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Login successful",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Login success" },
                  data: {
                    type: "object",
                    properties: {
                      _id: {
                        type: "string",
                        example: "64b5f4c8a4e6f9c7e3a4a8b1",
                      },
                      name: { type: "string", example: "John Doe" },
                      email: {
                        type: "string",
                        format: "email",
                        example: "admin@example.com",
                      },
                      accessToken: { type: "string", example: "eyJhbGciOi..." },
                      refreshToken: {
                        type: "string",
                        example: "eyJhbGciOi...",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Invalid credentials" },
      },
    },
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
                  message: {
                    type: "string",
                    example: "Logged Out successfully",
                  },
                  data: {
                    type: "object",
                    properties: {
                      loggedOut: { type: "boolean", example: true },
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

  "/admin/auth/forgot-password": {
    post: {
      tags: ["Admin Auth"],
      summary: "Generate Forgot Password Token & Send Email",
      description:
        "Generates a token for password reset and sends an email to the admin",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                email: {
                  type: "string",
                  format: "email",
                  example: "admin@example.com",
                },
              },
              required: ["email"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Password reset link generated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Password reset link generated",
                  },
                  resetToken: { type: "string", example: "abc123token" },
                },
              },
            },
          },
        },
        404: { description: "Admin not found with this email" },
        500: { description: "Failed to send mail, try again" },
      },
    },
  },

  "/admin/auth/reset-password": {
    post: {
      tags: ["Admin Auth"],
      summary: "Reset Password using token",
      description: "Resets the admin password using the provided reset token",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                token: { type: "string", example: "abc123token" },
                newPassword: {
                  type: "string",
                  example: "newStrongPassword123",
                },
              },
              required: ["token", "newPassword"],
            },
          },
        },
      },
      responses: {
        200: {
          description: "Password reset successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Password reset successfully",
                  },
                },
              },
            },
          },
        },
        400: { description: "Invalid or expired reset token" },
      },
    },
  },

  "/admin/list": {
    post: {
      summary: "Get list of admins",
      tags: ["Admin"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                page: { type: "integer", example: 1 },
                limit: { type: "integer", example: 10 },
                search: { type: "string", example: "John" },
                sortBy: { type: "string", example: "createdAt" },
                sortOrder: {
                  type: "string",
                  enum: ["asc", "desc"],
                  example: "desc",
                },
                filters: {
                  type: "object",
                  properties: {
                    authType: { type: "string", example: "admin" },
                    enableNotification: { type: "boolean", example: true },
                    agreedToTerms: { type: "boolean", example: true },
                    minPoints: { type: "integer", example: 10 },
                    maxPoints: { type: "integer", example: 100 },
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Admin list retrieved successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      admins: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            _id: {
                              type: "string",
                              example: "64b5f4c8a4e6f9c7e3a4a8b1",
                            },
                            name: { type: "string", example: "John Doe" },
                            email: {
                              type: "string",
                              format: "email",
                              example: "admin@example.com",
                            },
                            authType: { type: "string", example: "admin" },
                            enableNotification: {
                              type: "boolean",
                              example: true,
                            },
                            agreedToTerms: { type: "boolean", example: true },
                            totalPoints: { type: "integer", example: 50 },
                            createdAt: {
                              type: "string",
                              format: "date-time",
                              example: "2025-09-25T12:00:00Z",
                            },
                            updatedAt: {
                              type: "string",
                              format: "date-time",
                              example: "2025-09-25T12:00:00Z",
                            },
                          },
                        },
                      },
                      page: { type: "integer", example: 1 },
                      limit: { type: "integer", example: 10 },
                      totalPages: { type: "integer", example: 5 },
                      total: { type: "integer", example: 50 },
                    },
                  },
                },
              },
            },
          },
        },
        401: { description: "Unauthorized - Invalid or missing token" },
      },
    },
  },
};
