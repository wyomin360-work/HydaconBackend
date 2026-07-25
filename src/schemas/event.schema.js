const { default: mongoose } = require("mongoose");
const { EVENT_STATUS, EVENT_TYPE, GEO_TYPES } = require("../constants/events");

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    bannerImage: { type: String },
    venue: { type: String, required: true },
    // GeoJSON point for nearby-events queries
    location: {
      type: { type: String, enum: [GEO_TYPES.POINT], default: GEO_TYPES.POINT },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    date: { type: Date, required: true },
    endDate: { type: Date, required: true },
    registrationDeadline: { type: Date },
    capacity: { type: Number },
    type: {
      type: String,
      enum: Object.values(EVENT_TYPE),
      default: EVENT_TYPE.OTHER,
    },
    status: {
      type: String,
      enum: Object.values(EVENT_STATUS),
      default: EVENT_STATUS.UPCOMING,
    },
    isInvitationOnly: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

eventSchema.index({ location: "2dsphere" });
// Speeds up adminListEvents filter + sort
eventSchema.index({ status: 1, date: 1 });
// Speeds up syncEventStatuses updateMany queries
eventSchema.index({ date: 1, endDate: 1, status: 1 });
// Speeds up active + status filter used in userListEvents
eventSchema.index({ active: 1, status: 1, date: 1 });

const Event = mongoose.model("Event", eventSchema);
module.exports = { Event, EVENT_STATUS, EVENT_TYPE };
