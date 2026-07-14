const express = require("express");
const productPaths = require("./product.paths");
const productController = require("./product.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const {
  productCreateRequestType,
  productUpdateRequestType,
} = require("../../validations/product.validations");
const { paginationType } = require("../../validations/global.validations");
const verification = require("../../middlewares/jwtVerification");

const router = express.Router();

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
  verification.verifyAdmin,
  validateRequest(productCreateRequestType),
  handleError(productController.createProduct),
);

router.patch(
  productPaths.update,
  verification.verifyAdmin,
  validateRequest(productUpdateRequestType),
  handleError(productController.updateProduct),
);

router.delete(
  productPaths.delete,
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
