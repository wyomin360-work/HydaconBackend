const Product = require("../product.schema");
const Reward = require("../reward.schema");

describe("voucher identity schema constraints", () => {
  it("normalizes product names on document validation", async () => {
    const product = new Product({
      name: "Regular 501",
      description: "Reward product",
      weightValue: 1,
      weightUnit: "kg",
      rewardPoints: 10,
    });

    await product.validate();

    expect(product.nameKey).toBe("REGULAR_501");
  });

  it("defines a unique normalized product name index", () => {
    expect(Product.schema.indexes()).toContainEqual([
      { nameKey: 1 },
      expect.objectContaining({
        unique: true,
        sparse: true,
        name: "unique_product_filename_name",
      }),
    ]);
  });

  it("defines unique voucher numbers per batch and unique voucher UIDs", () => {
    const indexes = Reward.schema.indexes();

    expect(indexes).toContainEqual([
      { batchId: 1, voucherNumber: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { voucherNumber: { $type: "number" } },
        name: "unique_batch_voucher_number",
      }),
    ]);
    expect(indexes).toContainEqual([
      { voucherUid: 1 },
      expect.objectContaining({
        unique: true,
        partialFilterExpression: { voucherUid: { $type: "string" } },
        name: "unique_voucher_uid",
      }),
    ]);
  });
});
