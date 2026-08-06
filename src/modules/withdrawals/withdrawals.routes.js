const express = require("express");
const paths = require("./withdrawals.path");
const verification = require("../../middlewares/jwtVerification");
const { handleError } = require("../../utils/heplers");
const controller = require("./withdrawals.controller");

const router = express.Router();

// User routes
router.post(
  paths.createBankAccount,
  verification.verifyUser,
  handleError(controller.configureBankAccount)
);

router.get(
  paths.getBankAccount,
  verification.verifyUser,
  handleError(controller.getBankAccount)
);

router.post(
  paths.createWithdrawal,
  verification.verifyUser,
  handleError(controller.createWithdrawal)
);

router.get(
  paths.history,
  verification.verifyUser,
  handleError(controller.getWithdrawalHistory)
);

// Admin routes
router.post(
  paths.adminList,
  verification.verifyAdmin,
  handleError(controller.listWithdrawals)
);

router.get(
  paths.adminSummary,
  verification.verifyAdmin,
  handleError(controller.getWithdrawalsSummary)
);

router.get(
  paths.adminDetails,
  verification.verifyAdmin,
  handleError(controller.getWithdrawalDetails)
);

router.post(
  paths.adminApprove,
  verification.verifyAdmin,
  handleError(controller.approveWithdrawal)
);

router.post(
  paths.adminCancel,
  verification.verifyAdmin,
  handleError(controller.cancelWithdrawal)
);

module.exports = router;
