const express = require("express");
const controller = require("./events.controller");
const paths = require("./events.paths");
const { handleError } = require("../../utils/heplers");
const verification = require("../../middlewares/jwtVerification");
const validateRequest = require("../../middlewares/validator");
const { paginationType } = require("../../validations/global.validations");

const router = express.Router();

// Admin Routes
router.post(
  paths.ADMIN_EVENT_LIST,
  verification.verifyAdmin,
  validateRequest(paginationType),
  handleError(controller.listAdminEvents)
);
router.post(
  paths.ADMIN_EVENT_CREATE,
  verification.verifyAdmin,
  handleError(controller.createEvent)
);
router.get(
  paths.ADMIN_EVENT_GET,
  verification.verifyAdmin,
  handleError(controller.getEventById)
);
router.patch(
  paths.ADMIN_EVENT_UPDATE,
  verification.verifyAdmin,
  handleError(controller.updateEvent)
);
router.delete(
  paths.ADMIN_EVENT_DELETE,
  verification.verifyAdmin,
  handleError(controller.deleteEvent)
);
router.post(
  paths.ADMIN_EVENT_INVITE,
  verification.verifyAdmin,
  handleError(controller.inviteUser)
);
router.post(
  paths.ADMIN_EVENT_REGISTRATIONS,
  verification.verifyAdmin,
  validateRequest(paginationType),
  handleError(controller.getEventRegistrations)
);
router.post(
  paths.ADMIN_EVENT_CHECKIN,
  verification.verifyAdmin,
  handleError(controller.checkInUser)
);
router.get(
  paths.ADMIN_EVENT_REPORT,
  verification.verifyAdmin,
  handleError(controller.getEventReport)
);

// User Routes
router.post(
  paths.USER_EVENT_LIST,
  verification.verifyUser,
  validateRequest(paginationType),
  handleError(controller.listUserEvents)
);
router.post(
  paths.USER_MY_REGISTRATIONS,
  verification.verifyUser,
  validateRequest(paginationType),
  handleError(controller.getMyRegistrations)
);
router.post(
  paths.USER_EVENT_INTEREST,
  verification.verifyUser,
  handleError(controller.markInterest)
);
router.post(
  paths.USER_EVENT_REGISTER,
  verification.verifyUser,
  handleError(controller.registerForEvent)
);
router.post(
  paths.USER_EVENT_CANCEL,
  verification.verifyUser,
  handleError(controller.cancelRegistration)
);

module.exports = router;
