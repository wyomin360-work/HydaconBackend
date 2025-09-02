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
                email: { type: "string", format: "email", example: "user@example.com" },
                password: { type: "string", format: "password", example: "UserPassword123" },
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
  "/user/auth/external-provider": {
    post: {
      summary: "Authenticate with External Provider (e.g., Google)",
      tags: ["Auth"],
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
                  example: "eyJhbGciOiJSUzI1NiIsImtpZCI6IjM4YmY..."
                },
                provider: {
                  type: "string",
                  enum: ["GOOGLE", "APPLE", "EMAIL"],
                  example: "GOOGLE"
                }
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
                  message: {
                    type: "string",
                    example: "Logged in successfully"
                  },
                  data: {
                    type: "object",
                    properties: {
                      id: { type: "string", example: "64f7c4d0f1f3c9a431c5d172" },
                      name: { type: "string", example: "John Doe" },
                      email: { type: "string", example: "john@example.com" },
                      accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR..." },
                      refreshToken: { type: "string", example: "dghjkuytrewqasdfghjkl..." }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: "Invalid provider data or token"
        },
        403: {
          description: "Account registered with different provider"
        }
      }
    }
  },

  // ----------------------------------------------------------------------
  // User Details
  "user/details": {
    get: {
      summary: "Get User Details",
      tags: ['User'],
      responses: {
        200: {
          description: "User details retrieved successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  id: { type: "string", example: "64f7c4d0f1f3c9a431c5d172" },
                  name: { type: "string", example: "John Doe" },
                  email: { type: "string", example: "john@example.com" },
                  accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR..." },
                  refreshToken: { type: "string", example: "dghjkuytrewqasdfghjkl..." }
                }
              }
            }
          },
          404: {
            description: "User not found "
          }
        }
      }
    }
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
                  branchName: { type: "string", example: "PBB KANKARBAGH" }
                }
              }
            }
          }
        },
        404: {
          description: "User not found or bank details not added"
        }
      }
    }
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
                ifscCode: { type: "string", example: "SBIN0001234" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Bank details added successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Bank details been added successfully" },
                  data: {
                    type: "object",
                    properties: {
                      addedBankDetails: { type: "boolean", example: true }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: "Invalid request or bank details already exist"
        }
      }
    }
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
                ifscCode: { type: "string", example: "SBIN0005678" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Bank details updated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Bank details been updated successfully" },
                  data: {
                    type: "object",
                    properties: {
                      updatedBankDetails: { type: "boolean", example: true }
                    }
                  }
                }
              }
            }
          }
        },
        404: {
          description: "User or bank details not found"
        }
      }
    }
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
                  message: { type: "string", example: "Bank details been deleted successfully" },
                  data: {
                    type: "object",
                    properties: {
                      deletedBankDetails: { type: "boolean", example: true }
                    }
                  }
                }
              }
            }
          }
        },
        404: {
          description: "User or bank details not found"
        }
      }
    }
  }
}
