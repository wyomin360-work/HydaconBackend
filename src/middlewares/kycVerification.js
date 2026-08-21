const User = require("../schemas/user.schema");
const { KYC_STATUS } = require("../constants/user");
const { sendFailResponse } = require("../utils/responseHandlers");

const KYC_RESTRICTION_MESSAGES = {
  [KYC_STATUS.NOT_STARTED]:
    "KYC verification is required before you can redeem points. Please complete your KYC.",
  [KYC_STATUS.PENDING]:
    "Your KYC verification is pending. You cannot redeem points until your KYC is approved.",
  [KYC_STATUS.REJECTED]:
    "Your KYC verification was rejected. Please re-submit your documents to redeem points.",
};

const ALLOWED_KYC_STATUSES = new Set([KYC_STATUS.APPROVED]);

/**
 * Middleware that blocks access for users whose KYC is not verified.
 * Must be used AFTER verifyUser middleware (requires req.userId).
 */
async function requireVerifiedKyc(req, res, next) {
  try {
    if (!req.userId) {
      sendFailResponse("User authentication required", 401);
    }

    const user = await User.findById(req.userId).select("kycStatus").lean();

    if (!user) {
      sendFailResponse("User not found", 404);
    }

    const kycStatus = user.kycStatus || KYC_STATUS.NOT_STARTED;

    if (ALLOWED_KYC_STATUSES.has(kycStatus)) {
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
