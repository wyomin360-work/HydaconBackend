jest.mock("../../../schemas/product.schema");

const Product = require("../../../schemas/product.schema");
const AppError = require("../../../utils/appError");
const productService = require("../product.service");

describe("product filename name uniqueness", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("stores a normalized name key when creating a product", async () => {
    Product.create.mockResolvedValue({ _id: "product-id" });
    Product.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue({ _id: "product-id" }),
    });

    await productService.createProduct({ name: "Regular 501" });

    expect(Product.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Regular 501",
        nameKey: "REGULAR_501",
      }),
    );
  });

  it("returns a conflict when a normalized product name already exists", async () => {
    Product.create.mockRejectedValue({
      code: 11000,
      keyPattern: { nameKey: 1 },
    });

    await expect(
      productService.createProduct({ name: "Regular 501" }),
    ).rejects.toMatchObject({
      message: "A product with this name already exists.",
      statusCode: 409,
    });
  });

  it("updates the normalized name key and reports duplicate renames as conflicts", async () => {
    Product.findByIdAndUpdate.mockRejectedValue({
      code: 11000,
      keyPattern: { nameKey: 1 },
    });

    await expect(
      productService.updateProduct({ name: "Regular 501" }, "product-id"),
    ).rejects.toBeInstanceOf(AppError);
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith("product-id", {
      $set: expect.objectContaining({
        name: "Regular 501",
        nameKey: "REGULAR_501",
      }),
    });
  });
});
