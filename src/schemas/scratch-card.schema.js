const { default: mongoose } = require("mongoose");
const {
  SCRATCH_CARD_STATUS,
  SCRATCH_CARD_REWARD_TYPE,
} = require("../constants/scratch-cards");

const scratchCardSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    redeemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Redeem",
      required: true,
    },
    rewardType: {
      type: String,
      enum: Object.values(SCRATCH_CARD_REWARD_TYPE),
      required: true,
    },
    points: { type: Number, default: 0 },
    giftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Gift",
    },
    cardBg: { type: String },
    status: {
      type: String,
      enum: Object.values(SCRATCH_CARD_STATUS),
      default: SCRATCH_CARD_STATUS.UNSCRATCHED,
    },
    scratchedAt: { type: Date },
  },
  { timestamps: true }
);

const ScratchCard = mongoose.model("ScratchCard", scratchCardSchema);
module.exports = ScratchCard;
