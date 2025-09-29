module.exports = {
    root: '/admin',
    list: '/list',
    delete: '/delete/:adminId',
    auth: {
        login: '/auth/login',
        register: '/auth/register',
        logout: '/auth/logout',
        forgotPassword: '/auth/forgot-password',
        resetPassword: '/auth/reset-password',
        updateDetails:'/auth/update'
    }
}