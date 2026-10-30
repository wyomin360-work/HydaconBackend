const { sendResponse } = require("../../utils/responseHandlers");
const service = require("./payouts.admin.service");
const payoutExecutionService = require("./payout-execution.service");
const payoutStateService = require("./payout-state.service");
const withdrawalService = require("../withdrawals/withdrawals.service");

exports.listPayouts = async (req, res) => {
  const result = await service.listPayouts(req.body || {});
  return sendResponse(res, result);
};

exports.getPayoutSummary = async (_req, res) => {
  const result = await service.getPayoutSummary();
  return sendResponse(res, result);
};

exports.getPayoutDetails = async (req, res) => {
  const result = await service.getPayoutDetails(req.params.id);
  return sendResponse(res, result);
};

/** Marks a pending manual payout paid and records its settlement details. */
exports.completeManualPayout = async (req, res) => {
  const result = await payoutStateService.completeManualPayout(
    req.userId,
    req.params.id,
    req.body,
  );
  return sendResponse(res, result);
};

/** Cancels a pending manual payout and refunds the withdrawal balance. */
exports.cancelManualPayout = async (req, res) => {
  const result = await withdrawalService.cancelApprovedManualPayout(
    req.userId,
    req.params.id,
    req.body.remarks,
  );
  return sendResponse(res, result);
};

/** Queues a pending manual payout with the currently configured payout provider. */
exports.convertManualPayoutToProvider = async (req, res) => {
  const result = await payoutExecutionService.convertManualPayoutToProvider(
    req.userId,
    req.params.id,
  );
  return sendResponse(res, result);
};
