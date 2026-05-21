const ServiceRequestType = {
  FORGOT_PASSWORD: "FORGOT_PASSWORD",
  RESET_PASSWORD: "RESET_PASSWORD",
  SIMPLE_OTP_LOGIN: "SIMPLE_OTP_LOGIN",
};

const ServiceRequestStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  EXPIRED: "EXPIRED",
  USED: "USED",
};

module.exports = { ServiceRequestStatus, ServiceRequestType };
