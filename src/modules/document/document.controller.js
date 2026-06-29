const { sendResponse } = require("../../utils/responseHandlers");
const documentService = require("./document.service");

exports.addDocument = async (req, res) => {
  const userId = req.userId;
  const data = req.body;
  const response = await documentService.addDocument(userId, data);
  return sendResponse(res, response.data, 201);
};

exports.documentsList = async (req, res) => {
  const userId = req.userId;
  const filters = req.query;
  const userRole = req.role; // Attached via verifyAdminOrUser
  const response = await documentService.documentsList(userId, filters, userRole);
  return sendResponse(res, response.data, 200);
};

exports.editDocument = async (req, res) => {
  const { docId } = req.params;
  const data = req.body;
  const response = await documentService.editDocument(docId, data);
  return sendResponse(res, response.data, 200);
};

exports.documentDetails = async (req, res) => {
  const { docId } = req.params;
  const response = await documentService.documentDetails(docId);
  return sendResponse(res, response.data, 200);
};

exports.deleteDocuments = async (req, res) => {
  const { docId } = req.params;
  const response = await documentService.deleteDocuments(docId);
  return sendResponse(res, response.data, 200);
};
