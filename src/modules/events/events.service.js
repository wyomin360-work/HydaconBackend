const { Event } = require("../../schemas/event.schema");
const {
  EventRegistration,
} = require("../../schemas/event-registration.schema");
const User = require("../../schemas/user.schema");
const { attachId, formatNotification } = require("../../utils/heplers");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const {
  EVENT_STATUS,
  ATTENDANCE_STATUS,
  EVENT_TABS,
  GEO_TYPES,
  EVENT_FCM_TYPES,
  EVENT_MESSAGES,
  EVENT_ERRORS,
  EVENT_CONFIG,
} = require("../../constants/events");

// ─── Status Helper ────────────────────────────────────────────────────────────
// Throttle status sync to avoid blocking API calls
let lastSyncTime = 0;

/**
 * Periodically updates event statuses (UPCOMING, ONGOING, COMPLETED) based on current server time.
 */
async function syncEventStatuses() {
  const now = Date.now();
  if (now - lastSyncTime < EVENT_CONFIG.SYNC_INTERVAL_MS) return;
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

// ─── Admin Operations ─────────────────────────────────────────────────────────

/**
 * Creates a new event.
 */
async function adminCreateEvent(data, adminId) {
  const now = new Date();
  if (data.date && isNaN(new Date(data.date).getTime())) {
    sendFailResponse(EVENT_ERRORS.INVALID_START_DATE, 400);
  }
  if (data.endDate && isNaN(new Date(data.endDate).getTime())) {
    sendFailResponse(EVENT_ERRORS.INVALID_END_DATE, 400);
  }
  const date = data.date ? new Date(data.date) : now;
  const endDate = data.endDate ? new Date(data.endDate) : date;

  if (endDate < date) {
    sendFailResponse(EVENT_ERRORS.END_BEFORE_START, 400);
  }

  let status = EVENT_STATUS.UPCOMING;
  if (now > endDate) {
    status = EVENT_STATUS.COMPLETED;
  } else if (now >= date && now <= endDate) {
    status = EVENT_STATUS.ONGOING;
  }

  const event = await Event.create({
    ...data,
    date,
    endDate,
    status,
    createdBy: adminId,
  });
  return { message: EVENT_MESSAGES.CREATED, data: { eventId: event._id } };
}

/**
 * Updates existing event details.
 */
async function adminUpdateEvent(eventId, data) {
  const event = await Event.findById(eventId);
  if (!event) sendFailResponse(EVENT_ERRORS.EVENT_NOT_FOUND, 404);

  if (data.date || data.endDate) {
    if (data.date && isNaN(new Date(data.date).getTime())) {
      sendFailResponse(EVENT_ERRORS.INVALID_START_DATE, 400);
    }
    if (data.endDate && isNaN(new Date(data.endDate).getTime())) {
      sendFailResponse(EVENT_ERRORS.INVALID_END_DATE, 400);
    }
    const date = data.date ? new Date(data.date) : event.date;
    const endDate = data.endDate ? new Date(data.endDate) : event.endDate;

    if (endDate < date) {
      sendFailResponse(EVENT_ERRORS.END_BEFORE_START, 400);
    }

    const now = new Date();
    if (now < date) {
      data.status = EVENT_STATUS.UPCOMING;
    } else if (now > endDate) {
      data.status = EVENT_STATUS.COMPLETED;
    } else {
      data.status = EVENT_STATUS.ONGOING;
    }
  }

  const updatedEvent = await Event.findByIdAndUpdate(eventId, data, {
    new: true,
  });
  if (!updatedEvent) sendFailResponse(EVENT_ERRORS.EVENT_NOT_FOUND, 404);
  return { message: EVENT_MESSAGES.UPDATED, data: { updated: true } };
}

/**
 * Deletes an event.
 */
async function adminDeleteEvent(eventId) {
  const event = await Event.findById(eventId);
  if (!event) sendFailResponse(EVENT_ERRORS.EVENT_NOT_FOUND, 404);

  if (new Date(event.date) > new Date()) {
    await EventRegistration.updateMany(
      { eventId },
      { $set: { attendanceStatus: ATTENDANCE_STATUS.EVENT_CANCELLED } },
    );
  }

  await Event.findByIdAndDelete(eventId);
  return { message: EVENT_MESSAGES.DELETED, data: { deleted: true } };
}

/**
 * Admin event listing with status, type, search, and date-range filters.
 *
 * @param {Object} query
 * @param {string} [query.status] - Filter by event status ('upcoming', 'ongoing', 'completed')
 * @param {string} [query.type] - Filter by event type ('webinar', 'workshop', 'conference', 'meetup', 'other')
 * @param {string} [query.search] - Search keyword across title, description, venue, city, state, country
 * @param {string} [query.startDate] - Start date threshold ($gte)
 * @param {string} [query.endDate] - End date threshold ($lte)
 * @param {number} [query.page=1]
 * @param {number} [query.limit=10]
 */
async function adminListEvents(query = {}) {
  syncEventStatuses().catch((err) =>
    console.error("syncEventStatuses error:", err),
  );

  const { status, type, search, startDate, endDate } = query;
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.max(
    1,
    parseInt(query.limit) || EVENT_CONFIG.DEFAULT_ADMIN_LIMIT,
  );
  const skip = (page - 1) * limit;

  const filter = {};

  if (status && status !== "all") {
    filter.status = status;
  }

  if (type && type !== "all") {
    filter.type = type;
  }

  if (search && typeof search === "string" && search.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { venue: searchRegex },
      { city: searchRegex },
      { state: searchRegex },
      { country: searchRegex },
    ];
  }

  if (startDate || endDate) {
    filter.date = {};
    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        filter.date.$gte = start;
      }
    }
    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }
    if (Object.keys(filter.date).length === 0) {
      delete filter.date;
    }
  }

  const [events, total] = await Promise.all([
    Event.find(filter).sort({ date: 1 }).skip(skip).limit(limit).lean(),
    Event.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    data: {
      events: attachId(events),
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

/**
 * Admin retrieves full event details with registration list.
 */
async function adminGetEventDetails(eventId) {
  const event = await Event.findById(eventId).lean();
  if (!event) sendFailResponse(EVENT_ERRORS.EVENT_NOT_FOUND, 404);
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
 * Admin invites a user to an invitation-only event.
 */
async function adminInviteUser(eventId, userId) {
  const event = await Event.findById(eventId);
  if (!event) sendFailResponse(EVENT_ERRORS.EVENT_NOT_FOUND, 404);

  const user = await User.findById(userId);
  if (!user) sendFailResponse(EVENT_ERRORS.USER_NOT_FOUND, 404);

  const reg = await EventRegistration.findOneAndUpdate(
    { eventId, userId },
    { $set: { isInvited: true } },
    { upsert: true, new: true },
  );

  if (user?.fcmTokens?.length && user?.enableNotification) {
    await sendFcmNotifications(
      user.fcmTokens,
      APP_NOTIFICATIONS.events.invitation.title,
      formatNotification(APP_NOTIFICATIONS.events.invitation.body, {
        eventTitle: event.title,
      }),
      {
        type: EVENT_FCM_TYPES.EVENT_INVITATION,
        eventId: eventId.toString(),
      },
    ).catch(() => {});
  }
  return {
    message: EVENT_MESSAGES.USER_INVITED,
    data: { registrationId: reg.registrationId },
  };
}

/**
 * Admin checks in attendee via QR code scanning.
 */
async function adminCheckIn(registrationId) {
  const reg = await EventRegistration.findOne({ registrationId });
  if (!reg) sendFailResponse(EVENT_ERRORS.REGISTRATION_NOT_FOUND, 404);

  if (
    reg.attendanceStatus === ATTENDANCE_STATUS.CANCELLED ||
    reg.attendanceStatus === ATTENDANCE_STATUS.EVENT_CANCELLED
  ) {
    sendFailResponse(EVENT_ERRORS.CANNOT_CHECKIN_CANCELLED, 400);
  }

  reg.attendanceStatus = ATTENDANCE_STATUS.CHECKED_IN;
  reg.checkedInAt = new Date();
  await reg.save();
  return {
    message: EVENT_MESSAGES.CHECKED_IN,
    data: { attendanceStatus: reg.attendanceStatus },
  };
}

// ─── User Operations ──────────────────────────────────────────────────────────

/**
 * Fetches user event feeds across tabs: featured, nearby, upcoming, or default overview.
 */
async function userListEvents(query = {}, userId = null) {
  syncEventStatuses().catch((err) =>
    console.error("syncEventStatuses error:", err),
  );

  const {
    tab = EVENT_TABS.UPCOMING,
    lat,
    lng,
    page = 1,
    limit = EVENT_CONFIG.DEFAULT_USER_LIMIT,
  } = query;
  const pageNumber = Math.max(1, parseInt(page) || 1);
  const limitNumber = Math.max(
    1,
    parseInt(limit) || EVENT_CONFIG.DEFAULT_USER_LIMIT,
  );
  const skip = (pageNumber - 1) * limitNumber;

  let registeredEventIds = [];
  if (userId) {
    const userRegistrations = await EventRegistration.find({ userId })
      .select("eventId")
      .lean();
    registeredEventIds = userRegistrations.map((item) => item.eventId);
  }

  // ── FEATURED SECTION ──
  if (tab === EVENT_TABS.FEATURED) {
    const featuredEvents = await Event.find({
      active: true,
      status: { $in: [EVENT_STATUS.UPCOMING, EVENT_STATUS.ONGOING] },
    })
      .sort({ isInvitationOnly: -1, date: 1 })
      .limit(EVENT_CONFIG.FEATURED_LIMIT)
      .lean();

    return {
      data: {
        events: attachId(featuredEvents),
      },
    };
  }

  // ── NEARBY SECTION ──
  if (tab === EVENT_TABS.NEARBY) {
    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const hasCoordinates = !isNaN(latitude) && !isNaN(longitude);

    if (!hasCoordinates) {
      const fallbackFilter = { active: true, status: EVENT_STATUS.UPCOMING };
      if (registeredEventIds.length > 0) {
        fallbackFilter._id = { $nin: registeredEventIds };
      }
      const [events, total] = await Promise.all([
        Event.find(fallbackFilter)
          .sort({ date: 1 })
          .skip(skip)
          .limit(limitNumber)
          .lean(),
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
            near: { type: GEO_TYPES.POINT, coordinates: [longitude, latitude] },
            distanceField: "distanceMeters",
            maxDistance: EVENT_CONFIG.MAX_GEO_DISTANCE_METERS,
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
      const fallbackFilter = { active: true, status: EVENT_STATUS.UPCOMING };
      if (registeredEventIds.length > 0) {
        fallbackFilter._id = { $nin: registeredEventIds };
      }
      const [events, total] = await Promise.all([
        Event.find(fallbackFilter)
          .sort({ date: 1 })
          .skip(skip)
          .limit(limitNumber)
          .lean(),
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
  }

  // ── UPCOMING SECTION ──
  if (tab === EVENT_TABS.UPCOMING) {
    const upcomingFilter = {
      active: true,
      status: EVENT_STATUS.UPCOMING,
    };
    if (registeredEventIds.length > 0) {
      upcomingFilter._id = { $nin: registeredEventIds };
    }

    const [events, total] = await Promise.all([
      Event.find(upcomingFilter)
        .sort({ date: 1 })
        .skip(skip)
        .limit(limitNumber)
        .lean(),
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

  // ── DEFAULT / UNFILTERED OVERVIEW ──
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  const hasCoords = !isNaN(parsedLat) && !isNaN(parsedLng);

  let myEvents = [];
  if (userId) {
    const myRegs = await EventRegistration.find({ userId })
      .populate({ path: "event" })
      .sort({ createdAt: -1 })
      .limit(EVENT_CONFIG.OVERVIEW_LIMIT)
      .lean();
    const validRegs = myRegs.filter((r) => r.event);
    myEvents = validRegs.map((r) => {
      const eventData = r.event;
      const eventId = eventData._id
        ? eventData._id.toString()
        : r._id.toString();
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
  }

  let nearby = [];
  if (hasCoords) {
    try {
      const geoNearPipeline = [
        {
          $geoNear: {
            near: {
              type: GEO_TYPES.POINT,
              coordinates: [parsedLng, parsedLat],
            },
            distanceField: "distanceMeters",
            maxDistance: EVENT_CONFIG.MAX_GEO_DISTANCE_METERS,
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
        { $limit: EVENT_CONFIG.OVERVIEW_LIMIT },
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
  if (registeredEventIds.length > 0)
    upcomingFilter._id = { $nin: registeredEventIds };
  const upcoming = await Event.find(upcomingFilter)
    .sort({ date: 1 })
    .limit(EVENT_CONFIG.OVERVIEW_LIMIT)
    .lean();

  const activeFilter = {
    active: true,
    status: { $in: [EVENT_STATUS.ONGOING, EVENT_STATUS.COMPLETED] },
  };
  if (registeredEventIds.length > 0)
    activeFilter._id = { $nin: registeredEventIds };
  const active = await Event.find(activeFilter)
    .sort({ date: 1 })
    .limit(EVENT_CONFIG.OVERVIEW_LIMIT)
    .lean();

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

/**
 * Fetches event details for user view.
 */
async function userGetEventDetails(eventId, userId) {
  const event = await Event.findById(eventId).lean();
  if (!event) sendFailResponse(EVENT_ERRORS.EVENT_NOT_FOUND, 404);
  const registrationCount = await EventRegistration.countDocuments({
    eventId,
  });

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

/**
 * Registers user for an event.
 */
async function userRegisterForEvent(eventId, userId) {
  if (!userId) sendFailResponse(EVENT_ERRORS.USER_ID_REQUIRED, 400);
  const event = await Event.findById(eventId);
  if (!event) sendFailResponse(EVENT_ERRORS.EVENT_NOT_FOUND, 404);
  if (!event.active) sendFailResponse(EVENT_ERRORS.EVENT_NOT_ACTIVE, 400);
  const now = new Date();
  if (
    event.status === EVENT_STATUS.COMPLETED ||
    new Date(event.endDate) < now
  ) {
    sendFailResponse(EVENT_ERRORS.EVENT_ALREADY_ENDED, 400);
  }
  if (
    event.registrationDeadline &&
    new Date(event.registrationDeadline) < now
  ) {
    sendFailResponse(EVENT_ERRORS.REGISTRATION_DEADLINE_PASSED, 400);
  }

  const existingReg = await EventRegistration.findOne({ eventId, userId });

  if (event.isInvitationOnly) {
    if (!existingReg?.isInvited) {
      sendFailResponse(EVENT_ERRORS.NOT_ELIGIBLE, 403);
    }
  }

  if (
    event.capacity &&
    (!existingReg ||
      existingReg.attendanceStatus !== ATTENDANCE_STATUS.REGISTERED)
  ) {
    const registrationCount = await EventRegistration.countDocuments({
      eventId,
    });
    if (registrationCount >= event.capacity) {
      sendFailResponse(EVENT_ERRORS.FULL_CAPACITY, 400);
    }
  }

  const reg = await EventRegistration.findOneAndUpdate(
    { eventId, userId },
    { $set: { attendanceStatus: ATTENDANCE_STATUS.REGISTERED } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const user = await User.findById(userId);
  if (user?.fcmTokens?.length && user?.enableNotification) {
    await sendFcmNotifications(
      user.fcmTokens,
      APP_NOTIFICATIONS.events.registrationConfirmed.title,
      formatNotification(APP_NOTIFICATIONS.events.registrationConfirmed.body, {
        eventTitle: event.title,
      }),
      {
        type: EVENT_FCM_TYPES.EVENT_REGISTRATION_CONFIRMED,
        eventId: eventId.toString(),
      },
    ).catch(() => {});
  }

  return {
    message: EVENT_MESSAGES.REGISTERED_SUCCESSFULLY,
    data: {
      registrationId: reg.registrationId,
      attendanceStatus: reg.attendanceStatus,
      eventTitle: event.title,
      eventDate: event.date,
      venue: event.venue,
    },
  };
}

/**
 * Fetches event pass details for a registered user.
 */
async function userGetEventPass(registrationId, userId) {
  if (!userId) sendFailResponse(EVENT_ERRORS.UNAUTHORIZED, 401);
  const reg = await EventRegistration.findOne({ registrationId })
    .populate("event")
    .lean();
  if (!reg) sendFailResponse(EVENT_ERRORS.REGISTRATION_NOT_FOUND, 404);
  if (reg.userId.toString() !== userId.toString()) {
    sendFailResponse(EVENT_ERRORS.UNAUTHORIZED, 403);
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

/**
 * Fetches list of registered events for current user with pagination.
 */
async function userMyEvents(userId, query = {}) {
  const pageNumber = Math.max(1, parseInt(query?.page) || 1);
  const limitNumber = Math.max(
    1,
    parseInt(query?.limit) || EVENT_CONFIG.DEFAULT_USER_LIMIT,
  );
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

/**
 * Returns total event counts per status in a single aggregation query.
 * Industry-standard: MongoDB $facet aggregation for multi-bucket counts.
 */
async function adminGetEventSummary() {
  syncEventStatuses().catch((err) =>
    console.error("syncEventStatuses error:", err),
  );

  const [result] = await Event.aggregate([
    {
      $facet: {
        all: [{ $count: "count" }],
        upcoming: [
          { $match: { status: EVENT_STATUS.UPCOMING } },
          { $count: "count" },
        ],
        ongoing: [
          { $match: { status: EVENT_STATUS.ONGOING } },
          { $count: "count" },
        ],
        completed: [
          { $match: { status: EVENT_STATUS.COMPLETED } },
          { $count: "count" },
        ],
      },
    },
  ]);

  return {
    data: {
      all: result?.all?.[0]?.count ?? 0,
      upcoming: result?.upcoming?.[0]?.count ?? 0,
      ongoing: result?.ongoing?.[0]?.count ?? 0,
      completed: result?.completed?.[0]?.count ?? 0,
    },
  };
}

module.exports = {
  adminCreateEvent,
  adminUpdateEvent,
  adminDeleteEvent,
  adminListEvents,
  adminGetEventSummary,
  adminGetEventDetails,
  adminInviteUser,
  adminCheckIn,
  userListEvents,
  userGetEventDetails,
  userRegisterForEvent,
  userGetEventPass,
  userMyEvents,
};
