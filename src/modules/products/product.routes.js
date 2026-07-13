const express = require("express");
const productPaths = require("./product.paths");
const productController = require("./product.controller");
const { handleError } = require("../../utils/heplers");
const validateRequest = require("../../middlewares/validator");
const { verifyAdmin } = require("../../middlewares/jwtVerification");
const {
  productCreateRequestType,
  productUpdateRequestType,
  productRecommendRequestType,
} = require("../../validations/product.validations");
const { paginationType } = require("../../validations/global.validations");

const router = express.Router();

router.post(
  productPaths.list,
  validateRequest(paginationType),
  handleError(productController.listProducts),
);

router.get(productPaths.details, handleError(productController.getProduct));

router.post(
  productPaths.create,
  verifyAdmin,
  validateRequest(productCreateRequestType),
  handleError(productController.createProduct),
);

router.patch(
  productPaths.update,
  verifyAdmin,
  validateRequest(productUpdateRequestType),
  handleError(productController.updateProduct),
);

router.delete(
  productPaths.delete,
  verifyAdmin,
  handleError(productController.deleteProduct),
);

router.post(
  productPaths.recommend,
  validateRequest(productRecommendRequestType),
  handleError(productController.recommendProducts),
);

module.exports = router;
