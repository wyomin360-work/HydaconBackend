const { sendFailResponse } = require('../../utils/responseHandlers')

async function uploadImage(file) {
    if (!file) sendFailResponse('The file not received')
    const fileUrl = `/uploads/images/${file?.filename}`
    return { data: { url: fileUrl } }
}

module.exports = {
    uploadImage,
}