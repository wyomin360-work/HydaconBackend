const { S3Client, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');
const fs = require('fs').promises;

const bucketName = process.env.AWS_BUCKET_NAME;
const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const CUSTOM_TEMP_DIR = path.join(process.cwd(), 'src/temp');


if (!bucketName || !region || !accessKeyId || !secretAccessKey) {
    throw new Error('Required AWS environment variables are not set');
}

const s3 = new S3Client({
    region,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});

const getS3KeyFromUrl = (fileUrl) => {
    const { pathname } = new URL(fileUrl);
    return decodeURIComponent(pathname.slice(1));
};

const checkS3FileExists = async (fileUrl) => {
    try {
        const key = getS3KeyFromUrl(fileUrl);

        const params = {
            Bucket: bucketName,
            Key: key,
        };

        await s3.send(new HeadObjectCommand(params));
        return true;
    } catch (error) {
        if (error.name === 'NotFound') {
            return false;
        }
        return false;
    }
};

const deleteS3File = async (fileUrl) => {
    try {
        const key = getS3KeyFromUrl(fileUrl);

        const params = {
            Bucket: bucketName,
            Key: key,
        };

        await s3.send(new DeleteObjectCommand(params));
        return true;
    } catch (error) {
        console.error('Error deleting file:', error);
        return false;
    }
};

const streamToBuffer = async (stream) => {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) =>
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        stream.on('error', reject);
        stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
};

const clearDir = async (target_path) => {
    try {
        const dirPath = target_path ?? CUSTOM_TEMP_DIR;
        await fs.mkdir(dirPath, { recursive: true });

        const files = await fs.readdir(dirPath);
        await Promise.all(
            files.map((file) =>
                fs.rm(path.join(dirPath, file), { recursive: true, force: true }),
            ),
        );
        console.log(dirPath + ' cleared 🧹');
    } catch (err) {
        console.error('Failed to clear dir:', target_path, err);
        throw err;
    }
};

const getS3FileStream = async (
    docUrl,
    ownerId,
) => {
    try {
        if (!bucketName) throw new Error('AWS_BUCKET_NAME is missing');

        await clearDir(CUSTOM_TEMP_DIR);

        const key = getS3KeyFromUrl(docUrl);

        const s3Res = await s3.send(
            new GetObjectCommand({
                Bucket: bucketName,
                Key: key,
            }),
        );

        if (!s3Res.Body) {
            throw new Error(`S3 file stream is empty. Key: ${key}`);
        }

        const buffer = await streamToBuffer(s3Res.Body);

        const tempPath = path.join(
            CUSTOM_TEMP_DIR,
            `${Date.now()}-${ownerId}-temp.pdf`,
        );
        await fs.writeFile(tempPath, buffer);

        return tempPath;
    } catch (error) {
        console.error('Error getting file stream from S3:', {
            docUrl,
            message: error?.message,
        });
        throw error;
    }
};

module.exports = {
    checkS3FileExists,
    deleteS3File,
    clearDir,
    getS3FileStream,
};
