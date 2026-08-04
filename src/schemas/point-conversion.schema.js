const mongoose = require("mongoose");

const pointConversionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pointsConverted: { type: Number, required: true },
    conversionRatio: { type: Number, required: true },
    coinsReceived: { type: Number, required: true },
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

const PointConversion = mongoose.model(
  "PointConversion",
  pointConversionSchema,
);
module.exports = PointConversion;
