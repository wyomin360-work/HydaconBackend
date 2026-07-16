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

const router = express.Router();

// Public Routes
router.post(
  productPaths.publicList,
  validateRequest(paginationType),
  handleError(productController.publicListProducts)
);

router.get(
  productPaths.publicDetails,
  handleError(productController.publicGetProduct)
);

// Admin Routes (Protected)
router.post(
  productPaths.list,
  verifyAdmin,
  validateRequest(paginationType),
  handleError(productController.listProducts)
);

router.get(
  productPaths.details,
  verifyAdmin,
  handleError(productController.getProduct)
);

router.post(
  productPaths.create,
  verifyAdmin,
  validateRequest(productCreateRequestType),
  handleError(productController.createProduct)
);

router.patch(
  productPaths.update,
  verifyAdmin,
  validateRequest(productUpdateRequestType),
  handleError(productController.updateProduct)
);

router.delete(
  productPaths.delete,
  verifyAdmin,
  handleError(productController.deleteProduct)
);

module.exports = router;
