const ServiceRequestType = {
  FORGOT_PASSWORD: "FORGOT_PASSWORD",
  RESET_PASSWORD: "RESET_PASSWORD",
};

const ServiceRequestStatus = {
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  EXPIRED: "EXPIRED",
  USED: "USED",
};

module.exports = { ServiceRequestStatus, ServiceRequestType };
