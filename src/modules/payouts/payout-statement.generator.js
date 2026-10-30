const fs = require("node:fs");
const path = require("node:path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_CURRENCY,
  PAYOUT_STATEMENT,
} = require("../../constants/payouts");

const PAGE_SIZE = Object.freeze({ width: 595.28, height: 841.89 });
const PAGE_MARGIN = 42;
const CONTENT_WIDTH = PAGE_SIZE.width - PAGE_MARGIN * 2;
const FONT_SIZE = Object.freeze({
  title: 22,
  section: 11,
  body: 9,
  small: 8,
  reference: 7,
});
const COLORS = Object.freeze({
  ink: rgb(0.12, 0.17, 0.22),
  muted: rgb(0.39, 0.46, 0.52),
  brand: rgb(0.0, 0.56, 0.45),
  brandDark: rgb(0.0, 0.38, 0.31),
  accent: rgb(0.54, 0.29, 0.15),
  line: rgb(0.86, 0.89, 0.91),
  soft: rgb(0.95, 0.97, 0.97),
  white: rgb(1, 1, 1),
});
const EMPTY_VALUE = "-";
const HYDACON_LOGO_PATH = path.join(
  __dirname,
  "../../assets/brand/hydacon-logo.png",
);
const HYDACON_LOGO_BYTES = fs.readFileSync(HYDACON_LOGO_PATH);

/** Creates a printable payout statement from the persisted payout snapshot. */
async function generatePayoutStatement(payout) {
  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
  const regularFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdfDocument.embedPng(HYDACON_LOGO_BYTES);

  let cursorY = drawHeader(page, logo, regularFont, boldFont);
  cursorY = drawDateSummary(page, payout, regularFont, boldFont, cursorY);
  cursorY = drawPartyDetails(page, payout, regularFont, boldFont, cursorY);
  cursorY = drawAmountBreakdown(page, payout, regularFont, boldFont, cursorY);
  cursorY = drawAccountAndSettlementDetails(
    page,
    payout,
    regularFont,
    boldFont,
    cursorY,
  );
  cursorY = drawSettlementNotes(page, payout, regularFont, boldFont, cursorY);
  drawFooter(page, payout, regularFont);

  return Buffer.from(await pdfDocument.save());
}

function drawHeader(page, logo, regularFont, boldFont) {
  const top = PAGE_SIZE.height - PAGE_MARGIN;
  const logoHeight = 38;
  const logoWidth = (logo.width / logo.height) * logoHeight;
  page.drawImage(logo, {
    x: PAGE_MARGIN,
    y: top - logoHeight,
    width: logoWidth,
    height: logoHeight,
  });

  const companyContact = getCompanyContactLines();
  if (!companyContact.length) {
    companyContact.push(sanitizePdfText(PAYOUT_STATEMENT.SUPPORT_PROMPT));
  }
  companyContact.forEach((line, index) => {
    drawTextRight(
      page,
      fitTextForWidth(line, regularFont, 230).text,
      PAGE_SIZE.width - PAGE_MARGIN,
      top - 5 - index * 11,
      FONT_SIZE.small,
      regularFont,
      COLORS.muted,
    );
  });

  page.drawLine({
    start: { x: 0, y: top - 8 },
    end: { x: PAGE_MARGIN - 6, y: top - 8 },
    thickness: 2,
    color: COLORS.brand,
  });
  page.drawLine({
    start: { x: 0, y: top - 17 },
    end: { x: PAGE_MARGIN - 6, y: top - 17 },
    thickness: 2,
    color: COLORS.accent,
  });
  page.drawLine({
    start: { x: PAGE_SIZE.width - PAGE_MARGIN + 6, y: top - 8 },
    end: { x: PAGE_SIZE.width, y: top - 8 },
    thickness: 2,
    color: COLORS.brand,
  });
  page.drawLine({
    start: { x: PAGE_SIZE.width - PAGE_MARGIN + 6, y: top - 17 },
    end: { x: PAGE_SIZE.width, y: top - 17 },
    thickness: 2,
    color: COLORS.accent,
  });

  const title = sanitizePdfText(PAYOUT_STATEMENT.TITLE);
  const titleWidth = boldFont.widthOfTextAtSize(title, FONT_SIZE.title);
  page.drawText(title, {
    x: (PAGE_SIZE.width - titleWidth) / 2,
    y: top - 92,
    size: FONT_SIZE.title,
    font: boldFont,
    color: COLORS.ink,
  });
  page.drawText(sanitizePdfText(PAYOUT_STATEMENT.DOCUMENT_SUBTITLE), {
    x:
      (PAGE_SIZE.width -
        boldFont.widthOfTextAtSize(
          PAYOUT_STATEMENT.DOCUMENT_SUBTITLE,
          FONT_SIZE.body,
        )) /
      2,
    y: top - 108,
    size: FONT_SIZE.body,
    font: regularFont,
    color: COLORS.muted,
  });

  const status = sanitizePdfText(WITHDRAWAL_STATUS.COMPLETED);
  const statusWidth = boldFont.widthOfTextAtSize(status, FONT_SIZE.small);
  page.drawRectangle({
    x: PAGE_SIZE.width - PAGE_MARGIN - statusWidth - 16,
    y: top - 132,
    width: statusWidth + 16,
    height: 18,
    color: COLORS.soft,
  });
  page.drawText(status, {
    x: PAGE_SIZE.width - PAGE_MARGIN - statusWidth - 8,
    y: top - 127,
    size: FONT_SIZE.small,
    font: boldFont,
    color: COLORS.brandDark,
  });
  drawRule(page, top - 141);
  return top - 156;
}

function drawDateSummary(page, payout, regularFont, boldFont, cursorY) {
  const rows = [
    [PAYOUT_STATEMENT.REQUESTED_AT, formatDateTime(payout.createdAt)],
    [PAYOUT_STATEMENT.APPROVED_AT, formatDateTime(payout.approvedAt)],
    [PAYOUT_STATEMENT.COMPLETED_AT, formatDateTime(payout.completedAt)],
    [PAYOUT_STATEMENT.GENERATED_AT_LABEL, formatDateTime(new Date())],
  ];
  return drawKeyValueTable(
    page,
    PAYOUT_STATEMENT.PAYOUT_DETAILS,
    rows,
    PAGE_MARGIN,
    cursorY,
    CONTENT_WIDTH,
    regularFont,
    boldFont,
    { rowHeight: 17, labelWidth: 160 },
  );
}

function drawPartyDetails(page, payout, regularFont, boldFont, cursorY) {
  const gap = 12;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  const companyRows = [
    [PAYOUT_STATEMENT.COMPANY_NAME, getCompanyName()],
    ...getCompanyContactLines().map((line) => splitContactLine(line)),
  ];
  const customerRows = [
    [PAYOUT_STATEMENT.CUSTOMER_NAME, payout.user?.name],
    [PAYOUT_STATEMENT.CUSTOMER_EMAIL, payout.user?.email],
    [PAYOUT_STATEMENT.CUSTOMER_PHONE, payout.user?.phone],
  ];
  const nextLeft = drawKeyValueTable(
    page,
    PAYOUT_STATEMENT.COMPANY_DETAILS,
    companyRows,
    PAGE_MARGIN,
    cursorY,
    cardWidth,
    regularFont,
    boldFont,
    { rowHeight: 19, labelWidth: 58, minRows: 4 },
  );
  const nextRight = drawKeyValueTable(
    page,
    PAYOUT_STATEMENT.CUSTOMER_DETAILS,
    customerRows,
    PAGE_MARGIN + cardWidth + gap,
    cursorY,
    cardWidth,
    regularFont,
    boldFont,
    { rowHeight: 19, labelWidth: 58, minRows: 4 },
  );
  return Math.min(nextLeft, nextRight) - 10;
}

function drawAmountBreakdown(page, payout, regularFont, boldFont, cursorY) {
  const rows = [[PAYOUT_STATEMENT.CASH_AMOUNT, formatMoney(payout.cashAmount)]];
  if (Number.isFinite(payout.pointsAmount)) {
    rows.push([PAYOUT_STATEMENT.REWARD_POINTS, payout.pointsAmount]);
  }
  if (Number.isFinite(payout.coinAmount)) {
    rows.push([PAYOUT_STATEMENT.HYDACON_COINS, payout.coinAmount]);
  }
  const conversion = payout.pointConversionSnapshot;
  const conversionText = conversion?.rateInrPerPoint
    ? `INR ${conversion.rateInrPerPoint} per point (${conversion.roundingMode || EMPTY_VALUE})`
    : EMPTY_VALUE;
  rows.push([PAYOUT_STATEMENT.POINT_CONVERSION, conversionText]);

  cursorY = drawKeyValueTable(
    page,
    PAYOUT_STATEMENT.AMOUNT_BREAKDOWN,
    rows,
    PAGE_MARGIN,
    cursorY,
    CONTENT_WIDTH,
    regularFont,
    boldFont,
    { rowHeight: 20, labelWidth: 250 },
  );
  cursorY -= 5;
  drawTotalPaid(page, payout, boldFont, cursorY);
  return cursorY - 27;
}

function drawTotalPaid(page, payout, boldFont, cursorY) {
  drawRule(page, cursorY + 8);
  page.drawText(sanitizePdfText(PAYOUT_STATEMENT.TOTAL_PAID), {
    x: PAGE_MARGIN + 8,
    y: cursorY - 7,
    size: FONT_SIZE.section,
    font: boldFont,
    color: COLORS.ink,
  });
  drawTextRight(
    page,
    formatMoney(payout.cashAmount),
    PAGE_SIZE.width - PAGE_MARGIN - 8,
    cursorY - 7,
    FONT_SIZE.section,
    boldFont,
    COLORS.brandDark,
  );
}

function drawAccountAndSettlementDetails(
  page,
  payout,
  regularFont,
  boldFont,
  cursorY,
) {
  const gap = 12;
  const cardWidth = (CONTENT_WIDTH - gap) / 2;
  const bank = payout.bankAccount || {};
  const accountRows = [
    [PAYOUT_STATEMENT.BENEFICIARY_NAME, bank.accountHolderName],
    [PAYOUT_STATEMENT.BANK_NAME, bank.bankName],
    [PAYOUT_STATEMENT.BANK_BRANCH, bank.branchName],
    [PAYOUT_STATEMENT.BANK_ACCOUNT, maskAccountNumber(bank.accountNumber)],
    [PAYOUT_STATEMENT.BANK_IFSC, bank.ifscCode],
  ];
  const settlementRows = [
    [PAYOUT_STATEMENT.PROVIDER, payout.payoutProvider],
    [PAYOUT_STATEMENT.PROVIDER_REFERENCE, payout.providerReferenceId],
    [PAYOUT_STATEMENT.TRANSFER_ID, payout.providerTransferId],
    [PAYOUT_STATEMENT.BANK_REFERENCE, payout.utr],
  ];
  if (payout.isManualPayout) {
    settlementRows.push(
      [
        PAYOUT_STATEMENT.MANUAL_PAYMENT_REFERENCE,
        payout.manualPaymentReference,
      ],
      [
        PAYOUT_STATEMENT.SETTLED_BY,
        getAdminName(payout.manualCompletedByAdminId),
      ],
    );
  }
  const nextLeft = drawKeyValueTable(
    page,
    PAYOUT_STATEMENT.BENEFICIARY_DETAILS,
    accountRows,
    PAGE_MARGIN,
    cursorY,
    cardWidth,
    regularFont,
    boldFont,
    {
      rowHeight: 19,
      labelWidth: 86,
      minRows: Math.max(accountRows.length, settlementRows.length),
    },
  );
  const nextRight = drawKeyValueTable(
    page,
    PAYOUT_STATEMENT.SETTLEMENT_DETAILS,
    settlementRows,
    PAGE_MARGIN + cardWidth + gap,
    cursorY,
    cardWidth,
    regularFont,
    boldFont,
    {
      rowHeight: 19,
      labelWidth: 112,
      minRows: Math.max(accountRows.length, settlementRows.length),
    },
  );
  return Math.min(nextLeft, nextRight);
}

function drawSettlementNotes(page, payout, regularFont, boldFont, cursorY) {
  if (!payout.isManualPayout || !payout.manualCompletionNotes) {
    return cursorY;
  }
  return drawKeyValueTable(
    page,
    PAYOUT_STATEMENT.SETTLEMENT_NOTES,
    [[PAYOUT_STATEMENT.NOTES, payout.manualCompletionNotes]],
    PAGE_MARGIN,
    cursorY,
    CONTENT_WIDTH,
    regularFont,
    boldFont,
    { rowHeight: 22, labelWidth: 75 },
  );
}

function drawKeyValueTable(
  page,
  title,
  rows,
  x,
  top,
  width,
  regularFont,
  boldFont,
  { rowHeight, labelWidth, minRows = rows.length },
) {
  const headerHeight = 22;
  page.drawRectangle({
    x,
    y: top - headerHeight,
    width,
    height: headerHeight,
    color: COLORS.soft,
    borderColor: COLORS.line,
    borderWidth: 0.7,
  });
  page.drawText(sanitizePdfText(title), {
    x: x + 7,
    y: top - 15,
    size: FONT_SIZE.section,
    font: boldFont,
    color: COLORS.ink,
  });

  const displayRows = [...rows];
  while (displayRows.length < minRows) displayRows.push(["", ""]);

  let rowTop = top - headerHeight;
  displayRows.forEach(([label, rawValue]) => {
    const rowY = rowTop - rowHeight;
    page.drawRectangle({
      x,
      y: rowY,
      width,
      height: rowHeight,
      borderColor: COLORS.line,
      borderWidth: 0.45,
      color: COLORS.white,
    });
    const normalizedLabel = fitTextForWidth(
      sanitizePdfText(label),
      regularFont,
      labelWidth - 8,
      FONT_SIZE.small,
    );
    const valueText = label || rawValue ? formatValue(rawValue) : "";
    const normalizedValue = fitTextForWidth(
      valueText,
      boldFont,
      width - labelWidth - 14,
      FONT_SIZE.body,
    );
    page.drawText(normalizedLabel.text, {
      x: x + 7,
      y: rowY + 5,
      size: normalizedLabel.fontSize,
      font: regularFont,
      color: COLORS.muted,
    });
    drawTextRight(
      page,
      normalizedValue.text,
      x + width - 7,
      rowY + 5,
      normalizedValue.fontSize,
      boldFont,
      COLORS.ink,
    );
    rowTop = rowY;
  });
  return rowTop - 8;
}

function splitContactLine(line) {
  const separator = line.indexOf(":");
  if (separator === -1) return [PAYOUT_STATEMENT.COMPANY_CONTACT, line];
  return [line.slice(0, separator), line.slice(separator + 1).trim()];
}

function drawTextRight(page, text, rightX, y, size, font, color) {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - textWidth, y, size, font, color });
}

function fitText(value, font) {
  const availableWidth = CONTENT_WIDTH - 175;
  return fitTextForWidth(value, font, availableWidth, FONT_SIZE.body);
}

function fitTextForWidth(
  value,
  font,
  availableWidth,
  maxSize = FONT_SIZE.body,
) {
  let size = maxSize;
  while (
    size > FONT_SIZE.reference &&
    font.widthOfTextAtSize(value, size) > availableWidth
  ) {
    size = Math.max(FONT_SIZE.reference, size - 0.5);
  }
  let fittedValue = value;
  while (
    fittedValue.length > 3 &&
    font.widthOfTextAtSize(fittedValue, size) > availableWidth
  ) {
    fittedValue = `${fittedValue.slice(0, -4)}...`;
  }
  return { text: fittedValue, fontSize: size };
}

function drawRule(page, y) {
  page.drawLine({
    start: { x: PAGE_MARGIN, y },
    end: { x: PAGE_SIZE.width - PAGE_MARGIN, y },
    thickness: 0.6,
    color: COLORS.line,
  });
}

function drawFooter(page, payout, regularFont) {
  const footerTop = PAGE_MARGIN + 42;
  drawRule(page, footerTop + 14);
  page.drawText(sanitizePdfText(PAYOUT_STATEMENT.FOOTER_NOTE), {
    x: PAGE_MARGIN,
    y: footerTop,
    size: FONT_SIZE.small,
    font: regularFont,
    color: COLORS.muted,
  });

  const referenceY = PAGE_MARGIN - 1;
  drawRule(page, referenceY + 10);
  drawSmallReference(
    page,
    `${PAYOUT_STATEMENT.PAYOUT_ID}: ${formatValue(payout.payoutId)}`,
    regularFont,
    referenceY,
  );
  drawSmallReference(
    page,
    `${PAYOUT_STATEMENT.WITHDRAWAL_ID}: ${formatValue(payout.withdrawalId)}`,
    regularFont,
    referenceY - 10,
  );
}

function drawSmallReference(page, reference, font, y) {
  page.drawText(fitText(sanitizePdfText(reference), font).text, {
    x: PAGE_MARGIN,
    y,
    size: FONT_SIZE.reference,
    font,
    color: COLORS.muted,
  });
}

function getCompanyContactLines() {
  const lines = [];
  const email = process.env.HYDACON_COMPANY_EMAIL;
  const phone = process.env.HYDACON_COMPANY_PHONE;
  const address = process.env.HYDACON_COMPANY_ADDRESS;
  if (email) lines.push(`${PAYOUT_STATEMENT.COMPANY_EMAIL_LABEL}: ${email}`);
  if (phone) lines.push(`${PAYOUT_STATEMENT.COMPANY_PHONE_LABEL}: ${phone}`);
  if (address)
    lines.push(`${PAYOUT_STATEMENT.COMPANY_ADDRESS_LABEL}: ${address}`);
  return lines.map(sanitizePdfText);
}

function getCompanyName() {
  return process.env.HYDACON_COMPANY_NAME || PAYOUT_STATEMENT.BRAND;
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return EMPTY_VALUE;
  if (
    value instanceof Date ||
    (typeof value === "string" &&
      !Number.isNaN(Date.parse(value)) &&
      /T|Z/.test(value))
  ) {
    return formatDateTime(value);
  }
  return sanitizePdfText(value);
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;
  const formattedDate = new Intl.DateTimeFormat("en-IN", {
    timeZone: PAYOUT_STATEMENT.TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  return `${formattedDate} ${PAYOUT_STATEMENT.TIME_ZONE_LABEL}`;
}

function formatMoney(amount) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return EMPTY_VALUE;
  return `${PAYOUT_CURRENCY.INR} ${numericAmount.toFixed(2)}`;
}

function maskAccountNumber(accountNumber) {
  const digits = String(accountNumber || "").replace(/\s/g, "");
  if (!digits) return EMPTY_VALUE;
  return `${PAYOUT_STATEMENT.MASKED_ACCOUNT}${digits.slice(-4)}`;
}

function getAdminName(admin) {
  if (admin && typeof admin === "object") return admin.name || admin.email;
  return admin;
}

function sanitizePdfText(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
}

module.exports = { generatePayoutStatement };
