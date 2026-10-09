const archiver = require("archiver");
const QRCode = require("qrcode");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const { finished } = require("stream/promises");
const Reward = require("../../schemas/reward.schema");
const RewardBatch = require("../../schemas/reward-batch.schema");
const Product = require("../../schemas/product.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");

const ARCHIVE_DIR = path.join(os.tmpdir(), "hydacon-reward-batch-downloads");
const TEMPLATE_PATH = path.join(__dirname, "../../assets/rewards/Qr-cover.pdf");
const ARCHIVE_TTL_MS = 24 * 60 * 60 * 1000;

const safeFilePart = (value) =>
  String(value || "Batch").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);

async function createVoucherPdf(reward, productName, templateBytes) {
  const qrPayload = {
    productId: String(reward.productId),
    rewardId: String(reward._id),
    rewardUidCode: reward.uidCode,
  };
  const qrBytes = await QRCode.toBuffer(JSON.stringify(qrPayload), {
    type: "png",
    width: 1000,
    margin: 1,
    errorCorrectionLevel: "H",
  });

  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
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

async function createRewardBatchArchive(batchId) {
  const batch = await RewardBatch.findOne({
    _id: batchId,
    isDeleted: { $ne: true },
  }).lean();
  if (!batch) sendFailResponse("reward batch not found", 404);

  const product = await Product.findById(batch.productId).select("name").lean();
  const productName = product?.name || "Batch";
  const rewards = Reward.find({
    batchId: batch._id,
    isDeleted: { $ne: true },
  })
    .select("_id productId uidCode point active expiresAt")
    .lean()
    .cursor();

  await fsp.mkdir(ARCHIVE_DIR, { recursive: true });
  await cleanupExpiredArchives();

  const token = randomUUID();
  const archivePath = path.join(ARCHIVE_DIR, `${token}.zip`);
  const output = fs.createWriteStream(archivePath, { flags: "wx" });
  const archive = archiver("zip", { zlib: { level: 6 } });
  const outputFinished = finished(output);
  archive.on("warning", (error) => {
    if (error.code !== "ENOENT") archive.destroy(error);
  });
  archive.on("error", (error) => output.destroy(error));
  archive.pipe(output);

  let rewardCount = 0;
  try {
    const templateBytes = await fsp.readFile(TEMPLATE_PATH);
    for await (const reward of rewards) {
      const pdf = await createVoucherPdf(reward, productName, templateBytes);
      const voucherName = safeFilePart(reward.uidCode || reward._id);
      archive.append(pdf, { name: `Voucher_${voucherName}.pdf` });
      rewardCount += 1;
    }

    if (rewardCount === 0) {
      archive.abort();
      output.destroy();
      await fsp.rm(archivePath, { force: true });
      sendFailResponse("No rewards found in this batch", 404);
    }

    await archive.finalize();
    await outputFinished;
  } catch (error) {
    archive.abort();
    output.destroy();
    await fsp.rm(archivePath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await rewards.close().catch(() => {});
  }

  const createdDate = batch.createdAt
    ? new Date(batch.createdAt).toISOString().slice(0, 10).replace(/-/g, "")
    : new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return {
    token,
    fileName: `Vouchers_${safeFilePart(productName)}_${createdDate}.zip`,
    rewardCount,
  };
}

async function getRewardBatchArchive(token) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const archivePath = path.join(ARCHIVE_DIR, `${token}.zip`);
  try {
    const stats = await fsp.stat(archivePath);
    if (Date.now() - stats.mtimeMs > ARCHIVE_TTL_MS) {
      await fsp.rm(archivePath, { force: true });
      return null;
    }
    return archivePath;
  } catch {
    return null;
  }
}

async function cleanupExpiredArchives() {
  let names;
  try {
    names = await fsp.readdir(ARCHIVE_DIR);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((name) => /^[0-9a-f-]{36}\.zip$/i.test(name))
      .map(async (name) => {
        const filePath = path.join(ARCHIVE_DIR, name);
        try {
          const stats = await fsp.stat(filePath);
          if (Date.now() - stats.mtimeMs > ARCHIVE_TTL_MS) {
            await fsp.rm(filePath, { force: true });
          }
        } catch {
          // A concurrent download or cleanup may already have removed the file.
        }
      }),
  );
}

module.exports = {
  createRewardBatchArchive,
  getRewardBatchArchive,
  cleanupExpiredArchives,
};
