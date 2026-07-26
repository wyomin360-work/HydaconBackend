const mongoose = require("mongoose");
const { CONTEST_METRICS } = require("../constants/contests");

const contestTransactionSchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contest",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Redeem",
      required: true,
    },
    metric: {
      type: String,
      enum: Object.values(CONTEST_METRICS),
      required: true,
    },
    metricValue: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate transactions per contest
contestTransactionSchema.index(
  { contestId: 1, userId: 1, transactionId: 1 },
  { unique: true }
);

const ContestTransaction = mongoose.model(
  "ContestTransaction",
  contestTransactionSchema
);
module.exports = ContestTransaction;
