const User = require('../../schemas/user.schema')
const ServiceRequest = require('../../schemas/service-request.schema')
const RefreshToken = require('../../schemas/refreshtoken.schema')
const { sendFailResponse, sendResponse } = require('../../utils/responseHandlers')
const { compareHash, generateToken, attachId, generateOtp, generateBufferToken, hashData, generateRandomPassword } = require('../../utils/heplers')
const { sendMail } = require('../../functions/nodemailer')
const { ServiceRequestStatus, ServiceRequestType } = require('../../constants/service-request')
const moment = require('moment')
const { verifyGoogleToken, verifyAppleIdentityToken } = require('../../functions/auth')
const { AuthTypes } = require('../../constants/user')
const { encrypt, decrypt } = require('../../utils/encryption')
const { validateIFSC } = require('../../functions/razorPay')
const { sendFcmNotifications } = require('../../functions/fcm')


async function generateAndSaveToken(payload) {
    const accessToken = generateToken(payload)
    const refreshToken = generateToken(payload, '30d')
    const refreshTokenTokenExpiryIn = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    if (!accessToken || !refreshToken) return { refreshToken: null, accessToken: null }

    await RefreshToken.deleteMany({ userId: payload?.userId })

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
    const { name, email, password, avatarId } = userData

    const userExist = await User.findOne({ email })
    if (userExist) sendFailResponse('The mail id exist')

    const user = await User.create({
        name,
        email,
        password,
        authType: AuthTypes.EMAIL,
        avatarId
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

    if (userExist && userExist.authType !== AuthTypes.EMAIL) {
        sendFailResponse(`This email is already registered with 
        ${userExist.authType}. Please log in using that method.`);
    }

    const isSamePassword = await compareHash(password, userExist.password)
    if (!isSamePassword) sendFailResponse('PassWord mismatch')

    const { refreshToken, accessToken } = await generateAndSaveToken({ userId: userExist?._id, email: userExist?.email })

    const { password: pw, ...rest } = attachId(userExist)

    return { message: 'Logged in successfully', data: { ...rest, accessToken, refreshToken } }
}

// ----------------------
//  Provider Auth
// ----------------------

async function providerAuth(data) {
    const { idToken, provider, avatarId, firstName, lastName } = data
    if (!idToken) sendFailResponse('Auth token missing')

    const isGoogleAuth = provider === AuthTypes.GOOGLE

    let providerData = {}
    
    if (isGoogleAuth) {
        providerData = await verifyGoogleToken(idToken)
    } else if (provider === AuthTypes.APPLE) {
        providerData = await verifyAppleIdentityToken(idToken)
    }

    if (!providerData.isData) sendFailResponse(providerData?.message || 'Google auth failed, try again')

    const { email, sub: authKey } = providerData

    const userName = isGoogleAuth ? providerData?.name : `${firstName} ${lastName}`

    const userExist = await User.findOne({ email }).lean()

    if (!userExist) {
        const newUser = await User.create({
            email,
            password: generateRandomPassword(48),
            authKey,
            authType: provider,
            name: userName,
            avatarId
        })

        const { refreshToken, accessToken } = await generateAndSaveToken({ userId: newUser?._id, email: newUser?.email })

        const cleanData = newUser.toObject({ getters: true, virtuals: false });

        const { password: pw, ...rest } = attachId(cleanData)

        return { message: 'Registered successfully', data: { ...rest, accessToken, refreshToken, newUser: true } }

    } else {

        // if (userExist && userExist.authType !== AuthTypes.GOOGLE)
        //     sendFailResponse(`This email is already registered with 
        // ${userExist.authType}. Please log in using that method.`);

        const { refreshToken, accessToken } = await generateAndSaveToken({ userId: userExist?._id, email: userExist?.email })

        const { password: pw, ...rest } = attachId(userExist)

        return { message: 'Logged in successfully ', data: { ...rest, accessToken, refreshToken, newUser: false } }

    }
}

// ----------------------
// Logout User
// ----------------------
async function logout(userId) {
    await RefreshToken.findOneAndDelete({ userId: userId })
    await User.findByIdAndUpdate(userId, { $addToSet: { fcmTokens: [] } }, { new: true })
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

    return { message: 'otp verified', data: { otpVerified: true, token: resetToken } }
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


// ----------------------
// User Details
// ----------------------
async function getUserDetails(userId) {
    const user = await User.findById(userId).lean()
    if (!user) sendFailResponse('User not found')
    let returnData = {}

    if (user.bankDetails) {
        const { bankDetails, ...rest } = attachId(user)
        returnData = rest
    } else {
        returnData = attachId(user)
    }

    return { data: returnData }
}

// ----------------------
// Update User profile
// ----------------------
async function updateUserProfile(data, userId) {
    const { name, avatarId } = data
    const user = await User.findByIdAndUpdate(userId, { name, avatarId })
    if (!user) sendFailResponse('User not found')
    return { message: "Profile Updated Successfully", data: { profileUpdated: true } }
}

// ----------------------
// Update User settings
// ----------------------
async function updatePreferences(data, userId) {
    const { enableNotification } = data
    const user = await User.findByIdAndUpdate(userId, { enableNotification })
    if (!user) sendFailResponse('User not found')
    return { message: "Settings Updated Successfully", data: { userPreferenceUpdated: true } }
}


// ----------------------
// Add User Fcm token
// ----------------------
async function addFcmToken(data, userId) {
    const { fcmToken } = data
    const user = await User.findByIdAndUpdate(userId,
        {
            $addToSet: { fcmTokens: fcmToken },
        },
        { new: true },
    )
    if (!user) sendFailResponse('User not found')
    return { data: { tokenUpdated: true, updatedTokens: user.fcmTokens } }
}

// ----------------------
// User Bank Details
// ----------------------
async function getUserBankDetails(userId) {
    const user = await User.findById(userId)
    if (!user) sendFailResponse('User not found')

    if (!user.bankDetails?.accountNumber || !user.bankDetails?.ifscCode) sendFailResponse('Bank details are not added yet')

    const accountNumber = decrypt(user.bankDetails.accountNumber, user.bankDetails?.accountIv)
    const ifscCode = decrypt(user.bankDetails?.ifscCode, user.bankDetails?.ifscIv)

    if (!accountNumber || !ifscCode) sendFailResponse('Unable to get user bank details')
    const { accountIv, ifscIv, ...rest } = user?.bankDetails
    return {
        ...rest,
        accountNumber: accountNumber,
        ifscCode: ifscCode
    }
}

// ----------------------
// Add Bank Details
// ----------------------
async function addUserBankDetails(data, userId) {
    const { accountNumber, ifscCode, userName } = data

    const user = await User.findById(userId)
    if (!user) sendFailResponse('User not found')
    if (user.bankDetails?.accountNumber) sendFailResponse('user have already added account details , please update existing if need to change account')

    const bankInfo = await validateIFSC(ifscCode)
    if (!bankInfo) sendFailResponse('Invalid ifscCode')

    const encryptedAccountNumber = encrypt(accountNumber)
    const encryptedIfscCode = encrypt(ifscCode)

    if (!encryptedAccountNumber || !encryptedIfscCode) sendFailResponse('Unable to process bank details , try again')

    await User.findByIdAndUpdate(userId, {
        bankDetails: {
            accountNumber: encryptedAccountNumber.encryptedData,
            accountIv: encryptedAccountNumber.iv,
            ifscCode: encryptedIfscCode.encryptedData,
            ifscIv: encryptedIfscCode.iv,
            userName,
            branchName: bankInfo?.BRANCH,
            bankName: bankInfo?.BANK
        }
    })
    return { message: 'Bank details been added successfully', data: { addedBankDetails: true } }
}

// ----------------------
// Update Bank Details
// ----------------------
async function updateBankDetails(data, userId) {
    const { accountNumber, ifscCode, userName, bankName, branchName } = data
    const user = await User.findById(userId)
    if (!user) sendFailResponse('User not found')
    if (!user.bankDetails?.accountNumber) sendFailResponse('Bank details are not added yet')

    const bankInfo = await validateIFSC(ifscCode)
    if (!bankInfo) sendFailResponse('Invalid ifscCode')

    const encryptedAccountNumber = encrypt(accountNumber)
    const encryptedIfscCode = encrypt(ifscCode)

    if (!encryptedAccountNumber || !encryptedIfscCode) sendFailResponse('Unable to process bank details , try again')

    await User.findByIdAndUpdate(userId, {
        bankDetails: {
            accountNumber: encryptedAccountNumber.encryptedData,
            accountIv: encryptedAccountNumber.iv,
            ifscCode: encryptedIfscCode.encryptedData,
            ifscIv: encryptedIfscCode.iv,
            userName,
            branchName: bankInfo?.BRANCH,
            bankName: bankInfo?.BANK
        }
    })
    return { message: 'Bank details been updated successfully', data: { updatedBankDetails: true } }
}

// ----------------------
// Delete Bank Details
// ----------------------
async function deleteBankDetails(userId) {
    const user = await User.findById(userId)
    if (!user) sendFailResponse('User not found')
    if (!user.bankDetails?.accountNumber) sendFailResponse('Bank details not found')
    await User.findByIdAndUpdate(userId, {
        bankDetails: {}
    })
    return { message: 'Bank details been deleted successfully', data: { deletedBankDetails: true } }
}

// ----------------------
// Users List
// ----------------------

async function userList(data) {
    const {
        page = 1,
        limit = 10,
        search = "",
        sortBy = "createdAt",
        sortOrder = "desc",
        filters = {}
    } = data;

    const skip = (page - 1) * limit;

    let query = {};
    if (search) {
        query.$or = [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } }
        ];
    }

    if (filters.authType) {
        query.authType = filters.authType;
    }
    if (filters.enableNotification !== undefined) {
        query.enableNotification = filters.enableNotification;
    }
    if (filters.agreedToTerms !== undefined) {
        query.agreedToTerms = filters.agreedToTerms;
    }
    if (filters.minPoints !== undefined || filters.maxPoints !== undefined) {
        query.totalPoints = {};
        if (filters.minPoints !== undefined) query.totalPoints.$gte = Number(filters.minPoints);
        if (filters.maxPoints !== undefined) query.totalPoints.$lte = Number(filters.maxPoints);
    }

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const users = await User.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean() ?? [];

    const totalUsers = await User.countDocuments(query);

    return {
        data: {
            users,
            limit,
            totalPages: Math.ceil(totalUsers / limit),
            total: totalUsers,
            page,
        }
    };
}


module.exports = {
    registerUser,
    login,
    userList,
    logout,
    updatePassword,
    verifyEmail,
    verifyOtp,
    providerAuth,
    getUserDetails,
    updateUserProfile,
    addFcmToken,
    addUserBankDetails,
    updateBankDetails,
    deleteBankDetails,
    getUserBankDetails,
    updatePreferences
}