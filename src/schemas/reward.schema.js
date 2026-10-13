const { default: mongoose } = require("mongoose");

const rewardSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Types.ObjectId, required: true },
    batchId: { type: mongoose.Types.ObjectId, ref: "RewardBatch", index: true },
    voucherNumber: { type: Number, min: 1 },
    voucherUid: { type: String, trim: true },
    uidCode: { type: String, required: true },
    redeemedBy: { type: mongoose.Types.ObjectId, required: false },
    point: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    redeemedAt: { type: Date },
    isRedeemed: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

rewardSchema.virtual("product", {
  ref: "Product",
  localField: "productId",
  foreignField: "_id",
  justOne: true,
});

rewardSchema.index({ batchId: 1, isDeleted: 1, active: 1 });
rewardSchema.index(
  { batchId: 1, voucherNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { voucherNumber: { $type: "number" } },
    name: "unique_batch_voucher_number",
  },
);
rewardSchema.index(
  { voucherUid: 1 },
  {
    unique: true,
    partialFilterExpression: { voucherUid: { $type: "string" } },
    name: "unique_voucher_uid",
  },
);

const Reward = mongoose.model("Reward", rewardSchema);
module.exports = Reward;
