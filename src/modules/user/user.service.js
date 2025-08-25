const User = require('../../schemas/user.schema')
const ServiceRequest = require('../../schemas/service-request.schema')
const RefreshToken = require('../../schemas/refreshtoken.schema')
const { sendFailResponse, sendResponse } = require('../../utils/responseHandlers')
const { compareHash, generateToken, attachId, generateOtp, generateBufferToken, hashData } = require('../../utils/heplers')
const { sendMail } = require('../../functions/nodemailer')
const { ServiceRequestStatus, ServiceRequestType } = require('../../constants/service-request')
const moment = require('moment')


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

    const { password: pw, ...rest } = attachId(userExist)

    return { message: 'registration success', data: { ...rest, accessToken, refreshToken } }
}


// ----------------------
// Logout User
// ----------------------
async function logout(userId) {
    await RefreshToken.findOneAndDelete({ userId: userId })
    return { message: 'Logged Out successfully', data: { loggedOut: true } }
}


// ----------------------
// verify Email
// ----------------------
async function verifyEmail(data) {
    const { email } = data
    const user = await User.findOne({ email: email })
    if (!user) sendFailResponse('User not found')

    const token = generateBufferToken()
    const otp = generateOtp(4)

    await ServiceRequest.deleteMany({
        userId: user.id,
        status: ServiceRequestStatus.PENDING,
        requestType: ServiceRequestType.FORGOT_PASSWORD
    })

    const otpHash = await hashData(otp)
    if (!otpHash) sendFailResponse('Failed to save otp')

    await ServiceRequest.create({
        userId: user.id,
        token,
        data: otpHash,
        status: ServiceRequestStatus.PENDING,
        requestType: ServiceRequestType.FORGOT_PASSWORD,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    })


    const mailOptions = {
        from: process.env.GOOGLE_USER_MAIL,
        to: user.email,
        subject: "Otp for forgot password",
        text: `Greetings from Hydacon , Here is your verification OTP : ${otp}`
    }

    const mailSent = await sendMail(mailOptions)
    if (!mailSent) sendFailResponse('Failed to sent mail , try again')

    return { message: `Otp sent to ${email}`, data: { otpSent: true, token } }
}


// ----------------------
// verify Otp
// ----------------------
async function verifyOtp(data) {
    const { otp, token } = data

    const verifySR = await ServiceRequest.findOne({ token, status: ServiceRequestStatus.PENDING })
    if (!verifySR) sendFailResponse('Token not found')

    const isExpired = moment().isAfter(verifySR.expiresIn);
    if (isExpired) {
        verifySR.status = ServiceRequestStatus.EXPIRED
        await verifySR.save()
        sendFailResponse('Otp expired')
    }

    const isCorrectOtp = await compareHash(otp, verifySR.data)
    if (!isCorrectOtp) sendFailResponse('Otp mismatch')

    await ServiceRequest.findByIdAndUpdate(verifySR._id, { status: ServiceRequestStatus.USED })

    const user = await User.findOne({ _id: verifySR.userId })
    const resetToken = generateBufferToken()

    await ServiceRequest.deleteMany({
        userId: user.id,
        status: ServiceRequestStatus.PENDING,
        requestType: ServiceRequestType.RESET_PASSWORD
    })

    await ServiceRequest.create({
        userId: user.id,
        token: resetToken,
        requestType: ServiceRequestType.RESET_PASSWORD,
        status: ServiceRequestStatus.PENDING,
        expiresAt: new Date(Date.now() + 20 * 60 * 1000)
    })

    return { message: 'otp verified', data: { otpVerified:true,token: resetToken } }
}


// ----------------------
// update Password
// ----------------------
async function updatePassword(data) {
    const { password, token } = data

    const verifySR = await ServiceRequest.findOne({
        token,
        status: ServiceRequestStatus.PENDING,
        requestType: ServiceRequestType.RESET_PASSWORD
    })
    if (!verifySR) sendFailResponse('reset token not found')

    await User.findByIdAndUpdate(verifySR.userId, { password })

    await ServiceRequest.findByIdAndUpdate(verifySR._id, { status: ServiceRequestStatus.USED })

    return {
        message: 'Password updated successfully',
        data: { passwordUpdated: true }
    }
}


module.exports = {
    registerUser,
    login,
    logout,
    updatePassword,
    verifyEmail,
    verifyOtp
}