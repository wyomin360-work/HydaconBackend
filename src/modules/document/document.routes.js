const express = require("express");
const documentPaths = require("./document.paths");
const controller = require("./document.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  addDocumentRequestType,
  updateDocumentRequestType,
} = require("../../validations/document.validations");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

// All document management routes require authentication
router.use(verification.verifyAdminOrUser);

router.post(
  documentPaths.create,
  validateRequest(addDocumentRequestType),
  handleError(controller.addDocument),
);

router.get(documentPaths.list, handleError(controller.documentsList));

router.get(documentPaths.details, handleError(controller.documentDetails));

router.patch(
  documentPaths.update,
  validateRequest(updateDocumentRequestType),
  handleError(controller.editDocument),
);

router.delete(documentPaths.delete, handleError(controller.deleteDocuments));

module.exports = router;
