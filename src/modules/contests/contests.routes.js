const express = require("express");
const router = express.Router();
const paths = require("./contests.paths");
const controller = require("./contests.controller");
const { handleError } = require("../../utils/heplers");
const verification = require("../../middlewares/jwtVerification");
const validateRequest = require("../../middlewares/validator");
const {
  adminCreateContestRequestType,
  adminUpdateContestRequestType,
} = require("../../validations/contests.validations");

// ─── Admin ────────────────────────────────────────────────────────────────────
router.post(
  paths.adminCreate,
  verification.verifyAdmin,
  validateRequest(adminCreateContestRequestType),
  handleError(controller.adminCreateContest),
);
router.patch(
  paths.adminUpdate,
  verification.verifyAdmin,
  validateRequest(adminUpdateContestRequestType),
  handleError(controller.adminUpdateContest),
);
router.delete(
  paths.adminDelete,
  verification.verifyAdmin,
  handleError(controller.adminDeleteContest),
);
router.get(
  paths.adminList,
  verification.verifyAdmin,
  handleError(controller.adminListContests),
);
router.get(
  paths.adminDetails,
  verification.verifyAdmin,
  handleError(controller.adminGetContestDetails),
);
router.post(
  paths.adminFinalise,
  verification.verifyAdmin,
  handleError(controller.adminFinaliseContest),
);

// ─── User ─────────────────────────────────────────────────────────────────────
router.get(
  paths.userList,
  verification.verifyUser,
  handleError(controller.userListContests),
);
router.get(
  paths.userDetails,
  verification.verifyUser,
  handleError(controller.userGetContestDetails),
);
router.get(
  paths.userLeaderboard,
  verification.verifyUser,
  handleError(controller.userGetLeaderboard),
);
router.post(
  paths.userClaimReward,
  verification.verifyUser,
  handleError(controller.userClaimReward),
);
router.get(
  paths.generalLeaderboard,
  verification.verifyUser,
  handleError(controller.generalLeaderboard),
);

module.exports = router;
