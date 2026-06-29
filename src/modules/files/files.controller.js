const { getPresignedUrl, verifyUrl } = require('../../utils/s3');
const { sendResponse } = require('../../utils/responseHandlers');

const generatePresignedUrl = async (req, res, next) => {
    try {
        const { filePath, fileType } = req.query;
        if (!filePath || !fileType) {
            return sendResponse(res, { message: "filePath and fileType are required." }, 400);
        }

        const urls = await getPresignedUrl(filePath, fileType);
        return sendResponse(res, urls, 200);
    } catch (error) {
        next(error);
    }
};

const verifyFileUrl = async (req, res, next) => {
    try {
        const { filePath } = req.query;
        if (!filePath) {
            return sendResponse(res, { message: "filePath is required." }, 400);
        }

        const result = await verifyUrl(filePath);
        return sendResponse(res, result, 200);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    generatePresignedUrl,
    verifyFileUrl,
};
