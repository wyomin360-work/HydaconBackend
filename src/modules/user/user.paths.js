
module.exports = {
    root: '/user',
    details: '/details',
    auth: {
        login: '/auth/login',
        register: '/auth/register',
        logout: '/auth/logout',
        verifyEmail: '/auth/verify-email',
        verifyOtp: '/auth/verify-otp',
        resetPassword: '/auth/reset-password',
        authenticateWithProvider: '/auth/external-provider'
    },
    bank: {
        details: '/bank-details',
        create: '/bank-details/create',
        update: '/bank-details/update',
        delete: '/bank-details/delete'
    }
}