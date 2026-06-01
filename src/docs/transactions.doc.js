module.exports = {
  "/transactions/create": {
    post: {
      summary: "Create a new transaction (withdraw request)",
      tags: ["Transactions"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["amount"],
              properties: {
                amount: { type: "number", example: 500 },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Withdraw request created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Withdraw request created",
                  },
                  data: {
                    type: "object",
                    properties: {
                      withdrawRequested: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
        400: {
          description:
            "Invalid amount, missing bank details, or KYC not verified",
        },
      },
    },
  },

  "/transactions/list": {
    post: {
      summary: "Get list of transactions with filters",
      tags: ["Transactions"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                page: { type: "number", example: 1 },
                limit: { type: "number", example: 10 },
                sortBy: {
                  type: "string",
                  enum: ["MOST_RECENT", "AMOUNT"],
                  example: "MOST_RECENT",
                },
                status: {
                  type: "string",
                  enum: ["INITIATED", "PAID", "CANCELLED", "FAILED"],
                  example: "PAID",
                },
                userId: {
                  type: "string",
                  example: "64f7c4d0f1f3c9a431c5d172",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "List of transactions",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      transactions: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            _id: "string",
                            userId: "string",
                            amount: 100,
                            currency: "string",
                            status: "string",
                            paymentMethod: "string",
                            bankDetails: {
                              type: "object",
                              properties: {
                                userName: "string",
                                bankName: "string",
                                branchName: "string",
                              },
                            },
                            createdAt: "string",
                            updatedAt: "string",
                            paidAt: "string",
                            cancellationReason: "string",
                            transactionId: "string",
                            user: {
                              type: "object",
                              properties: {
                                _id: "string",
                                name: "string",
                                email: "string",
                              },
                            },
                            id: "string",
                          },
                        },
                      },
                      currentPage: 1,
                      limit: 10,
                      totalPages: 1,
                      totalItems: 2,
                      isNext: "boolean",
                      isPrevious: "boolean",
                      isData: "boolean",
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

  "/transactions/details/{transactionId}": {
    get: {
      summary: "Get transaction details",
      tags: ["Transactions"],
      parameters: [
        {
          name: "transactionId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Transaction details with decrypted bank info",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  _id: { type: "string", example: "650001abc123" },
                  user: {
                    type: "object",
                    properties: {
                      name: { type: "string", example: "John Doe" },
                      email: { type: "string", example: "john@example.com" },
                    },
                  },
                  amount: { type: "number", example: 500 },
                  bankDetails: {
                    type: "object",
                    properties: {
                      userName: { type: "string", example: "John Doe" },
                      accountNumber: {
                        type: "string",
                        example: "********1234",
                      },
                      ifscCode: { type: "string", example: "SBIN0001234" },
                      bankName: {
                        type: "string",
                        example: "State Bank of India",
                      },
                      branchName: { type: "string", example: "MG Road Branch" },
                    },
                  },
                },
              },
            },
          },
        },
        404: {
          description: "Transaction not found",
        },
      },
    },
  },

  "/transactions/update/{transactionId}": {
    patch: {
      summary: "Update transaction status (cancel, fail, mark as paid)",
      tags: ["Transactions"],
      parameters: [
        {
          name: "transactionId",
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
              required: ["status", "userId"],
              properties: {
                userId: { type: "string", example: "64f7c4d0f1f3c9a431c5d172" },
                status: {
                  type: "string",
                  enum: ["PAID", "CANCELLED", "FAILED"],
                  example: "PAID",
                },
                transactionId: {
                  type: "string",
                  example: "TXN202509010001",
                },
                cancellationReason: {
                  type: "string",
                  example: "User requested cancellation",
                },
                failureReason: {
                  type: "string",
                  example: "Bank transfer failed",
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Transaction updated successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Transaction status updated",
                  },
                  data: {
                    type: "object",
                    properties: {
                      transactionStatusUpdated: {
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
        400: { description: "Invalid input or transaction status" },
      },
    },
  },

  "/transactions/delete/{transactionId}": {
    delete: {
      summary: "Delete a transaction",
      tags: ["Transactions"],
      parameters: [
        {
          name: "transactionId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: {
          description: "Transaction deleted successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: {
                    type: "string",
                    example: "Transaction deleted successfully",
                  },
                  data: {
                    type: "object",
                    properties: {
                      transactionDeleted: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
        404: {
          description: "Transaction not found",
        },
      },
    },
  },
};
