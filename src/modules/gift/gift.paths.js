module.exports = {
  root: "/gifts",
  // Admin Routes
  adminList: "/admin/list",
  adminCreate: "/admin/create",
  adminUpdate: "/admin/update/:giftId",
  adminDelete: "/admin/delete/:giftId",
  adminDetails: "/admin/details/:giftId",
  
  // User Routes
  userList: "/user/list",
  userDetails: "/user/details/:giftId",
  userEligibility: "/user/eligibility/:giftId",
  userRedemptionDetails: "/user/redemptions/:redemptionId",
  
  // Category Routes (Admin)
  categoryList: "/categories/list",
  categoryCreate: "/categories/create",
  categoryUpdate: "/categories/update/:categoryId",
  categoryDelete: "/categories/delete/:categoryId",
  // Redemption Routes (User)
  redeemGift: "/user/redeem",
  userRedemptions: "/user/redemptions",

  // Redemption Routes (Admin)
  adminRedemptionList: "/admin/redemptions/list",
  adminUpdateRedemption: "/admin/redemptions/update/:redemptionId",
  adminRedemptionDetails: "/admin/redemptions/details/:redemptionId",
  
  // Analytics (Admin)
  adminAnalytics: "/admin/analytics",
};
