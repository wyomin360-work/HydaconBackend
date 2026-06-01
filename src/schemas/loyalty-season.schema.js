const mongoose = require("mongoose");

const loyaltySeasonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true }, // e.g. "S1_2026", "SUMMER_26"
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    active: { type: Boolean, default: false }, // Only one season should be active at a time
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

const LoyaltySeason = mongoose.model("LoyaltySeason", loyaltySeasonSchema);
module.exports = LoyaltySeason;
