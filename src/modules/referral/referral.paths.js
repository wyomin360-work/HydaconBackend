module.exports = {
  root: "/referrals",

  // User endpoints
  send: "/send",
  dashboard: "/dashboard",
  myReferrals: "/my-referrals",
  detail: "/:id",

  // Action endpoints (patch)
  reward: "/:id/reward",
  firstScanReminder: "/:id/first-scan-reminder",

  // Delete
  delete: "/:id",
};
