module.exports = {
  "/user/auth/register": {
    post: {
      summary: "Register a new user",
      tags: ["User"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "email", "password"],
              properties: {
                name: { type: "string", example: "Jane Doe" },
                email: { type: "string", format: "email", example: "user@example.com" },
                password: { type: "string", format: "password", example: "UserPassword123" }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: "User registration successful",
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
                      name: { type: "string", example: "Jane Doe" },
                      email: { type: "string", example: "user@example.com" },
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

  "/user/auth/login": {
    post: {
      summary: "Login user",
      tags: ["User"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", format: "email", example: "user@example.com" },
                password: { type: "string", format: "password", example: "UserPassword123" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "User login successful",
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
                      name: { type: "string", example: "Jane Doe" },
                      email: { type: "string", example: "user@example.com" },
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

  "/user/auth/logout": {
    post: {
      summary: "Logout user",
      tags: ["User"],
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


  "/user/auth/verify-email": {
    post: {
      summary: "Forgot password",
      tags: ["User"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email"],
              properties: {
                email: { type: "string", format: "email", example: "user@example.com" },
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Otp sent to user@example.com" },
                  data: {
                    type: "object",
                    properties: {
                      otpSent: { type: "boolean", example: "true" },
                      token: { type: "string", example: "eyJhbGciOi..." }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: "Token not found" }
      }
    }
  },

  "/user/auth/verify-otp": {
    post: {
      summary: "Verify otp",
      tags: ["User"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["otp", "token"],
              properties: {
                otp: { type: "string", example: "1234" },
                token: { type: "string", example: "eyJhbGciOi..." },
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "otp verified" },
                  data: {
                    type: "object",
                    properties: {
                      otpVerified: { type: "boolean", example: "true" },
                      token: { type: "string", example: "eyJhbGciOi..." }
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: "User not found" }
      }
    }
  },

  "/user/auth/reset-password": {
    post: {
      summary: "Reset Password",
      tags: ["User"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["password", "token"],
              properties: {
                password: { type: "string", example: "User@123" },
                token: { type: "string", example: "eyJhbGciOi..." },
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Password updated successfully" },
                  data: {
                    type: "object",
                    properties: {
                      passwordUpdated: { type: "boolean", example: "true" },
                    }
                  }
                }
              }
            }
          }
        },
        400: { description: "Reset token not found" }
      }
    }
  },

};
