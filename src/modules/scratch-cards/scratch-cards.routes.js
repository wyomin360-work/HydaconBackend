const express = require("express");
const scratchCardsController = require("./scratch-cards.controller");
const scratchCardsPaths = require("./scratch-cards.paths");
const { handleError } = require("../../utils/heplers");
const verification = require("../../middlewares/jwtVerification");
const validateRequest = require("../../middlewares/validator");
const {
  listScratchCardsRequestType,
  scratchCardParamsSchema,
} = require("../../validations/scratch-cards.validations");

const router = express.Router();

router.post(
  scratchCardsPaths.list,
  verification.verifyAdminOrUser,
  validateRequest(listScratchCardsRequestType),
  handleError(scratchCardsController.listScratchCards),
);

router.post(
  scratchCardsPaths.scratch,
  verification.verifyUser,
  validateRequest(scratchCardParamsSchema, "params"),
  handleError(scratchCardsController.scratchCard),
);

module.exports = router;
