const EVENTS_PATHS = {
  root: "/events",
  
  // Admin Routes
  ADMIN_EVENT_LIST: "/admin/events",
  ADMIN_EVENT_CREATE: "/admin",
  ADMIN_EVENT_GET: "/admin/:id",
  ADMIN_EVENT_UPDATE: "/admin/:id",
  ADMIN_EVENT_DELETE: "/admin/:id",
  ADMIN_EVENT_INVITE: "/admin/:id/invite",
  ADMIN_EVENT_REGISTRATIONS: "/admin/:id/registrations",
  ADMIN_EVENT_CHECKIN: "/admin/checkin",
  ADMIN_EVENT_REPORT: "/admin/:id/report",

  // User Routes
  USER_EVENT_LIST: "/user",
  USER_MY_REGISTRATIONS: "/user/my-registrations",
  USER_EVENT_INTEREST: "/user/:id/interest",
  USER_EVENT_REGISTER: "/user/:id/register",
  USER_EVENT_CANCEL: "/user/:id/cancel",
};

module.exports = EVENTS_PATHS;
