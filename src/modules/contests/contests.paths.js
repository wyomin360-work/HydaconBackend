module.exports = {
  root: "/contests",
  // Admin
  adminCreate: "/admin/create",
  adminUpdate: "/admin/update/:contestId",
  adminDelete: "/admin/delete/:contestId",
  adminList: "/admin/list",
  adminSummary: "/admin/summary",
  adminDetails: "/admin/details/:contestId",
  adminFinalise: "/admin/finalise/:contestId", // triggers reward distribution
  // User
  userList: "/user/list",
  userDetails: "/user/details/:contestId",
  userLeaderboard: "/user/leaderboard/:contestId",
  userClaimReward: "/user/claim/:contestId",
  // General leaderboard (all-time, not contest-specific)
  generalLeaderboard: "/leaderboard",
};
