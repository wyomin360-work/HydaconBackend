module.exports = {
  root: "/events",
  // Admin
  adminCreate: "/admin/create",
  adminUpdate: "/admin/update/:eventId",
  adminDelete: "/admin/delete/:eventId",
  adminList: "/admin/list",
  adminSummary: "/admin/summary",
  adminDetails: "/admin/details/:eventId",
  adminInviteUser: "/admin/invite/:eventId", // POST { userId }
  adminCheckIn: "/admin/checkin/:registrationId", // mark user as checked_in
  // User
  userList: "/user/list",
  userDetails: "/user/details/:eventId",
  userRegister: "/user/register/:eventId",
  userPass: "/user/pass/:registrationId",
  myEvents: "/user/my-events",
};
