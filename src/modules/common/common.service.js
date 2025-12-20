const { ROLES } = require('../../constants/common')
const Admin = require('../../schemas/admin.schema')
const RefreshToken = require('../../schemas/refreshtoken.schema')
const User = require('../../schemas/user.schema')
const moment = require('moment')
const { verifyToken, generateToken } = require('../../utils/heplers')
const { sendFailResponse } = require('../../utils/responseHandlers')


async function uploadImage(file) {
    if (!file) sendFailResponse('The file not received')
    const fileUrl = `https://hydaconbackend.onrender.com/api/v1/uploads/images/${file?.filename}`
    return { data: { url: fileUrl } }
}


async function renewToken(data) {
    const { currentRefreshToken, role } = data

    const now = moment();
    const refreshTokenTokenExpiryIn =
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    const tokenDetails = verifyToken(currentRefreshToken)
    if (!tokenDetails) sendFailResponse('Authentication Expired', 401)

    if (role === ROLES.USER) {
        const user = await User.findById(tokenDetails?.userId)
        if (!user) sendFailResponse('Corrupted token', 401)

        const storedToken = await RefreshToken.findOne({ userId: tokenDetails?.userId })

        if (!storedToken || storedToken.refreshToken !== currentRefreshToken) {
            sendFailResponse('Token manipulated', 401);
        }

        let payload = {
            userId: user._id,
            email: user.email
        }
        const expiresAt = moment(storedToken.expiresAt);
        const daysRemaining = expiresAt.diff(now, 'days');
        const accessToken = generateToken(payload)
        let refreshToken = user.refreshToken

        if (daysRemaining <= 5) {
            refreshToken = generateToken(payload, '30d')
            await RefreshToken.deleteMany({ userId: user._id })
            await RefreshToken.create({
                refreshToken,
                userId: payload?.userId,
                expiresAt: refreshTokenTokenExpiryIn
            })
        }

        user.refreshToken = refreshToken,
            user.accessToken = accessToken
        await user.save()
        return { accessToken, refreshToken };

    } else if (role === ROLES.ADMIN) {
        const admin = await Admin.findById(tokenDetails?.adminId)
        if (!admin) sendFailResponse('Corrupted token', 401)

        const storedToken = await RefreshToken.findOne({ adminId: tokenDetails?.adminId })

        if (!storedToken || storedToken.refreshToken !== currentRefreshToken) {
            sendFailResponse('Token manipulated', 401);
        }

        let payload = {
            adminId: admin._id,
            email: admin.email
        }

        const expiresAt = moment(storedToken.expiresAt);
        const daysRemaining = expiresAt.diff(now, 'days');
        const accessToken = generateToken(payload)
        let refreshToken = admin.refreshToken

        if (daysRemaining <= 5) {
            refreshToken = generateToken(payload, '30d')
            await RefreshToken.deleteMany({ adminId: admin._id })
            await RefreshToken.create({
                refreshToken,
                adminId: payload?.adminId,
                expiresAt: refreshTokenTokenExpiryIn
            })
        }
        admin.refreshToken = refreshToken,
            admin.accessToken = accessToken
        await admin.save()
        return { accessToken, refreshToken };
    } else {
        sendFailResponse('Invalid token', 401)
    }
}

module.exports = {
    uploadImage,
    renewToken
}