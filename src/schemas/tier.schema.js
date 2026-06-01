const mongoose = require("mongoose");

const tierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    key: { type: String, required: true, unique: true, lowercase: true },
    colorIdentity: { type: String, required: true },
    badgeUrl: { type: String, default: "" },
    rank: { type: Number, required: true, unique: true }, // 0: Beginner, 1: Bronze, etc.
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

const Tier = mongoose.model("Tier", tierSchema);
module.exports = Tier;
