const mongoose = require("mongoose");
const {
  POINTS_TRANSACTION_TYPE,
  POINTS_TRANSACTION_REASON,
} = require("../constants/points");

const pointsLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    transactionType: {
      type: String,
      enum: Object.values(POINTS_TRANSACTION_TYPE),
      required: true,
    },
    reason: {
      type: String,
      enum: Object.values(POINTS_TRANSACTION_REASON),
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    balance: {
      type: Number,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (doc, ret) => {
        ret.id = doc._id;
        return ret;
      },
    },
  },
);

const PointsLedger = mongoose.model("PointsLedger", pointsLedgerSchema);

module.exports = PointsLedger;
