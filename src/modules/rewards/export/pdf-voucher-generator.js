const QRCode = require("qrcode");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const TEMPLATE_PATH = path.resolve(
  __dirname,
  "../../../assets/rewards/Qr-cover.pdf",
);

class PdfVoucherGenerator {
  constructor() {
    this.templatePath = TEMPLATE_PATH;
    this.extension = "pdf";
  }

  async prepare(templateBytes) {
    return PDFDocument.load(templateBytes);
  }

  async createVoucher(reward, productName, templateDoc, _templateBytes) {
    const qrPayload = {
      productId: String(reward.productId),
      rewardId: String(reward._id),
      rewardUidCode: reward.uidCode,
    };
    const qrBytes = await QRCode.toBuffer(JSON.stringify(qrPayload), {
      type: "png",
      // 400px provides sharp print output for the 84pt QR code.
      width: 400,
      margin: 1,
      errorCorrectionLevel: "H",
    });

    const pdfDoc = await PDFDocument.create();
    const [page] = await pdfDoc.copyPages(templateDoc, [0]);
    pdfDoc.addPage(page);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const qrImage = await pdfDoc.embedPng(qrBytes);
    const qrCenterX = 194.703 + 95 / 2;
    const qrSize = 84;

    page.drawImage(qrImage, {
      x: qrCenterX - qrSize / 2,
      y: 188 - 38 - 94 + (94 - qrSize) / 2,
      width: qrSize,
      height: qrSize,
    });

    const productLabel = (productName || "HYDACON REWARD").toUpperCase();
    const productFontSize = 10;
    const productWidth = font.widthOfTextAtSize(productLabel, productFontSize);
    page.drawText(productLabel, {
      x: qrCenterX - productWidth / 2,
      y: 162,
      size: productFontSize,
      font,
      color: rgb(1, 1, 1),
    });

    const uidCode = String(reward.uidCode || "NO-UID").toUpperCase();
    const uidFontSize = 11;
    const uidWidth = font.widthOfTextAtSize(uidCode, uidFontSize);
    page.drawText(uidCode, {
      x: qrCenterX - uidWidth / 2,
      y: 28,
      size: uidFontSize,
      font,
      color: rgb(1, 1, 1),
    });

    return Buffer.from(await pdfDoc.save());
  }
}

module.exports = PdfVoucherGenerator;
