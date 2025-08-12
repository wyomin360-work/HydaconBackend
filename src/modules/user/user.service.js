const User = require('../../schemas/user.schema')
const RefreshToken = require('../../schemas/refreshtoken.schema')
const { sendFailResponse, sendResponse } = require('../../utils/responseHandlers')
const { compareHash, generateToken } = require('../../utils/heplers')


async function generateAndSaveToken(payload) {
    const accessToken = generateToken(payload)
    const refreshToken = generateToken(payload, '30d')
    const refreshTokenTokenExpiryIn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    if (!accessToken || !refreshToken) return { refreshToken: null, accessToken: null }

    await RefreshToken.create({
        refreshToken,
        userId: payload?.userId,
        expiresAt: refreshTokenTokenExpiryIn //30 days
    })
    if (!refreshToken || !accessToken) sendFailResponse('Failed to generate token')
    return { accessToken, refreshToken }
}

// ----------------------
// Register User
// ----------------------
async function registerUser(userData) {
    const { name, email, password } = userData

    const userExist = await User.findOne({ email })
    if (userExist) sendFailResponse('The mail id exist')

    const user = await User.create({
        name,
        email,
        password,
    })

    const { refreshToken, accessToken } = await generateAndSaveToken({ userId: user?._id, email: user?.email })

    const { password: pw, ...rest } = user.toObject();

    return { message: 'Registration successful', data: { ...rest, accessToken, refreshToken } }
}


// ----------------------
// Login User
// ----------------------
async function login(userData) {
    const { email, password } = userData

    const userExist = await User.findOne({ email }).lean()

    if (!userExist) sendFailResponse('Invalid Data')

    const isSamePassword = await compareHash(password, userExist.password)
    if (!isSamePassword) sendFailResponse('PassWord mismatch')

    const { refreshToken, accessToken } = await generateAndSaveToken({ userId: userExist?._id, email: userExist?.email })

    const { password: pw, ...rest } = userExist

    return { message: 'registration success', data: { ...rest, accessToken, refreshToken } }
}


// ----------------------
// Logout User
// ----------------------
async function logout(userId) {
    await RefreshToken.findOneAndDelete({ userId: userId })
    return { message: 'Logged Out successfully', data: { loggedOut: true } }
}

module.exports = {
    registerUser,
    login,
    logout
}