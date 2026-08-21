const mongoose = require("mongoose");
const {
  LOYALTY_TRANSACTION_TYPES,
  LOYALTY_TRANSACTION_SOURCES,
} = require("../constants/loyalty");

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seasonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoyaltySeason",
      required: false,
    },
    points: { type: Number, required: true }, // positive for addition, negative for deduction
    type: {
      type: String,
      enum: Object.values(LOYALTY_TRANSACTION_TYPES),
      required: true,
    },
    source: {
      type: String,
      enum: Object.values(LOYALTY_TRANSACTION_SOURCES),
      required: true,
    },
    description: { type: String, default: "" },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: false }, // e.g. ref Redeem or Transaction ID
    expiresAt: { type: Date, default: null }, // for point expiration policy
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

const LoyaltyTransaction = mongoose.model(
  "LoyaltyTransaction",
  loyaltyTransactionSchema,
);
module.exports = LoyaltyTransaction;
