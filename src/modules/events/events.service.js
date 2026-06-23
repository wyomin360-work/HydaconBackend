const { Event, EVENT_STATUS } = require("../../schemas/event.schema");
const { EventRegistration, ATTENDANCE_STATUS } = require("../../schemas/event-registration.schema");
const User = require("../../schemas/user.schema");
const { attachId } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { sendFcmNotifications } = require("../../functions/fcm");

// ─── Status helper ────────────────────────────────────────────────────────────
async function syncEventStatuses() {
  const now = new Date();
  await Event.updateMany(
    { date: { $lte: now }, endDate: { $gte: now }, status: EVENT_STATUS.UPCOMING },
    { $set: { status: EVENT_STATUS.ONGOING } },
  );
  await Event.updateMany(
    { endDate: { $lt: now }, status: { $ne: EVENT_STATUS.COMPLETED } },
    { $set: { status: EVENT_STATUS.COMPLETED } },
  );
}

// ─── Admin ────────────────────────────────────────────────────────────────────
async function adminCreateEvent(data, adminId) {
  const event = await Event.create({ ...data, createdBy: adminId });
  return { message: "Event created", data: { eventId: event._id } };
}

async function adminUpdateEvent(eventId, data) {
  const event = await Event.findByIdAndUpdate(eventId, data, { new: true });
  if (!event) sendFailResponse("Event not found", 404);
  return { message: "Event updated", data: { updated: true } };
}

async function adminDeleteEvent(eventId) {
  await Event.findByIdAndDelete(eventId);
  return { message: "Event deleted", data: { deleted: true } };
}

async function adminListEvents(query = {}) {
  await syncEventStatuses();
  const { page = 1, limit = 20, status } = query;
  const skip = (page - 1) * limit;
  const filter = {};
  if (status) filter.status = status;
  const [events, total] = await Promise.all([
    Event.find(filter).sort({ date: 1 }).skip(skip).limit(limit).lean(),
    Event.countDocuments(filter),
  ]);
  return {
    data: {
      events: attachId(events),
      page, limit, total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function adminGetEventDetails(eventId) {
  const event = await Event.findById(eventId).lean();
  if (!event) sendFailResponse("Event not found", 404);
  const registrations = await EventRegistration.find({ eventId })
    .populate({ path: "userId", select: "name phoneNumber email profileImage" })
    .sort({ createdAt: -1 })
    .lean();
  return { data: { ...event, registrationCount: registrations.length, registrations: attachId(registrations) } };
}

/**
 * Admin marks a user as invited to an invitation-only event.
 */
async function adminInviteUser(eventId, userId) {
  const event = await Event.findById(eventId);
  if (!event) sendFailResponse("Event not found", 404);

  const reg = await EventRegistration.findOneAndUpdate(
    { eventId, userId },
    { $set: { isInvited: true } },
    { upsert: true, new: true },
  );

  // Push notification to user
  const user = await User.findById(userId);
  if (user?.fcmTokens?.length && user?.enableNotification) {
    await sendFcmNotifications(
      user.fcmTokens,
      `You're invited! 🎉`,
      `You have received an invitation to ${event.title}`,
      { type: "EVENT_INVITATION", eventId: eventId.toString() },
    ).catch(() => {});
  }
  return { message: "User invited", data: { registrationId: reg.registrationId } };
}

/**
 * Admin scans attendee QR → marks check-in.
 */
async function adminCheckIn(registrationId) {
  const reg = await EventRegistration.findOne({ registrationId });
  if (!reg) sendFailResponse("Registration not found", 404);
  reg.attendanceStatus = ATTENDANCE_STATUS.CHECKED_IN;
  reg.checkedInAt = new Date();
  await reg.save();
  return { message: "Checked in", data: { attendanceStatus: reg.attendanceStatus } };
}

// ─── User ─────────────────────────────────────────────────────────────────────
async function userListEvents(query = {}, userId = null) {
  await syncEventStatuses();
  const { page = 1, limit = 20, lat, lng } = query;
  const skip = (page - 1) * limit;
  const now = new Date();

  // Upcoming events
  const [upcoming, upcomingTotal] = await Promise.all([
    Event.find({ active: true, status: EVENT_STATUS.UPCOMING }).sort({ date: 1 }).limit(10).lean(),
    Event.countDocuments({ active: true, status: EVENT_STATUS.UPCOMING }),
  ]);

  // Nearby events (requires lat/lng)
  let nearby = [];
  if (lat && lng) {
    nearby = await Event.find({
      active: true,
      status: { $in: [EVENT_STATUS.UPCOMING, EVENT_STATUS.ONGOING] },
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: 50000, // 50 km
        },
      },
    }).limit(10).lean();
  }

  // My events
  let myEvents = [];
  if (userId) {
    const myRegs = await EventRegistration.find({ userId })
      .populate({ path: "event" })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    myEvents = myRegs.map((r) => ({ ...r.event, registration: r }));
  }

  return {
    data: {
      upcoming: attachId(upcoming),
      nearby: attachId(nearby),
      myEvents,
    },
  };
}

async function userGetEventDetails(eventId, userId) {
  const event = await Event.findById(eventId).lean();
  if (!event) sendFailResponse("Event not found", 404);
  const registrationCount = await EventRegistration.countDocuments({ eventId });

  let userRegistration = null;
  let isEligible = true;
  if (userId) {
    userRegistration = await EventRegistration.findOne({ eventId, userId }).lean();
    if (event.isInvitationOnly && (!userRegistration || !userRegistration.isInvited)) {
      isEligible = false;
    }
  }

  return {
    data: {
      event,
      registrationCount,
      userRegistration,
      isEligible,
    },
  };
}

async function userRegisterForEvent(eventId, userId) {
  const event = await Event.findById(eventId);
  if (!event) sendFailResponse("Event not found", 404);
  if (!event.active) sendFailResponse("Event is not active", 400);
  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    sendFailResponse("Registration deadline has passed", 400);
  }

  // Invitation-only check
  if (event.isInvitationOnly) {
    const existing = await EventRegistration.findOne({ eventId, userId });
    if (!existing?.isInvited) {
      sendFailResponse("You are not eligible for this event", 403);
    }
  }

  // Capacity check
  if (event.capacity) {
    const registrationCount = await EventRegistration.countDocuments({ eventId });
    if (registrationCount >= event.capacity) {
      sendFailResponse("Event is at full capacity", 400);
    }
  }

  const reg = await EventRegistration.findOneAndUpdate(
    { eventId, userId },
    { $set: { attendanceStatus: ATTENDANCE_STATUS.REGISTERED } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // Push notification
  const user = await User.findById(userId);
  if (user?.fcmTokens?.length && user?.enableNotification) {
    await sendFcmNotifications(
      user.fcmTokens,
      "Registration Confirmed! 🎟️",
      `You're registered for ${event.title}`,
      { type: "EVENT_REGISTRATION_CONFIRMED", eventId: eventId.toString() },
    ).catch(() => {});
  }

  return {
    message: "Registered successfully",
    data: {
      registrationId: reg.registrationId,
      attendanceStatus: reg.attendanceStatus,
      eventTitle: event.title,
      eventDate: event.date,
      venue: event.venue,
    },
  };
}

async function userGetEventPass(registrationId, userId) {
  const reg = await EventRegistration.findOne({ registrationId })
    .populate("event")
    .lean();
  if (!reg) sendFailResponse("Registration not found", 404);
  if (reg.userId.toString() !== userId.toString()) {
    sendFailResponse("Unauthorized", 403);
  }
  return {
    data: {
      registrationId: reg.registrationId,
      attendanceStatus: reg.attendanceStatus,
      event: reg.event,
      isInvited: reg.isInvited,
    },
  };
}

async function userMyEvents(userId) {
  const regs = await EventRegistration.find({ userId })
    .populate("event")
    .sort({ createdAt: -1 })
    .lean();
  return {
    data: {
      events: regs.map((r) => ({
        registrationId: r.registrationId,
        attendanceStatus: r.attendanceStatus,
        isInvited: r.isInvited,
        registeredAt: r.createdAt,
        event: r.event,
      })),
    },
  };
}

module.exports = {
  adminCreateEvent,
  adminUpdateEvent,
  adminDeleteEvent,
  adminListEvents,
  adminGetEventDetails,
  adminInviteUser,
  adminCheckIn,
  userListEvents,
  userGetEventDetails,
  userRegisterForEvent,
  userGetEventPass,
  userMyEvents,
};
