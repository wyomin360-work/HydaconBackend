const express = require("express");
const router = express.Router();
const paths = require("./events.paths");
const controller = require("./events.controller");
const { handleError } = require("../../utils/heplers");
const verification = require("../../middlewares/jwtVerification");

// ─── Admin ─────────────────────────────────────────────────────────────────
router.post(
  paths.adminCreate,
  verification.verifyAdmin,
  handleError(controller.adminCreateEvent),
);
router.patch(
  paths.adminUpdate,
  verification.verifyAdmin,
  handleError(controller.adminUpdateEvent),
);
router.delete(
  paths.adminDelete,
  verification.verifyAdmin,
  handleError(controller.adminDeleteEvent),
);
router.get(
  paths.adminList,
  verification.verifyAdmin,
  handleError(controller.adminListEvents),
);
router.get(
  paths.adminDetails,
  verification.verifyAdmin,
  handleError(controller.adminGetEventDetails),
);
router.post(
  paths.adminInviteUser,
  verification.verifyAdmin,
  handleError(controller.adminInviteUser),
);
router.patch(
  paths.adminCheckIn,
  verification.verifyAdmin,
  handleError(controller.adminCheckIn),
);

// ─── User ──────────────────────────────────────────────────────────────────
router.get(
  paths.userList,
  verification.verifyUser,
  handleError(controller.userListEvents),
);
router.get(
  paths.userDetails,
  verification.verifyUser,
  handleError(controller.userGetEventDetails),
);
router.post(
  paths.userRegister,
  verification.verifyUser,
  handleError(controller.userRegisterForEvent),
);
router.get(
  paths.userPass,
  verification.verifyUser,
  handleError(controller.userGetEventPass),
);
router.get(
  paths.myEvents,
  verification.verifyUser,
  handleError(controller.userMyEvents),
);

module.exports = router;
