const eventsService = require("./events.service");
const { sendResponse } = require("../../utils/responseHandlers");

// Admin
exports.adminCreateEvent = async (req, res) => {
  const response = await eventsService.adminCreateEvent(
    req.body,
    req.admin?._id,
  );
  return sendResponse(res, response);
};
exports.adminUpdateEvent = async (req, res) => {
  const response = await eventsService.adminUpdateEvent(
    req.params.eventId,
    req.body,
  );
  return sendResponse(res, response);
};
exports.adminDeleteEvent = async (req, res) => {
  const response = await eventsService.adminDeleteEvent(req.params.eventId);
  return sendResponse(res, response);
};
exports.adminListEvents = async (req, res) => {
  const response = await eventsService.adminListEvents(req.query);
  return sendResponse(res, response);
};
exports.adminGetEventSummary = async (req, res) => {
  const response = await eventsService.adminGetEventSummary();
  return sendResponse(res, response);
};
exports.adminGetEventDetails = async (req, res) => {
  const response = await eventsService.adminGetEventDetails(req.params.eventId);
  return sendResponse(res, response);
};
exports.adminInviteUser = async (req, res) => {
  const response = await eventsService.adminInviteUser(
    req.params.eventId,
    req.body.userId,
  );
  return sendResponse(res, response);
};
exports.adminCheckIn = async (req, res) => {
  const response = await eventsService.adminCheckIn(req.params.registrationId);
  return sendResponse(res, response);
};

// User
exports.userListEvents = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await eventsService.userListEvents(req.query, userId);
  return sendResponse(res, response);
};
exports.userGetEventDetails = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await eventsService.userGetEventDetails(
    req.params.eventId,
    userId,
  );
  return sendResponse(res, response);
};
exports.userRegisterForEvent = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await eventsService.userRegisterForEvent(
    req.params.eventId,
    userId,
  );
  return sendResponse(res, response);
};
exports.userGetEventPass = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await eventsService.userGetEventPass(
    req.params.registrationId,
    userId,
  );
  return sendResponse(res, response);
};
exports.userMyEvents = async (req, res) => {
  const userId = req.user?._id || req.user?.id;
  const response = await eventsService.userMyEvents(userId, req.query);
  return sendResponse(res, response);
};
