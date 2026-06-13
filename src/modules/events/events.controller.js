const { sendResponse } = require("../../utils/responseHandlers");
const eventsService = require("./events.service");

// Admin Controllers
exports.createEvent = async (req, res) => {
  const data = req.body;
  const response = await eventsService.createEvent(data);
  return sendResponse(res, response);
};

exports.updateEvent = async (req, res) => {
  const data = req.body;
  const eventId = req.params.id;
  const response = await eventsService.updateEvent(eventId, data);
  return sendResponse(res, response);
};

exports.listAdminEvents = async (req, res) => {
  const data = req.body || req.query;
  const response = await eventsService.listAdminEvents(data);
  return sendResponse(res, response);
};

exports.getEventById = async (req, res) => {
  const eventId = req.params.id;
  const response = await eventsService.getEventById(eventId);
  return sendResponse(res, response);
};

exports.deleteEvent = async (req, res) => {
  const eventId = req.params.id;
  const response = await eventsService.deleteEvent(eventId);
  return sendResponse(res, response);
};

exports.inviteUser = async (req, res) => {
  const eventId = req.params.id;
  const { userId } = req.body;
  const response = await eventsService.inviteUser(eventId, userId);
  return sendResponse(res, response);
};

exports.getEventRegistrations = async (req, res) => {
  const eventId = req.params.id;
  const data = req.body || req.query;
  const response = await eventsService.getEventRegistrations(eventId, data);
  return sendResponse(res, response);
};

exports.checkInUser = async (req, res) => {
  const { eventId, qrCodeData } = req.body;
  const response = await eventsService.checkInUser(eventId, qrCodeData);
  return sendResponse(res, response);
};

exports.getEventReport = async (req, res) => {
  const eventId = req.params.id;
  const response = await eventsService.getEventReport(eventId);
  return sendResponse(res, response);
};

// User Controllers

exports.listUserEvents = async (req, res) => {
  const userId = req.userId;
  const data = req.body || req.query;
  const response = await eventsService.listUserEvents(userId, data);
  return sendResponse(res, response);
};

exports.getMyRegistrations = async (req, res) => {
  const userId = req.userId;
  const data = req.body || req.query;
  const response = await eventsService.getMyRegistrations(userId, data);
  return sendResponse(res, response);
};

exports.markInterest = async (req, res) => {
  const eventId = req.params.id;
  const userId = req.userId;
  const response = await eventsService.markInterest(eventId, userId);
  return sendResponse(res, response);
};

exports.registerForEvent = async (req, res) => {
  const eventId = req.params.id;
  const userId = req.userId;
  const response = await eventsService.registerForEvent(eventId, userId);
  return sendResponse(res, response);
};

exports.cancelRegistration = async (req, res) => {
  const eventId = req.params.id;
  const userId = req.userId;
  const response = await eventsService.cancelRegistration(eventId, userId);
  return sendResponse(res, response);
};
