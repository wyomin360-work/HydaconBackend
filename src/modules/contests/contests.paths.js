const CONTESTS_PATHS = {
  root: "/contests",
  ADMIN_CONTEST_LIST: "/admin/contests",
  ADMIN_CONTEST_CREATE: "/admin",
  ADMIN_CONTEST_GET: "/admin/:id",
  ADMIN_CONTEST_UPDATE: "/admin/:id",
  ADMIN_CONTEST_DELETE: "/admin/:id",
  ADMIN_CONTEST_LEADERBOARD: "/admin/:id/leaderboard",
  ADMIN_CONTEST_ANALYTICS: "/admin/:id/analytics",
  
  USER_CONTEST_LIST: "/user",
  USER_CONTEST_LEADERBOARD: "/user/:id/leaderboard",
};

module.exports = CONTESTS_PATHS;
