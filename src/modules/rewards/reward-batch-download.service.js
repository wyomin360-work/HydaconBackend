const QRCode = require("qrcode");
const archiver = require("archiver");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs");
const fsp = require("fs/promises");
const mongoose = require("mongoose");
const os = require("os");
const path = require("path");
const { createHash, randomUUID } = require("crypto");
const { finished } = require("stream/promises");
const { once } = require("events");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const Reward = require("../../schemas/reward.schema");
const RewardBatch = require("../../schemas/reward-batch.schema");
const Product = require("../../schemas/product.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");

const ARCHIVE_DIR = path.join(os.tmpdir(), "hydacon-reward-batch-downloads");
const TEMPLATE_PATH = path.join(__dirname, "../../assets/rewards/Qr-cover.pdf");
const ARCHIVE_TTL_MS = 24 * 60 * 60 * 1000;
let s3Client;
const inlineArchivePromises = new Map();

function getArchiveStorage() {
  const { AWS_BUCKET_NAME, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;
  if (!AWS_BUCKET_NAME || !AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
    });
  }
  return { client: s3Client, bucket: AWS_BUCKET_NAME };
}

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

async function generateRewardBatchArchive(batchId, onProgress = () => {}, rewardIds = null) {
  if (!mongoose.isValidObjectId(batchId)) {
    sendFailResponse("invalid reward batch id", 400);
  }
  if (
    rewardIds !== null &&
    (!Array.isArray(rewardIds) ||
      rewardIds.length < 1 ||
      rewardIds.length > 10000 ||
      rewardIds.some((id) => !mongoose.isValidObjectId(id)))
  ) {
    sendFailResponse("rewardIds must contain between 1 and 10,000 valid reward IDs", 400);
  }
  const batch = await RewardBatch.findOne({
    _id: batchId,
    isDeleted: { $ne: true },
  }).lean();
  if (!batch) sendFailResponse("reward batch not found", 404);

  const product = await Product.findById(batch.productId).select("name").lean();
  const productName = product?.name || "Batch";
  const rewardQuery = {
    batchId: batch._id,
    isDeleted: { $ne: true },
  };
  if (rewardIds) rewardQuery._id = { $in: rewardIds };
  const rewards = Reward.find(rewardQuery)
    .select("_id productId uidCode point active expiresAt")
    .lean()
    .cursor();

  await fsp.mkdir(ARCHIVE_DIR, { recursive: true });
  await cleanupExpiredArchives();

  const token = randomUUID();
  const archivePath = path.join(ARCHIVE_DIR, `${token}.zip`);
  const output = fs.createWriteStream(archivePath, { flags: "wx" });
  const archive = archiver("zip", { zlib: { level: 1 } });
  const outputFinished = finished(output);
  outputFinished.catch(() => {});
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
      const entryFinished = once(archive, "entry");
      archive.append(pdf, { name: `Voucher_${voucherName}.pdf` });
      await entryFinished;
      rewardCount += 1;
      const progressTotal = rewardIds?.length || batch.totalCount;
      if (rewardCount % 50 === 0 || rewardCount === progressTotal) {
        await onProgress(
          progressTotal > 0
            ? Math.min(99, Math.floor((rewardCount / progressTotal) * 100))
            : 0,
        );
      }
    }

    if (rewardCount === 0) {
      archive.abort();
      output.destroy();
      await fsp.rm(archivePath, { force: true });
      sendFailResponse("No rewards found in this batch", 404);
    }

    await archive.finalize();
    await outputFinished;
    await onProgress(100);
  } catch (error) {
    archive.abort();
    output.destroy();
    await outputFinished.catch(() => {});
    await fsp.rm(archivePath, { force: true }).catch(() => {});
    throw error;
  } finally {
    await rewards.close().catch(() => {});
  }

  const createdDate = batch.createdAt
    ? new Date(batch.createdAt).toISOString().slice(0, 10).replace(/-/g, "")
    : new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const fileName = `Vouchers_${safeFilePart(productName)}_${createdDate}.zip`;
  const archiveStorage = process.env.NODE_ENV === "test" ? null : getArchiveStorage();
  if (archiveStorage) {
    const key = `reward-batch-downloads/${token}.zip`;
    try {
      const stats = await fsp.stat(archivePath);
      await archiveStorage.client.send(
        new PutObjectCommand({
          Bucket: archiveStorage.bucket,
          Key: key,
          Body: fs.createReadStream(archivePath),
          ContentLength: stats.size,
          ContentType: "application/zip",
        }),
      );
      const downloadUrl = await getSignedUrl(
        archiveStorage.client,
        new GetObjectCommand({
          Bucket: archiveStorage.bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${fileName}"`,
        }),
        { expiresIn: 60 * 60 },
      );
      await fsp.rm(archivePath, { force: true });
      return { fileName, rewardCount, downloadUrl };
    } catch (error) {
      console.error("Unable to store batch archive in S3; using local temporary storage:", error);
    }
  }

  return {
    token,
    fileName,
    rewardCount,
  };
}

function createRewardBatchArchive(batchId, onProgress = () => {}, rewardIds = null) {
  const normalizedRewardIds = Array.isArray(rewardIds) ? [...rewardIds].sort() : null;
  const key = createHash("sha256")
    .update(JSON.stringify([String(batchId), normalizedRewardIds]))
    .digest("hex");
  const existing = inlineArchivePromises.get(key);
  if (existing) return existing;

  const generation = generateRewardBatchArchive(batchId, onProgress, rewardIds);
  inlineArchivePromises.set(key, generation);
  generation.finally(() => {
    if (inlineArchivePromises.get(key) === generation) inlineArchivePromises.delete(key);
  }).catch(() => {});
  return generation;
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
