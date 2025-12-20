const { patch } = require("../modules/user/user.routes");

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
                email: {
                  type: "string",
                  format: "email",
                  example: "user@example.com",
                },
                password: {
                  type: "string",
                  format: "password",
                  example: "UserPassword123",
                },
                avatarId: {
                  type: "string",
                  example: "user_avatar_03",
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          description: "User registration successful",
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
                      name: { type: "string", example: "Jane Doe" },
                      email: { type: "string", example: "user@example.com" },
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
                email: {
                  type: "string",
                  format: "email",
                  example: "user@example.com",
                },
                password: {
                  type: "string",
                  format: "password",
                  example: "UserPassword123",
                },
              },
            },
          },
        },
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
                      _id: {
                        type: "string",
                        example: "64b5f4c8a4e6f9c7e3a4a8b1",
                      },
                      name: { type: "string", example: "Jane Doe" },
                      email: { type: "string", example: "user@example.com" },
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
                email: {
                  type: "string",
                  format: "email",
                  example: "user@example.com",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Otp sent to user@example.com",
                  },
                  data: {
                    type: "object",
                    properties: {
                      otpSent: { type: "boolean", example: "true" },
                      token: { type: "string", example: "eyJhbGciOi..." },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Token not found" },
      },
    },
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
              },
            },
          },
        },
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
                      token: { type: "string", example: "eyJhbGciOi..." },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "User not found" },
      },
    },
  },

  "/user/auth/reset-password": {
    patch: {
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
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Password updated successfully",
                  },
                  data: {
                    type: "object",
                    properties: {
                      passwordUpdated: { type: "boolean", example: "true" },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Reset token not found" },
      },
    },
  },
  "/user/auth/external-provider": {
    post: {
      summary: "Authenticate with External Provider (e.g., Google)",
      tags: ["User"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["idToken", "provider"],
              properties: {
                idToken: {
                  type: "string",
                  example: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjM4YmY...",
                },
                provider: {
                  type: "string",
                  enum: ["GOOGLE", "APPLE", "EMAIL"],
                  example: "GOOGLE",
                },
                avatarId: {
                  type: "string",
                  example: "user_avatar_03",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Success",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Logged in successfully",
                  },
                  data: {
                    type: "object",
                    properties: {
                      id: {
                        type: "string",
                        example: "64f7c4d0f1f3c9a431c5d172",
                      },
                      name: { type: "string", example: "John Doe" },
                      email: { type: "string", example: "john@example.com" },
                      accessToken: {
                        type: "string",
                        example: "eyJhbGciOiJIUzI1NiIsInR...",
                      },
                      refreshToken: {
                        type: "string",
                        example: "dghjkuytrewqasdfghjkl...",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: "Invalid provider data or token",
        },
        403: {
          description: "Account registered with different provider",
        },
      },
    },
  },

  // ----------------------------------------------------------------------
  // User Details
  "user/details": {
    get: {
      summary: "Get User Details",
      tags: ["User"],
      responses: {
        200: {
          description: "User details retrieved successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  _id: { type: "string", example: "68d285be7f43fd417a22ef62" },
                  name: { type: "string", example: "Ajmal" },
                  email: { type: "string", example: "ajmal123@gmail.com" },
                  password: {
                    type: "string",
                    example: "$2b$10$3aLk6Ak36jK...",
                  },
                  fcmTokens: {
                    type: "array",
                    items: { type: "string" },
                    example: ["e9siLWrrSOG0nk5LfNWemf:APA91bFOtEcC0uTQMnsO..."],
                  },
                  totalPoints: { type: "integer", example: 0 },
                  totalWithdraw: { type: "integer", example: 0 },
                  agreedToTerms: { type: "boolean", example: true },
                  enableNotification: { type: "boolean", example: true },
                  avatarId: { type: "string", example: "user_avatar_1" },
                  authType: { type: "string", example: "EMAIL" },
                  createdAt: {
                    type: "string",
                    format: "date-time",
                    example: "2025-09-23T11:34:22.475Z",
                  },
                  updatedAt: {
                    type: "string",
                    format: "date-time",
                    example: "2025-09-24T04:29:20.726Z",
                  },
                  __v: { type: "integer", example: 0 },
                  bankDetails: {
                    type: "object",
                    properties: {
                      accountNumber: {
                        type: "string",
                        example: "bc9bbd64d7e6829e89770fcb96682309",
                      },
                      accountIv: {
                        type: "string",
                        example: "8090a9f6641ce77eb85f53f23cbf768d",
                      },
                      ifscCode: {
                        type: "string",
                        example: "d224c2b57eb99b3a02e50bb99d2afdfc",
                      },
                      ifscIv: {
                        type: "string",
                        example: "ca02af40dcfc303948019501e4d4d576",
                      },
                      userName: { type: "string", example: "Ajmal" },
                      branchName: { type: "string", example: "HAJIGANJ" },
                      bankName: {
                        type: "string",
                        example: "State Bank of India",
                      },
                    },
                  },
                  limit: { type: "integer", example: 20 },
                  total: { type: "integer", example: 100 },
                  page: { type: "integer", example: 1 },
                  totalPages: { type: "integer", example: 5 },
                },
              },
            },
          },
        },
        404: {
          description: "User not found",
        },
      },
    },
  },
  "/user/profile/update": {
    patch: {
      summary: "Update User Profile",
      tags: ["User"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "avatarId"],
              properties: {
                name: {
                  type: "string",
                  example: "Prince Roy",
                },
                avatarId: {
                  type: "string",
                  example: "user_avatar_03",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Profile updated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Profile updated successfully",
                  },
                  data: {
                    type: "object",
                    properties: {
                      profileUpdated: {
                        type: "boolean",
                        example: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        404: {
          description: "User not found",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  error: {
                    type: "string",
                    example: "User not found",
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  // -----------------------------------------------------------------------
  // Bank Details
  "/user/bank-details": {
    get: {
      summary: "Get User Bank Details",
      tags: ["Bank"],
      responses: {
        200: {
          description: "Bank details retrieved successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  userName: { type: "string", example: "John Doe" },
                  accountNumber: { type: "string", example: "123456789012" },
                  ifscCode: { type: "string", example: "SBIN0001234" },
                  bankName: { type: "string", example: "State Bank of India" },
                  branchName: { type: "string", example: "PBB KANKARBAGH" },
                },
              },
            },
          },
        },
        404: {
          description: "User not found or bank details not added",
        },
      },
    },
  },

  "/user/bank-details/create": {
    post: {
      summary: "Add User Bank Details",
      tags: ["Bank"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userName", "accountNumber", "ifscCode"],
              properties: {
                userName: { type: "string", example: "John Doe" },
                accountNumber: { type: "string", example: "123456789012" },
                ifscCode: { type: "string", example: "SBIN0001234" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Bank details added successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Bank details been added successfully",
                  },
                  data: {
                    type: "object",
                    properties: {
                      addedBankDetails: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description: "Invalid request or bank details already exist",
        },
      },
    },
  },

  "/user/bank-details/update": {
    patch: {
      summary: "Update User Bank Details",
      tags: ["Bank"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userName", "accountNumber", "ifscCode"],
              properties: {
                userName: { type: "string", example: "John Doe" },
                accountNumber: { type: "string", example: "098765432101" },
                ifscCode: { type: "string", example: "SBIN0005678" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Bank details updated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Bank details been updated successfully",
                  },
                  data: {
                    type: "object",
                    properties: {
                      updatedBankDetails: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
        404: {
          description: "User or bank details not found",
        },
      },
    },
  },

  "/user/bank-details/delete": {
    delete: {
      summary: "Delete User Bank Details",
      tags: ["Bank"],
      responses: {
        200: {
          description: "Bank details deleted successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Bank details been deleted successfully",
                  },
                  data: {
                    type: "object",
                    properties: {
                      deletedBankDetails: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
        404: {
          description: "User or bank details not found",
        },
      },
    },
  },
};
