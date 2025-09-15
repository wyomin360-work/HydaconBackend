module.exports = {
  "/service/upload-image": {
    post: {
      summary: "Upload Image",
      tags: ["Service"],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: {
                image: {
                  type: "string",
                  format: "binary",
                  description: "Image file to upload"
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Image uploaded successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      url: {
                        type: "string",
                        example: "/uploads/images/sample.jpg"
                      }
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: "No file received"
        }
      }
    }
  },

  "/service/auth/renew-token": {
    post: {
      summary: "Renew Access & Refresh Token",
      tags: ["Service"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["currentRefreshToken", "role"],
              properties: {
                currentRefreshToken: {
                  type: "string",
                  example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                },
                role: {
                  type: "string",
                  enum: ["USER", "ADMIN"],
                  example: "USER"
                }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Tokens refreshed successfully",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  accessToken: {
                    type: "string",
                    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  },
                  refreshToken: {
                    type: "string",
                    example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  }
                }
              }
            }
          }
        },
        401: {
          description: "Invalid or expired token"
        }
      }
    }
  }
};
