const { Event, EVENT_STATUS } = require("../../schemas/event.schema");
const {
  EventRegistration,
  ATTENDANCE_STATUS,
} = require("../../schemas/event-registration.schema");
const User = require("../../schemas/user.schema");
const { attachId } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { sendFcmNotifications } = require("../../functions/fcm");

// ─── Status helper ────────────────────────────────────────────────────────────
// Throttle: only run sync once per minute to avoid blocking every list call
let lastSyncTime = 0;
const SYNC_INTERVAL_MS = 60 * 1000; // 1 minute

async function syncEventStatuses() {
  const now = Date.now();
  if (now - lastSyncTime < SYNC_INTERVAL_MS) return; // skip if ran recently
  lastSyncTime = now;
  const nowDate = new Date();
  await Event.updateMany(
    { date: { $gt: nowDate }, status: { $ne: EVENT_STATUS.UPCOMING } },
    { $set: { status: EVENT_STATUS.UPCOMING } },
  );
  await Event.updateMany(
    {
      date: { $lte: nowDate },
      endDate: { $gte: nowDate },
      status: { $ne: EVENT_STATUS.ONGOING },
    },
    { $set: { status: EVENT_STATUS.ONGOING } },
  );
  await Event.updateMany(
    { endDate: { $lt: nowDate }, status: { $ne: EVENT_STATUS.COMPLETED } },
    { $set: { status: EVENT_STATUS.COMPLETED } },
  );
}

// ─── Admin ────────────────────────────────────────────────────────────────────
async function adminCreateEvent(data, adminId) {
  const now = new Date();
  const date = data.date ? new Date(data.date) : now;
  const endDate = data.endDate ? new Date(data.endDate) : now;
  let status = EVENT_STATUS.UPCOMING;
  if (now > endDate) {
    status = EVENT_STATUS.COMPLETED;
  } else if (now >= date && now <= endDate) {
    status = EVENT_STATUS.ONGOING;
  }

  const event = await Event.create({ ...data, status, createdBy: adminId });
  return { message: "Event created", data: { eventId: event._id } };
}

async function adminUpdateEvent(eventId, data) {
  if (data.date || data.endDate) {
    const event = await Event.findById(eventId);
    if (!event) sendFailResponse("Event not found", 404);
    const date = data.date ? new Date(data.date) : event.date;
    const endDate = data.endDate ? new Date(data.endDate) : event.endDate;
    const now = new Date();
    if (now < date) {
      data.status = EVENT_STATUS.UPCOMING;
    } else if (now > endDate) {
      data.status = EVENT_STATUS.COMPLETED;
    } else {
      data.status = EVENT_STATUS.ONGOING;
    }
  }

  const event = await Event.findByIdAndUpdate(eventId, data, { new: true });
  if (!event) sendFailResponse("Event not found", 404);
  return { message: "Event updated", data: { updated: true } };
}

async function adminDeleteEvent(eventId) {
  const event = await Event.findById(eventId);
  if (!event) sendFailResponse("Event not found", 404);

  // Mark all attendee passes as event cancelled if the event is deleted before it starts
  if (new Date(event.date) > new Date()) {
    await EventRegistration.updateMany(
      { eventId },
      { $set: { attendanceStatus: ATTENDANCE_STATUS.EVENT_CANCELLED } }
    );
  }

  await Event.findByIdAndDelete(eventId);
  return { message: "Event deleted", data: { deleted: true } };
}

async function adminListEvents(query = {}) {
  // Fire sync in background — never block the response
  syncEventStatuses().catch((err) =>
    console.error("syncEventStatuses error:", err),
  );

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
      page,
      limit,
      total,
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
  return {
    data: {
      ...event,
      registrationCount: registrations.length,
      registrations: attachId(registrations),
    },
  };
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
  return {
    message: "User invited",
    data: { registrationId: reg.registrationId },
  };
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
  return {
    message: "Checked in",
    data: { attendanceStatus: reg.attendanceStatus },
  };
}

// ─── User ─────────────────────────────────────────────────────────────────────
async function userListEvents(query = {}, userId = null) {
  // Fire sync in background — never block the response
  syncEventStatuses().catch((err) =>
    console.error("syncEventStatuses error:", err),
  );

  const { tab = "upcoming", lat, lng, page = 1, limit = 10 } = query;
  const pageNumber = Math.max(1, parseInt(page) || 1);
  const limitNumber = Math.max(1, parseInt(limit) || 10);
  const skip = (pageNumber - 1) * limitNumber;

  // Get user's registered event IDs to exclude from main feeds if needed
  let registeredEventIds = [];
  if (userId) {
    const userRegistrations = await EventRegistration.find({ userId })
      .select("eventId")
      .lean();
    registeredEventIds = userRegistrations.map((item) => item.eventId);
  }

  // ── FEATURED SECTION ──
  if (tab === "featured") {
    const featuredEvents = await Event.find({
      active: true,
      status: { $in: [EVENT_STATUS.UPCOMING, EVENT_STATUS.ONGOING] },
    })
      .sort({ isInvitationOnly: -1, date: 1 })
      .limit(5)
      .lean();

    return {
      data: {
        events: attachId(featuredEvents),
      },
    };
  }

  // ── NEARBY SECTION ──
  if (tab === "nearby") {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const hasCoordinates = !isNaN(latitude) && !isNaN(longitude);

    if (!hasCoordinates) {
      const fallbackFilter = { active: true, status: EVENT_STATUS.UPCOMING };
      if (registeredEventIds.length > 0) {
        fallbackFilter._id = { $nin: registeredEventIds };
      }
      const [events, total] = await Promise.all([
        Event.find(fallbackFilter).sort({ date: 1 }).skip(skip).limit(limitNumber).lean(),
        Event.countDocuments(fallbackFilter),
      ]);
      const totalPages = Math.ceil(total / limitNumber);
      return {
        data: {
          events: attachId(events),
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages,
          hasMore: pageNumber < totalPages,
          hasLocationData: false,
        },
      };
    }

    try {
      const geoFilter = {
        active: true,
        status: { $in: [EVENT_STATUS.UPCOMING, EVENT_STATUS.ONGOING] },
      };
      if (registeredEventIds.length > 0) {
        geoFilter._id = { $nin: registeredEventIds };
      }

      const geoPipeline = [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [longitude, latitude] },
            distanceField: "distanceMeters",
            maxDistance: 100000, // 100 km
            spherical: true,
            query: geoFilter,
          },
        },
        {
          $facet: {
            paginatedResults: [{ $skip: skip }, { $limit: limitNumber }],
            totalCount: [{ $count: "count" }],
          },
        },
      ];

      const [results] = await Event.aggregate(geoPipeline);
      const rawEvents = results?.paginatedResults || [];
      const total = results?.totalCount?.[0]?.count || 0;

      const events = rawEvents.map((event) => ({
        ...event,
        isNearby: true,
        distanceMeters: Math.round(event.distanceMeters),
      }));

      const totalPages = Math.ceil(total / limitNumber);
      return {
        data: {
          events: attachId(events),
          page: pageNumber,
          limit: limitNumber,
          total,
          totalPages,
          hasMore: pageNumber < totalPages,
          hasLocationData: true,
        },
      };
    } catch (geoError) {
      console.error("Geo query failed:", geoError.message);
      return {
        data: {
          events: [],
          page: pageNumber,
          limit: limitNumber,
          total: 0,
          totalPages: 0,
          hasMore: false,
          hasLocationData: false,
        },
      };
    }
  }

  // ── UPCOMING SECTION ──
  if (tab === "upcoming") {
    const upcomingFilter = {
      active: true,
      status: EVENT_STATUS.UPCOMING,
    };
    if (registeredEventIds.length > 0) {
      upcomingFilter._id = { $nin: registeredEventIds };
    }

    const [events, total] = await Promise.all([
      Event.find(upcomingFilter).sort({ date: 1 }).skip(skip).limit(limitNumber).lean(),
      Event.countDocuments(upcomingFilter),
    ]);

    const totalPages = Math.ceil(total / limitNumber);
    return {
      data: {
        events: attachId(events),
        page: pageNumber,
        limit: limitNumber,
        total,
        totalPages,
        hasMore: pageNumber < totalPages,
      },
    };
  }

  // ── DEFAULT / UNFILTERED OVERVIEW (Legacy compatibility) ──
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const hasCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  let myEvents = [];
  if (userId) {
    const myRegs = await EventRegistration.find({ userId })
      .populate({ path: "event" })
      .sort({ createdAt: -1 })
      .limit(4)
      .lean();
    const validRegs = myRegs.filter((r) => r.event);
    myEvents = validRegs.map((r) => ({ ...r.event, registration: r }));
  }

  let nearby = [];
  if (hasCoords) {
    try {
      const geoNearPipeline = [
        {
          $geoNear: {
            near: { type: "Point", coordinates: [parsedLng, parsedLat] },
            distanceField: "distanceMeters",
            maxDistance: 100000,
            spherical: true,
            query: {
              active: true,
              status: { $in: [EVENT_STATUS.UPCOMING, EVENT_STATUS.ONGOING] },
              ...(registeredEventIds.length > 0
                ? { _id: { $nin: registeredEventIds } }
                : {}),
            },
          },
        },
        { $limit: 4 },
      ];
      const nearbyWithDistance = await Event.aggregate(geoNearPipeline);
      nearby = nearbyWithDistance.map((ev) => ({
        ...ev,
        isNearby: true,
        distanceMeters: Math.round(ev.distanceMeters),
      }));
    } catch (geoErr) {}
  }

  const upcomingFilter = { active: true, status: EVENT_STATUS.UPCOMING };
  if (registeredEventIds.length > 0) upcomingFilter._id = { $nin: registeredEventIds };
  const upcoming = await Event.find(upcomingFilter).sort({ date: 1 }).limit(4).lean();

  const activeFilter = {
    active: true,
    status: { $in: [EVENT_STATUS.ONGOING, EVENT_STATUS.COMPLETED] },
  };
  if (registeredEventIds.length > 0) activeFilter._id = { $nin: registeredEventIds };
  const active = await Event.find(activeFilter).sort({ date: 1 }).limit(4).lean();

  if (!hasCoords) nearby = upcoming;

  return {
    data: {
      active: attachId(active),
      upcoming: attachId(upcoming),
      nearby: attachId(nearby),
      myEvents: attachId(myEvents),
      passes: attachId(myEvents),
      hasLocationData: hasCoords,
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
    userRegistration = await EventRegistration.findOne({
      eventId,
      userId,
    }).lean();
    if (
      event.isInvitationOnly &&
      (!userRegistration || !userRegistration.isInvited)
    ) {
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
  if (
    event.registrationDeadline &&
    new Date(event.registrationDeadline) < new Date()
  ) {
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
    const registrationCount = await EventRegistration.countDocuments({
      eventId,
    });
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

async function userMyEvents(userId, query = {}) {
  const pageNumber = Math.max(1, parseInt(query?.page) || 1);
  const limitNumber = Math.max(1, parseInt(query?.limit) || 10);
  const skip = (pageNumber - 1) * limitNumber;

  const [regs, total] = await Promise.all([
    EventRegistration.find({ userId })
      .populate("event")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber)
      .lean(),
    EventRegistration.countDocuments({ userId }),
  ]);

  const validRegs = regs.filter((r) => r.event);
  const events = validRegs.map((r) => {
    const eventData = r.event;
    const eventId = eventData._id ? eventData._id.toString() : r._id.toString();
    return {
      ...eventData,
      _id: eventId,
      id: eventId,
      registration: {
        registrationId: r.registrationId,
        attendanceStatus: r.attendanceStatus,
        isInvited: r.isInvited,
        registeredAt: r.createdAt,
      },
    };
  });

  const totalPages = Math.ceil(total / limitNumber);
  return {
    data: {
      events,
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages,
      hasMore: pageNumber < totalPages,
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
