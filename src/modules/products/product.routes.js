const express = require("express");
const productPaths = require("./product.paths");
const productController = require("./product.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const { verifyAdmin } = require("../../middlewares/jwtVerification");
const {
  productCreateRequestType,
  productUpdateRequestType,
} = require("../../validations/product.validations");
const { paginationType } = require("../../validations/global.validations");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

// Public
router.post(
  productPaths.publicList,
  validateRequest(paginationType),
  handleError(productController.listProducts),
);

router.post(
  productPaths.list,
  verification.verifyAdmin,
  validateRequest(paginationType),
  handleError(productController.listProducts),
);

router.get(
  productPaths.details,
  verification.verifyAdmin,
  handleError(productController.getProduct)
);

router.post(
  productPaths.create,
  verifyAdmin,
  verification.verifyAdmin,
  validateRequest(productCreateRequestType),
  handleError(productController.createProduct),
);

router.patch(
  productPaths.update,
  verifyAdmin,
  verification.verifyAdmin,
  validateRequest(productUpdateRequestType),
  handleError(productController.updateProduct),
);

router.delete(
  productPaths.delete,
  verifyAdmin,
  verification.verifyAdmin,
  handleError(productController.deleteProduct),
);

router.post(
  productPaths.publicList,
  validateRequest(paginationType),
  handleError(productController.publicListProducts),
);

router.get(
  productPaths.publicDetails,
  handleError(productController.publicGetProduct)
);

module.exports = router;
