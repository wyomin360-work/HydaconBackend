const mongoose = require("mongoose");

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    seasonId: { type: mongoose.Schema.Types.ObjectId, ref: "LoyaltySeason", required: false },
    points: { type: Number, required: true }, // positive for addition, negative for deduction
    type: {
      type: String,
      enum: ["QUALIFICATION", "REDEEMABLE", "BOTH"],
      required: true,
    },
    source: {
      type: String,
      enum: ["QR_SCAN", "CAMPAIGN_BONUS", "WITHDRAW", "ADMIN_ADJUSTMENT", "SEASON_ROLLOVER"],
      required: true,
    },
    description: { type: String, default: "" },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: false }, // e.g. ref Redeem or Transaction ID
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
  }
);

const LoyaltyTransaction = mongoose.model("LoyaltyTransaction", loyaltyTransactionSchema);
module.exports = LoyaltyTransaction;
