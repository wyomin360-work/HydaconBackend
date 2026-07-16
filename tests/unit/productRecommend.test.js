const request = require("supertest");
const app = require("../../src/app");
const Product = require("../../src/schemas/product.schema");
const productService = require("../../src/modules/products/product.service");

// Mock the Product schema model
jest.mock("../../src/schemas/product.schema");

describe("Product Recommendation Engine", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Service Layer: recommendProducts", () => {
    it("should return exact product matches when available", async () => {
      const mockProducts = [
        {
          _id: "product-1",
          name: "TileBond Premium",
          roomTypes: ["bathroom"],
          active: true,
        },
      ];

      // Mock Product.find chain
      Product.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      });

      const criteria = {
        roomType: "bathroom",
        areaType: "wet-area",
        applicationArea: "floor",
        substrateType: "concrete",
        applicationType: "tile-installation",
        tileType: "ceramic",
        tags: ["high-flexibility"],
      };

      const result = await productService.recommendProducts(criteria);

      expect(Product.find).toHaveBeenCalledWith({
        active: true,
        roomTypes: "bathroom",
        areaTypes: "wet-area",
        applicationAreas: "floor",
        substrateTypes: "concrete",
        applicationTypes: "tile-installation",
        tileTypes: "ceramic",
        additionalTags: { $all: ["high-flexibility"] },
      });
      expect(result.data.products).toEqual(mockProducts);
      expect(result.data.isFallback).toBe(false);
    });

    it("should trigger fallback query if exact matches yield 0 products", async () => {
      const mockFallbackProducts = [
        {
          _id: "fallback-product",
          name: "TileBond Eco",
          roomTypes: ["bathroom"],
          active: true,
        },
      ];

      // Mock Product.find to return empty array first, then fallback products
      Product.find
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        })
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockFallbackProducts),
        });

      const criteria = {
        roomType: "bathroom",
        areaType: "wet-area",
        applicationArea: "floor",
        substrateType: "concrete",
        applicationType: "tile-installation",
      };

      const result = await productService.recommendProducts(criteria);

      expect(Product.find).toHaveBeenNthCalledWith(1, {
        active: true,
        roomTypes: "bathroom",
        areaTypes: "wet-area",
        applicationAreas: "floor",
        substrateTypes: "concrete",
        applicationTypes: "tile-installation",
      });

      expect(Product.find).toHaveBeenNthCalledWith(2, {
        active: true,
        roomTypes: "bathroom",
        applicationTypes: "tile-installation",
      });

      expect(result.data.products).toEqual(mockFallbackProducts);
      expect(result.data.isFallback).toBe(true);
    });
  });

  describe("API Endpoint: POST /api/v1/products/recommend", () => {
    it("should fail validation if mandatory parameters are missing", async () => {
      const incompletePayload = {
        roomType: "bathroom",
        areaType: "wet-area",
        // missing applicationArea, substrateType, applicationType
      };

      const res = await request(app)
        .post("/api/v1/products/recommend")
        .send(incompletePayload);

      expect(res.statusCode).toBe(400);
      expect(res.body.status).toBe("fail");
    });

    it("should succeed and return products if payload is valid", async () => {
      const mockProducts = [
        { _id: "product-1", name: "TileBond Premium", active: true },
      ];

      Product.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockProducts),
      });

      const validPayload = {
        roomType: "bathroom",
        areaType: "wet-area",
        applicationArea: "floor",
        substrateType: "concrete",
        applicationType: "tile-installation",
      };

      const res = await request(app)
        .post("/api/v1/products/recommend")
        .send(validPayload);

      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.data.data.products).toBeDefined();
      expect(res.body.data.data.products[0].name).toBe("TileBond Premium");
    });
  });
});
