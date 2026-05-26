const { default: mongoose } = require("mongoose");
const {
  ServiceRequestType,
  ServiceRequestStatus,
} = require("../constants/service-request");

const srSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Types.ObjectId,
      required: true,
      ref: "User",
    },
    data: {
      type: String,
      required: false,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: false,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    requestType: {
      type: String,
      enum: Object.values(ServiceRequestType),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ServiceRequestStatus),
      default: ServiceRequestStatus.PENDING,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    verifiedAt: {
      type: Date,
    },
    usedAt: {
      type: Date,
    },
    smsSentAt: {
      type: Date,
    },
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

const ServiceRequest = mongoose.model("ServiceRequest", srSchema);
module.exports = ServiceRequest;
