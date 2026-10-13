function normalizeProductName(productName) {
  const normalized = String(productName || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "PRODUCT";
}

function padVoucherNumber(value, width) {
  return String(value).padStart(width, "0");
}

function makeVoucherUid(productName, batchNumber, voucherNumber) {
  if (!Number.isInteger(batchNumber) || batchNumber < 1) {
    throw new Error(
      "A positive batch number is required to create a voucher UID",
    );
  }
  if (!Number.isInteger(voucherNumber) || voucherNumber < 1) {
    throw new Error(
      "A positive voucher number is required to create a voucher UID",
    );
  }
  return `VCH-${normalizeProductName(productName)}-B${padVoucherNumber(batchNumber, 2)}-V${padVoucherNumber(voucherNumber, 3)}`;
}

module.exports = { normalizeProductName, makeVoucherUid };
