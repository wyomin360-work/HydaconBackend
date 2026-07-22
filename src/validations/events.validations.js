const { EVENT_TYPE } = require("../constants/events");

const eventCreateRequestType = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    bannerImage: { type: "string" },
    venue: { type: "string", minLength: 1 },
    city: { type: "string" },
    state: { type: "string" },
    country: { type: "string" },
    date: { type: "string" },
    endDate: { type: "string" },
    registrationDeadline: { type: "string" },
    capacity: { type: "integer", minimum: 1 },
    type: { type: "string", enum: Object.values(EVENT_TYPE) },
    isInvitationOnly: { type: "boolean" },
    active: { type: "boolean" },
    location: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["Point"] },
        coordinates: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
        },
      },
      additionalProperties: false,
    },
  },
  required: ["title", "description", "venue", "date"],
  additionalProperties: false,
  errorMessage: {
    required: {
      title: "Title is required",
      description: "Description is required",
      venue: "Venue is required",
      date: "Start date is required",
    },
    additionalProperties: "Unrecognized request properties sent",
  },
};

const eventUpdateRequestType = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    description: { type: "string", minLength: 1 },
    bannerImage: { type: "string" },
    venue: { type: "string", minLength: 1 },
    city: { type: "string" },
    state: { type: "string" },
    country: { type: "string" },
    date: { type: "string" },
    endDate: { type: "string" },
    registrationDeadline: { type: "string" },
    capacity: { type: "integer", minimum: 1 },
    type: { type: "string", enum: Object.values(EVENT_TYPE) },
    isInvitationOnly: { type: "boolean" },
    active: { type: "boolean" },
    location: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["Point"] },
        coordinates: {
          type: "array",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2,
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
  errorMessage: {
    additionalProperties: "Unrecognized request properties sent",
  },
};

const eventInviteUserRequestType = {
  type: "object",
  properties: {
    userId: { type: "string", minLength: 1 },
  },
  required: ["userId"],
  additionalProperties: false,
  errorMessage: {
    required: {
      userId: "userId is required to invite user",
    },
    additionalProperties: "Unrecognized request properties sent",
  },
};

module.exports = {
  eventCreateRequestType,
  eventUpdateRequestType,
  eventInviteUserRequestType,
};
