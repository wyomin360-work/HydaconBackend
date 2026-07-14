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

exports.publicListProducts = async (req, res) => {
  const paginationData = req?.body || {};
  paginationData.filters = { ...paginationData.filters, active: true };
  const response = await productService.productList(paginationData);
  return sendResponse(res, response);
};

exports.publicGetProduct = async (req, res) => {
  const productId = req.params?.productId;
  const response = await productService.getProduct(productId);
  
  if (response?.data && !response.data.active) {
    return sendResponse(res, { data: null });
  }
  return sendResponse(res, response);
};
