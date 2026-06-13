const mongoose = require("mongoose");

const eventRegistrationSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["INTERESTED", "INVITED", "REGISTERED", "ATTENDED", "CANCELLED"],
      default: "INTERESTED",
    },
    qrCodeData: {
      type: String,
      default: null,
    },
    checkInTime: {
      type: Date,
      default: null,
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
  }
);

// Ensure a user can only have one registration record per event
eventRegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });

const EventRegistration = mongoose.model(
  "EventRegistration",
  eventRegistrationSchema
);
module.exports = EventRegistration;
