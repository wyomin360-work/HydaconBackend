const mongoose = require("mongoose");

const tierBenefitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    key: { type: String, required: true, unique: true }, // e.g. "free_shipping", "double_points"
    active: { type: Boolean, default: true },
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

const TierBenefit = mongoose.model("TierBenefit", tierBenefitSchema);
module.exports = TierBenefit;
