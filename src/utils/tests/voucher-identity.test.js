const { normalizeProductName, makeVoucherUid } = require("../voucher-identity");

describe("voucher identity", () => {
  it("normalizes product names into filename-safe tokens", () => {
    expect(normalizeProductName("  Regular 501 Grey! ")).toBe(
      "REGULAR_501_GREY",
    );
    expect(normalizeProductName("Café & Tile")).toBe("CAFE_TILE");
  });

  it("formats product, batch, and voucher numbers in the agreed UID format", () => {
    expect(makeVoucherUid("Regular 501", 3, 12)).toBe(
      "VCH-REGULAR_501-B03-V012",
    );
  });

  it.each([
    [0, 1],
    [1, 0],
    [-1, 1],
    [1.5, 1],
  ])("rejects invalid batch or voucher numbers (%s, %s)", (batch, voucher) => {
    expect(() => makeVoucherUid("Regular 501", batch, voucher)).toThrow();
  });
});
