module.exports = {
  "/products/list": {
    post: {
      summary: "Get all products (paginated)",
      tags: ["Products"],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                page: { type: "integer", default: 1, description: "Page number" },
                limit: { type: "integer", default: 10, description: "Number of products per page" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "List of products with pagination",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      products: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            _id: { type: "string" },
                            name: { type: "string" },
                            description: { type: "string" },
                            image: { type: "string" },
                            price: { type: "number" },
                            rewardPoints: { type: "number" }
                          }
                        }
                      },
                      limit: { type: "integer", example: 10 },
                      total: { type: "integer", example: 5 },
                      page: { type: "integer", example: 1 }
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
  "/products/create": {
    post: {
      summary: "Create a new product",
      tags: ["Products"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "description", "image", "price", "rewardPoints"],
              properties: {
                name: { type: "string" },
                description: { type: "string" },
                image: { type: "string" },
                price: { type: "number" },
                rewardPoints: { type: "number" }
              }
            }
          }
        }
      },
      responses: {
        201: {
          description: "Product created",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Product created" },
                  data: {
                    type: "object",
                    properties: {
                      productCreated: { type: "boolean", example: true }
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
  "/products/{productId}": {
    get: {
      summary: "Get product by ID",
      tags: ["Products"],
      parameters: [
        { name: "productId", in: "path", required: true, schema: { type: "string" } }
      ],
      responses: {
        200: {
          description: "Product details",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      _id: { type: "string" },
                      name: { type: "string" },
                      description: { type: "string" },
                      image: { type: "string" },
                      price: { type: "number" },
                      rewardPoints: { type: "number" }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: "Product not found" }
      }
    }
  },
  "/products/update/{productId}": {
    patch: {
      summary: "Update a product by ID",
      tags: ["Products"],
      parameters: [
        { name: "productId", in: "path", required: true, schema: { type: "string" } }
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
                image: { type: "string" },
                price: { type: "number" },
                rewardPoints: { type: "number" }
              }
            }
          }
        }
      },
      responses: {
        200: {
          description: "Product updated",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Product updated" },
                  data: {
                    type: "object",
                    properties: {
                      productUpdated: { type: "boolean", example: true }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: "Product not found" }
      }
    }
  },
  "/products/delete/{productId}": {
    delete: {
      summary: "Delete a product by ID",
      tags: ["Products"],
      parameters: [
        { name: "productId", in: "path", required: true, schema: { type: "string" } }
      ],
      responses: {
        200: {
          description: "Product deleted",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Product deleted" },
                  data: {
                    type: "object",
                    properties: {
                      productDeleted: { type: "boolean", example: true }
                    }
                  }
                }
              }
            }
          }
        },
        404: { description: "Product not found" }
      }
    }
  }
};
