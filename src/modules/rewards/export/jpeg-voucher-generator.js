const QRCode = require("qrcode");
const path = require("path");
const sharp = require("sharp");

const TEMPLATE_PATH = path.resolve(
  __dirname,
  "../../../assets/rewards/Qr-cover.jpg",
);
const COVER_PDF_WIDTH = 339.246;
const COVER_PDF_HEIGHT = 188;

class JpegVoucherGenerator {
  constructor() {
    this.templatePath = TEMPLATE_PATH;
    this.extension = "jpg";
  }

  async prepare(coverBytes) {
    const metadata = await sharp(coverBytes).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error("Unable to read the JPEG reward cover dimensions");
    }
    return metadata;
  }

  async createVoucher(reward, productName, coverBytes, coverMetadata) {
    const qrPayload = {
      productId: String(reward.productId),
      rewardId: String(reward._id),
      rewardUidCode: reward.uidCode,
    };
    const qrSize = Math.round((84 / COVER_PDF_WIDTH) * coverMetadata.width);
    const qrBytes = await QRCode.toBuffer(JSON.stringify(qrPayload), {
      type: "png",
      width: qrSize,
      margin: 1,
      errorCorrectionLevel: "H",
    });

    const scaleX = coverMetadata.width / COVER_PDF_WIDTH;
    const scaleY = coverMetadata.height / COVER_PDF_HEIGHT;
    const qrCenterX = (194.703 + 95 / 2) * scaleX;
    const qrBottom = (188 - 38 - 94 + (94 - 84) / 2) * scaleY;
    const productLabel = (productName || "HYDACON REWARD").toUpperCase();
    const uidCode = String(reward.uidCode || "NO-UID").toUpperCase();
    const svg = Buffer.from(`<svg width="${coverMetadata.width}" height="${coverMetadata.height}" xmlns="http://www.w3.org/2000/svg">
      <style>text { font-family: Arial, Helvetica, sans-serif; font-weight: 700; fill: #fff; }</style>
      <text x="${qrCenterX}" y="${(COVER_PDF_HEIGHT - 162) * scaleY}" font-size="${10 * scaleY}" text-anchor="middle">${escapeSvgText(productLabel)}</text>
      <text x="${qrCenterX}" y="${(COVER_PDF_HEIGHT - 28) * scaleY}" font-size="${11 * scaleY}" text-anchor="middle">${escapeSvgText(uidCode)}</text>
    </svg>`);

    return sharp(coverBytes)
      .composite([
        {
          input: qrBytes,
          left: Math.round(qrCenterX - qrSize / 2),
          top: Math.round(coverMetadata.height - qrBottom - qrSize),
        },
        { input: svg, left: 0, top: 0 },
      ])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  }
}

function escapeSvgText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

module.exports = JpegVoucherGenerator;
