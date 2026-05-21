const User = require("../schemas/user.schema");
const { KYC_STATUS } = require("../constants/user");

const KYC_RESTRICTION_MESSAGES = {
  [KYC_STATUS.NOT_STARTED]:
    "KYC verification is required before you can redeem points. Please complete your KYC.",
  [KYC_STATUS.PENDING]:
    "Your KYC verification is pending. You cannot redeem points until your KYC is approved.",
  [KYC_STATUS.REJECTED]:
    "Your KYC verification was rejected. Please re-submit your documents to redeem points.",
};

const ALLOWED_KYC_STATUSES = [KYC_STATUS.APPROVED, KYC_STATUS.VERIFIED];

/**
 * Middleware that blocks access for users whose KYC is not verified.
 * Must be used AFTER verifyUser middleware (requires req.userId).
 */
async function requireVerifiedKyc(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("kycStatus");

    if (!user) {
      return res.status(404).json({
        status: "fail",
        message: "User not found",
      });
    }

    const kycStatus = user.kycStatus || KYC_STATUS.NOT_STARTED;

    if (ALLOWED_KYC_STATUSES.includes(kycStatus)) {
      return next();
    }

    const message =
      KYC_RESTRICTION_MESSAGES[kycStatus] ||
      "KYC verification is required to redeem points.";

    return res.status(403).json({
      status: "fail",
      message,
      data: {
        kycStatus,
        redeemBlocked: true,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { requireVerifiedKyc };
