const express = require("express");
const controller = require("./contests.controller");
const paths = require("./contests.paths");
const { handleError } = require("../../utils/heplers");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

// Admin routes
router.get(
  paths.ADMIN_CONTEST_LIST,
  verification.verifyAdmin,
  handleError(controller.listContests)
);
router.post(
  paths.ADMIN_CONTEST_CREATE,
  verification.verifyAdmin,
  handleError(controller.createContest)
);
router.get(
  paths.ADMIN_CONTEST_GET,
  verification.verifyAdmin,
  handleError(controller.getContestById)
);
router.patch(
  paths.ADMIN_CONTEST_UPDATE,
  verification.verifyAdmin,
  handleError(controller.updateContest)
);
router.delete(
  paths.ADMIN_CONTEST_DELETE,
  verification.verifyAdmin,
  handleError(controller.deleteContest)
);
router.get(
  paths.ADMIN_CONTEST_LEADERBOARD,
  verification.verifyAdmin,
  handleError(controller.getAdminLeaderboard)
);
router.get(
  paths.ADMIN_CONTEST_ANALYTICS,
  verification.verifyAdmin,
  handleError(controller.getContestAnalytics)
);

// User routes
router.get(
  paths.USER_CONTEST_LIST,
  verification.verifyUser,
  handleError(controller.listUserContests)
);
router.get(
  paths.USER_CONTEST_LEADERBOARD,
  verification.verifyUser,
  handleError(controller.getUserLeaderboard)
);

module.exports = router;
