const { default: mongoose } = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const ATTENDANCE_STATUS = {
  REGISTERED: "registered",
  CHECKED_IN: "checked_in",
  ATTENDED: "attended",
  CANCELLED: "cancelled",
  EVENT_CANCELLED: "event cancelled",
};

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
    // Unique code embedded in QR on the event pass
    registrationId: {
      type: String,
      unique: true,
      default: () => uuidv4().replace(/-/g, "").substring(0, 12).toUpperCase(),
    },
    attendanceStatus: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      default: ATTENDANCE_STATUS.REGISTERED,
    },
    isInvited: { type: Boolean, default: false },
    checkedInAt: { type: Date },
  },
  { timestamps: true },
);

eventRegistrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });

eventRegistrationSchema.virtual("event", {
  ref: "Event",
  localField: "eventId",
  foreignField: "_id",
  justOne: true,
});
eventRegistrationSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});
eventRegistrationSchema.set("toJSON", { virtuals: true });
eventRegistrationSchema.set("toObject", { virtuals: true });

const EventRegistration = mongoose.model(
  "EventRegistration",
  eventRegistrationSchema,
);
module.exports = { EventRegistration, ATTENDANCE_STATUS };
