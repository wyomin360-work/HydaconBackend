const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    date: { type: Date, required: true },
    registrationDeadline: { type: Date, required: true },
    location: { type: String, required: true },
    region: { type: String, default: "ALL" }, // "ALL" or specific areaOfOperation
    capacity: { type: Number, required: true, default: 0 }, // 0 = unlimited
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "CANCELLED", "COMPLETED"],
      default: "DRAFT",
    },
    requiresInvitation: { type: Boolean, default: false },
    coverImage: { type: String, default: null },
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

const Event = mongoose.model("Event", eventSchema);
module.exports = Event;
