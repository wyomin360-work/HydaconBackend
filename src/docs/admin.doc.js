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
                  message: { type: "string", example: "Login success" },
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
  },

  "/admin/auth/forgot-password": {
    post: {
      tags: ['Admin Auth'],
      summary: 'Generate Forgot Password Token & Send Email',
      description: 'Generates a token for password reset and sends an email to the admin',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                email: {
                  type: 'string',
                  format: 'email',
                  example: 'admin@example.com'
                }
              },
              required: ['email']
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Password reset link generated',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string', example: 'Password reset link generated' },
                  resetToken: { type: 'string', example: 'abc123token' }
                }
              }
            }
          }
        },
        404: { description: 'Admin not found with this email' },
        500: { description: 'Failed to send mail, try again' }
      }
    }
  },

  "/admin/auth/reset-password": {
    post: {
      tags: ['Admin Auth'],
      summary: 'Reset Password using token',
      description: 'Resets the admin password using the provided reset token',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                token: { type: 'string', example: 'abc123token' },
                newPassword: { type: 'string', example: 'newStrongPassword123' }
              },
              required: ['token', 'newPassword']
            }
          }
        }
      },
      responses: {
        200: {
          description: 'Password reset successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string', example: 'Password reset successfully' }
                }
              }
            }
          }
        },
        400: { description: 'Invalid or expired reset token' }
      }
    }
  }
};
