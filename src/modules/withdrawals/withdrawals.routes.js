const express = require("express");
const paths = require("./withdrawals.path");
const verification = require("../../middlewares/jwtVerification");
const { handleError } = require("../../utils/heplers");
const controller = require("./withdrawals.controller");
const validateRequest = require("../../middlewares/validator");
const {
  createWithdrawalRequestType,
  cancelWithdrawalRequestType,
  listWithdrawalsRequestType,
} = require("../../validations/withdrawals.validations");

const router = express.Router();

// User routes

router.post(
  paths.createWithdrawal,
  verification.verifyUser,
  validateRequest(createWithdrawalRequestType),
  handleError(controller.createWithdrawal),
);

router.get(
  paths.history,
  verification.verifyUser,
  handleError(controller.getWithdrawalHistory),
);

router.get(
  paths.details,
  verification.verifyUser,
  handleError(controller.getWithdrawalDetailsUser),
);

// Admin routes
router.post(
  paths.adminList,
  verification.verifyAdmin,
  validateRequest(listWithdrawalsRequestType),
  handleError(controller.listWithdrawals),
);

router.get(
  paths.adminSummary,
  verification.verifyAdmin,
  handleError(controller.getWithdrawalsSummary),
);

router.get(
  paths.adminDetails,
  verification.verifyAdmin,
  handleError(controller.getWithdrawalDetails),
);

router.post(
  paths.adminApprove,
  verification.verifyAdmin,
  handleError(controller.approveWithdrawal),
);

router.post(
  paths.adminCancel,
  verification.verifyAdmin,
  validateRequest(cancelWithdrawalRequestType),
  handleError(controller.cancelWithdrawal),
);

module.exports = router;
