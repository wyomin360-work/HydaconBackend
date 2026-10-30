const mongoose = require("mongoose");
const Payout = require("../../schemas/payout.schema");
const User = require("../../schemas/user.schema");
const { WITHDRAWAL_STATUS } = require("../../constants/withdrawals");
const {
  PAYOUT_HTTP_STATUS,
  PAYOUT_MESSAGE,
} = require("../../constants/payouts");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { getWithdrawalDetails } = require("../withdrawals/withdrawals.service");

const SUMMARY_STATUSES = Object.values(WITHDRAWAL_STATUS);

function escapeSearchPattern(search) {
  return search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Builds an indexed payout query from its status and searchable relations. */
async function buildPayoutQuery(search, status) {
  const query = {};
  if (status) query.status = status;
  if (!search) return query;
  const searchPattern = escapeSearchPattern(search.trim());
  if (!searchPattern) return query;

  const matchingUsers = await User.find({
    $or: [
      { name: { $regex: searchPattern, $options: "i" } },
      { email: { $regex: searchPattern, $options: "i" } },
    ],
  })
    .select("_id")
    .lean();

  query.$or = [
    { userId: { $in: matchingUsers.map((user) => user._id) } },
    { providerTransferId: { $regex: searchPattern, $options: "i" } },
    { providerReferenceId: { $regex: searchPattern, $options: "i" } },
  ];
  if (mongoose.Types.ObjectId.isValid(search)) {
    query.$or.push({ withdrawalId: new mongoose.Types.ObjectId(search) });
  }
  return query;
}

/** Formats a payout document with the related customer and bank display data. */
function formatPayoutListItem(payout) {
  return {
    ...payout,
    id: payout._id,
    user: payout.userId,
    bank: {
      bankName: payout.bankAccountId?.bankName,
      branchName: payout.bankAccountId?.branchName,
      accountHolderName: payout.bankAccountId?.accountHolderName,
    },
  };
}

/** Lists only payout records, which are created transactionally at approval. */
async function listPayouts(data) {
  const page = Math.max(1, Number.parseInt(data.page, 10) || 1);
  const limit = Math.max(1, Number.parseInt(data.limit, 10) || 10);
  const search = data.search || "";
  const status = data.status || "";
  const query = await buildPayoutQuery(search, status);
  const skip = (page - 1) * limit;

  const [records, total] = await Promise.all([
    Payout.find(query)
      .populate("userId", "name email phone language")
      .populate("bankAccountId", "bankName branchName accountHolderName")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Payout.countDocuments(query),
  ]);

  return {
    payouts: records.map(formatPayoutListItem),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/** Counts only persisted payouts, excluding unapproved withdrawal requests. */
async function getPayoutSummary() {
  const groups = await Payout.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const counts = { ALL: 0 };
  SUMMARY_STATUSES.forEach((status) => {
    counts[status] = 0;
  });

  groups.forEach(({ _id, count }) => {
    if (counts[_id] !== undefined) counts[_id] = count;
    counts.ALL += count;
  });
  return counts;
}

/** Resolves a payout record to its withdrawal and existing payout audit trail. */
async function getPayoutDetails(payoutId) {
  const payout = await Payout.findById(payoutId).lean();
  if (!payout) {
    sendFailResponse(
      PAYOUT_MESSAGE.WITHDRAWAL_NOT_FOUND,
      PAYOUT_HTTP_STATUS.NOT_FOUND,
    );
  }

  const withdrawal = await getWithdrawalDetails(String(payout.withdrawalId));
  return {
    ...withdrawal,
    _id: String(payout._id),
    id: String(payout._id),
    payoutId: String(payout._id),
    withdrawalId: String(payout.withdrawalId),
    status: payout.status,
    payoutProvider: payout.payoutProvider,
    payoutBatchId: payout.payoutBatchId,
    providerReferenceId: payout.providerReferenceId,
    providerTransferId: payout.providerTransferId,
    utr: payout.utr,
    approvalSource: payout.approvalSource,
    approvedBy: payout.approvedBy,
    approvedAt: payout.approvedAt,
    cancelledBy: payout.cancelledBy,
    cancelledAt: payout.cancelledAt,
    completedAt: payout.completedAt,
    failureReason: payout.failureReason,
    remarks: payout.remarks,
    cashAmount: payout.cashAmount,
    pointsAmount: payout.pointsAmount,
    coinAmount: payout.coinAmount,
    pointConversionSnapshot: payout.pointConversionSnapshot,
    payoutCreatedAt: payout.createdAt,
  };
}

module.exports = {
  listPayouts,
  getPayoutSummary,
  getPayoutDetails,
};
