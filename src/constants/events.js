const EVENT_STATUS = {
  UPCOMING: "upcoming",
  ONGOING: "ongoing",
  COMPLETED: "completed",
};

const EVENT_TYPE = {
  WEBINAR: "webinar",
  WORKSHOP: "workshop",
  CONFERENCE: "conference",
  MEETUP: "meetup",
  OTHER: "other",
};

const ATTENDANCE_STATUS = {
  REGISTERED: "registered",
  CHECKED_IN: "checked_in",
  ATTENDED: "attended",
  CANCELLED: "cancelled",
  EVENT_CANCELLED: "event cancelled",
};

const EVENT_TABS = {
  FEATURED: "featured",
  NEARBY: "nearby",
  UPCOMING: "upcoming",
};

const GEO_TYPES = {
  POINT: "Point",
};

const EVENT_FCM_TYPES = {
  EVENT_INVITATION: "EVENT_INVITATION",
  EVENT_REGISTRATION_CONFIRMED: "EVENT_REGISTRATION_CONFIRMED",
};

const EVENT_MESSAGES = {
  CREATED: "Event created",
  UPDATED: "Event updated",
  DELETED: "Event deleted",
  USER_INVITED: "User invited",
  CHECKED_IN: "Checked in",
  REGISTERED_SUCCESSFULLY: "Registered successfully",
};

const EVENT_ERRORS = {
  INVALID_START_DATE: "Invalid start date",
  INVALID_END_DATE: "Invalid end date",
  END_BEFORE_START: "End date cannot be before start date",
  EVENT_NOT_FOUND: "Event not found",
  EVENT_NOT_ACTIVE: "Event is not active",
  EVENT_ALREADY_ENDED: "Event has already ended",
  REGISTRATION_DEADLINE_PASSED: "Registration deadline has passed",
  NOT_ELIGIBLE: "You are not eligible for this event",
  FULL_CAPACITY: "Event is at full capacity",
  USER_NOT_FOUND: "User not found",
  REGISTRATION_NOT_FOUND: "Registration not found",
  CANNOT_CHECKIN_CANCELLED: "Cannot check in a cancelled registration",
  UNAUTHORIZED: "Unauthorized",
  USER_ID_REQUIRED: "User ID is required",
};

const EVENT_CONFIG = {
  SYNC_INTERVAL_MS: 60 * 1000,
  MAX_GEO_DISTANCE_METERS: 100000,
  DEFAULT_ADMIN_LIMIT: 20,
  DEFAULT_USER_LIMIT: 10,
  FEATURED_LIMIT: 5,
  OVERVIEW_LIMIT: 4,
};

module.exports = {
  EVENT_STATUS,
  EVENT_TYPE,
  ATTENDANCE_STATUS,
  EVENT_TABS,
  GEO_TYPES,
  EVENT_FCM_TYPES,
  EVENT_MESSAGES,
  EVENT_ERRORS,
  EVENT_CONFIG,
};
