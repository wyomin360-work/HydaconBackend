module.exports = {
  root: "/admin",
  list: "/list",
  delete: "/delete/:adminId",
  auditLogs: {
    phoneNumberChanges: "/audit-logs/phone-number-changes",
  },
  auth: {
    login: "/auth/login",
    register: "/auth/register",
    logout: "/auth/logout",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
    updateDetails: "/auth/update",
  },
};
