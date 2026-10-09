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
const { Transform } = require("stream");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");
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
  const { AWS_BUCKET_NAME, AWS_REGION } = process.env;
  if (!AWS_BUCKET_NAME || !AWS_REGION) return null;
  if (!s3Client) {
    // Let the AWS SDK credential provider chain support environment keys,
    // web identity, and ECS/EC2 task or instance roles.
    s3Client = new S3Client({ region: AWS_REGION });
  }
  return { client: s3Client, bucket: AWS_BUCKET_NAME };
}

async function createS3ArchiveDownloadUrl(key, fileName) {
  const storage = getArchiveStorage();
  if (!storage) throw new Error("S3 archive storage is not configured");
  return getSignedUrl(
    storage.client,
    new GetObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    }),
    { expiresIn: 60 * 60 },
  );
}

async function refreshRewardBatchArchiveUrl(archive) {
  if (!archive?.s3Key) return archive?.downloadUrl;
  return createS3ArchiveDownloadUrl(archive.s3Key, archive.fileName);
}

async function isRewardBatchArchiveAvailable(archive) {
  if (!archive?.s3Key) return true;
  const storage = getArchiveStorage();
  if (!storage) return false;
  try {
    await storage.client.send(
      new HeadObjectCommand({ Bucket: storage.bucket, Key: archive.s3Key }),
    );
    return true;
  } catch (error) {
    if (
      error?.name === "NotFound" ||
      error?.name === "NoSuchKey" ||
      error?.$metadata?.httpStatusCode === 404
    ) {
      return false;
    }
    throw error;
  }
}

const safeFilePart = (value) =>
  String(value || "Batch")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 80);

async function createVoucherPdf(reward, productName, templateDoc) {
  const qrPayload = {
    productId: String(reward.productId),
    rewardId: String(reward._id),
    rewardUidCode: reward.uidCode,
  };
  const qrBytes = await QRCode.toBuffer(JSON.stringify(qrPayload), {
    type: "png",
    // The voucher prints this QR at 84pt (~1.17in); 400px is enough for sharp
    // print output and avoids generating unnecessarily large PNGs per reward.
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

async function generateRewardBatchArchive(
  batchId,
  onProgress = () => {},
  rewardIds = null,
) {
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
    sendFailResponse(
      "rewardIds must contain between 1 and 10,000 valid reward IDs",
      400,
    );
  }
  const batch = await RewardBatch.findOne({
    _id: batchId,
    isDeleted: { $ne: true },
  }).lean();
  if (!batch) sendFailResponse("reward batch not found", 404);

  const requiresRemoteArchive = process.env.NODE_ENV === "production";
  if (requiresRemoteArchive && !getArchiveStorage()) {
    sendFailResponse(
      "S3 archive storage is required for production ZIP downloads. Configure AWS_BUCKET_NAME and AWS_REGION.",
      503,
    );
  }

  const product = await Product.findById(batch.productId).select("name").lean();
  const productName = product?.name || "Batch";
  const rewardQuery = {
    batchId: batch._id,
    isDeleted: { $ne: true },
  };
  if (rewardIds) rewardQuery._id = { $in: rewardIds };
  const totalItems = rewardIds?.length || batch.totalCount || 0;
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
  const generationStartedAt = Date.now();
  const rewardConcurrency = 4;
  const reportProgress = async (phase, values = {}) => {
    const elapsedSeconds = (Date.now() - generationStartedAt) / 1000;
    const remainingItems = Math.max(0, totalItems - rewardCount);
    const etaSeconds =
      rewardCount > 0
        ? Math.ceil((elapsedSeconds / rewardCount) * remainingItems)
        : null;
    const generatedPercent =
      totalItems > 0 ? Math.floor((rewardCount / totalItems) * 85) : 0;
    await onProgress({
      phase,
      percent: values.percent ?? generatedPercent,
      completed: rewardCount,
      total: totalItems,
      elapsedSeconds: Math.floor(elapsedSeconds),
      etaSeconds: values.etaSeconds ?? etaSeconds,
      ...values,
    });
  };

  try {
    const templateBytes = await fsp.readFile(TEMPLATE_PATH);
    const templateDoc = await PDFDocument.load(templateBytes);
    await reportProgress("generating", { percent: 0, etaSeconds: null });
    const appendRewardBatch = async (batchRewards) => {
      const pdfs = await Promise.all(
        batchRewards.map((reward) =>
          createVoucherPdf(reward, productName, templateDoc),
        ),
      );
      for (let index = 0; index < batchRewards.length; index += 1) {
        const reward = batchRewards[index];
        const voucherName = safeFilePart(
          `${reward.uidCode || "Voucher"}_${reward._id}`,
        );
        const entryFinished = once(archive, "entry");
        archive.append(pdfs[index], { name: `Voucher_${voucherName}.pdf` });
        await entryFinished;
        rewardCount += 1;
        if (rewardCount % 10 === 0 || rewardCount === totalItems) {
          await reportProgress("generating");
        }
      }
    };

    let batchRewards = [];
    for await (const reward of rewards) {
      batchRewards.push(reward);
      if (batchRewards.length >= rewardConcurrency) {
        await appendRewardBatch(batchRewards);
        batchRewards = [];
      }
    }
    if (batchRewards.length) await appendRewardBatch(batchRewards);

    if (rewardCount === 0) {
      archive.abort();
      output.destroy();
      await fsp.rm(archivePath, { force: true });
      sendFailResponse("No rewards found in this batch", 404);
    }

    await reportProgress("finalizing", {
      percent: 86,
      etaSeconds: Math.max(
        1,
        Math.ceil(((Date.now() - generationStartedAt) / 1000) * 0.04),
      ),
    });
    await archive.finalize();
    await outputFinished;
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
  const archiveStorage =
    process.env.NODE_ENV === "test" ? null : getArchiveStorage();
  if (archiveStorage) {
    const key = `reward-batch-downloads/${token}.zip`;
    let uploadResult;
    let uploadSucceeded = false;
    try {
      const stats = await fsp.stat(archivePath);
      const uploadStartedAt = Date.now();
      let bytesUploaded = 0;
      let nextUploadReport = 0;
      let uploadProgressChain = Promise.resolve();
      const uploadProgressStream = new Transform({
        transform(chunk, encoding, callback) {
          bytesUploaded += chunk.length;
          const uploadRatio = stats.size > 0 ? bytesUploaded / stats.size : 1;
          const percent = Math.min(99, 86 + Math.floor(uploadRatio * 13));
          if (percent >= nextUploadReport || bytesUploaded === stats.size) {
            nextUploadReport = percent + 2;
            const elapsedSeconds = (Date.now() - uploadStartedAt) / 1000;
            const bytesPerSecond =
              elapsedSeconds > 0 ? bytesUploaded / elapsedSeconds : 0;
            const etaSeconds =
              bytesPerSecond > 0
                ? Math.ceil((stats.size - bytesUploaded) / bytesPerSecond)
                : null;
            uploadProgressChain = uploadProgressChain
              .then(() =>
                onProgress({
                  phase: "uploading",
                  percent,
                  completed: rewardCount,
                  total: totalItems,
                  bytesUploaded,
                  totalBytes: stats.size,
                  elapsedSeconds: Math.floor(elapsedSeconds),
                  etaSeconds,
                }),
              )
              .catch((error) =>
                console.error("Unable to report ZIP upload progress:", error),
              );
          }
          callback(null, chunk);
        },
      });
      const uploadReadStream = fs.createReadStream(archivePath);
      uploadReadStream.on("error", (error) =>
        uploadProgressStream.destroy(error),
      );
      await onProgress({
        phase: "uploading",
        percent: 86,
        completed: rewardCount,
        total: totalItems,
        bytesUploaded: 0,
        totalBytes: stats.size,
        elapsedSeconds: 0,
        etaSeconds: null,
      });
      uploadResult = await archiveStorage.client.send(
        new PutObjectCommand({
          Bucket: archiveStorage.bucket,
          Key: key,
          Body: uploadReadStream.pipe(uploadProgressStream),
          ContentLength: stats.size,
          ContentType: "application/zip",
        }),
      );
      uploadSucceeded = true;
      await uploadProgressChain;
      console.info("Reward batch ZIP uploaded to S3", {
        bucket: archiveStorage.bucket,
        key,
        bytes: stats.size,
        eTag: uploadResult?.ETag,
        versionId: uploadResult?.VersionId,
      });
      const downloadUrl = await createS3ArchiveDownloadUrl(key, fileName);
      try {
        await onProgress({
          phase: "ready",
          percent: 100,
          completed: rewardCount,
          total: totalItems,
          etaSeconds: 0,
        });
      } catch (progressError) {
        console.error("Unable to report completed ZIP progress:", progressError);
      }
      await fsp.rm(archivePath, { force: true });
      return { fileName, rewardCount, downloadUrl, s3Key: key };
    } catch (error) {
      console.error(
        requiresRemoteArchive
          ? "Unable to store production batch archive in S3; failing the job:"
          : "Unable to store batch archive in S3; using local temporary storage:",
        error,
      );
      // Once PutObject succeeds, preserve the completed object even if URL
      // signing or progress persistence fails. The TTL cleanup removes it later.
      if (!uploadSucceeded) {
        await archiveStorage.client
          .send(
            new DeleteObjectsCommand({
              Bucket: archiveStorage.bucket,
              Delete: { Objects: [{ Key: key }], Quiet: true },
            }),
          )
          .catch((cleanupError) => {
            console.warn(
              "Unable to remove incomplete reward ZIP from S3:",
              cleanupError,
            );
          });
      }
      if (requiresRemoteArchive) {
        await fsp.rm(archivePath, { force: true }).catch(() => {});
        throw new Error(
          `Unable to store the reward ZIP in S3: ${error.message}`,
        );
      }
    }
  }

  await onProgress({
    phase: "ready",
    percent: 100,
    completed: rewardCount,
    total: totalItems,
    etaSeconds: 0,
  });

  return {
    token,
    fileName,
    rewardCount,
  };
}

function createRewardBatchArchive(
  batchId,
  onProgress = () => {},
  rewardIds = null,
) {
  const normalizedRewardIds = Array.isArray(rewardIds)
    ? [...rewardIds].sort()
    : null;
  const key = createHash("sha256")
    .update(JSON.stringify([String(batchId), normalizedRewardIds]))
    .digest("hex");
  const existing = inlineArchivePromises.get(key);
  if (existing) return existing;

  const generation = generateRewardBatchArchive(batchId, onProgress, rewardIds);
  inlineArchivePromises.set(key, generation);
  generation
    .finally(() => {
      if (inlineArchivePromises.get(key) === generation)
        inlineArchivePromises.delete(key);
    })
    .catch(() => {});
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

async function cleanupExpiredS3Archives() {
  const storage = getArchiveStorage();
  if (!storage) return;

  let continuationToken;
  do {
    const page = await storage.client.send(
      new ListObjectsV2Command({
        Bucket: storage.bucket,
        Prefix: "reward-batch-downloads/",
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    const expiredObjects = (page.Contents || [])
      .filter(
        (object) =>
          object.Key &&
          object.LastModified &&
          Date.now() - object.LastModified.getTime() > ARCHIVE_TTL_MS,
      )
      .map((object) => ({ Key: object.Key }));
    if (expiredObjects.length) {
      const deletion = await storage.client.send(
        new DeleteObjectsCommand({
          Bucket: storage.bucket,
          Delete: { Objects: expiredObjects, Quiet: true },
        }),
      );
      if (deletion.Errors?.length) {
        throw new Error(
          `Unable to delete ${deletion.Errors.length} expired reward ZIP object(s)`,
        );
      }
    }
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);
}

module.exports = {
  createRewardBatchArchive,
  getRewardBatchArchive,
  cleanupExpiredArchives,
  cleanupExpiredS3Archives,
  refreshRewardBatchArchiveUrl,
  isRewardBatchArchiveAvailable,
};
