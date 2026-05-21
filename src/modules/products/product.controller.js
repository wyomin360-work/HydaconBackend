const { sendResponse } = require("../../utils/responseHandlers");
const productService = require("./product.service");

exports.listProducts = async (req, res) => {
  const paginationData = req?.body;
  const response = await productService.productList(paginationData);
  return sendResponse(res, response);
};

exports.getProduct = async (req, res) => {
  const productId = req.params?.productId;
  const response = await productService.getProduct(productId);
  return sendResponse(res, response);
};
exports.createProduct = async (req, res) => {
  const productData = req?.body;
  const response = await productService.createProduct(productData);
  return sendResponse(res, response);
};

exports.updateProduct = async (req, res) => {
  const productData = req?.body;
  const productId = req.params?.productId;
  const response = await productService.updateProduct(productData, productId);
  return sendResponse(res, response);
};

exports.deleteProduct = async (req, res) => {
  const productId = req.params?.productId;
  const response = await productService.deleteProduct(productId);
  return sendResponse(res, response);
};
