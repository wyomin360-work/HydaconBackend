const Event = require("../../schemas/event.schema");
const EventRegistration = require("../../schemas/event-registration.schema");
const User = require("../../schemas/user.schema");
const crypto = require("crypto");

const { sendFcmNotifications } = require("../../functions/fcm");
const { APP_NOTIFICATIONS } = require("../../constants/notifications");
const { formatNotification } = require("../../utils/heplers");

// --- Admin Services ---

exports.createEvent = async (data) => {
  try {
    const event = new Event(data);
    await event.save();
    return { success: true, message: "Event created successfully", data: event };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.updateEvent = async (eventId, data) => {
  try {
    const event = await Event.findByIdAndUpdate(eventId, data, { new: true });
    if (!event) return { success: false, message: "Event not found" };
    return { success: true, message: "Event updated successfully", data: event };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.listAdminEvents = async (data) => {
  try {
    const { page = 1, limit = 10, search = "", status } = data;
    const skip = (page - 1) * limit;
    let query = {};

    if (search) query.name = { $regex: search, $options: "i" };
    if (status) query.status = status;

    const events = await Event.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await Event.countDocuments(query);
    return {
      success: true,
      data: {
        events,
        limit,
        totalPages: Math.ceil(total / limit),
        total,
        page,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getEventById = async (eventId) => {
  try {
    const event = await Event.findById(eventId);
    if (!event) return { success: false, message: "Event not found" };
    return { success: true, data: event };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.deleteEvent = async (eventId) => {
  try {
    const event = await Event.findByIdAndDelete(eventId);
    if (!event) return { success: false, message: "Event not found" };
    
    // Optionally delete all registrations, or mark event as CANCELLED
    await EventRegistration.deleteMany({ eventId });
    
    return { success: true, message: "Event deleted successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.inviteUser = async (eventId, userId) => {
  try {
    const event = await Event.findById(eventId);
    if (!event) return { success: false, message: "Event not found" };

    let registration = await EventRegistration.findOne({ eventId, userId });
    
    if (registration) {
      if (registration.status === "REGISTERED") {
        return { success: false, message: "User is already registered" };
      }
      registration.status = "INVITED";
      await registration.save();
    } else {
      registration = new EventRegistration({
        eventId,
        userId,
        status: "INVITED"
      });
      await registration.save();
    }

    // Send notification
    const userToNotify = await User.findById(userId);
    if (userToNotify?.fcmTokens?.length && userToNotify?.enableNotification) {
      await sendFcmNotifications(
        userToNotify.fcmTokens,
        APP_NOTIFICATIONS.events.invitation.title,
        formatNotification(APP_NOTIFICATIONS.events.invitation.body, { eventName: event.name })
      );
    }

    return { success: true, message: "User invited successfully", data: registration };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getEventRegistrations = async (eventId, data) => {
  try {
    const { page = 1, limit = 10, status } = data;
    const skip = (page - 1) * limit;

    let query = { eventId };
    if (status) query.status = status;

    const registrations = await EventRegistration.find(query)
      .populate("userId", "name email phone profilePhoto areaOfOperation")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await EventRegistration.countDocuments(query);
    return {
      success: true,
      data: {
        registrations,
        limit,
        totalPages: Math.ceil(total / limit),
        total,
        page,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.checkInUser = async (eventId, qrCodeData) => {
  try {
    const registration = await EventRegistration.findOne({ eventId, qrCodeData }).populate("eventId");
    if (!registration) {
      return { success: false, message: "Invalid QR Code or Registration not found" };
    }

    if (registration.status === "ATTENDED") {
      return { success: false, message: "User has already checked in" };
    }
    
    if (registration.status !== "REGISTERED") {
      return { success: false, message: "User is not registered for this event" };
    }

    registration.status = "ATTENDED";
    registration.checkInTime = new Date();
    await registration.save();

    return { success: true, message: "Check-in successful", data: registration };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getEventReport = async (eventId) => {
  try {
    const event = await Event.findById(eventId);
    if (!event) return { success: false, message: "Event not found" };

    const totalInterested = await EventRegistration.countDocuments({ eventId, status: "INTERESTED" });
    const totalRegistered = await EventRegistration.countDocuments({ eventId, status: "REGISTERED" });
    const totalAttended = await EventRegistration.countDocuments({ eventId, status: "ATTENDED" });

    // Regional breakdown among attendees
    const attendees = await EventRegistration.find({ eventId, status: "ATTENDED" }).populate("userId", "areaOfOperation");
    
    const regionalBreakdown = attendees.reduce((acc, reg) => {
      const region = reg.userId?.areaOfOperation || "Unknown";
      acc[region] = (acc[region] || 0) + 1;
      return acc;
    }, {});

    return {
      success: true,
      data: {
        totalInterested,
        totalRegistered,
        totalAttended,
        attendanceRate: totalRegistered > 0 ? ((totalAttended / totalRegistered) * 100).toFixed(2) + "%" : "0%",
        regionalBreakdown
      }
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

// --- User Services ---

exports.listUserEvents = async (userId, data) => {
  try {
    const { page = 1, limit = 10 } = data;
    const skip = (page - 1) * limit;

    const user = await User.findById(userId).select("areaOfOperation");
    const region = user?.areaOfOperation || "UNKNOWN";

    const query = {
      status: "PUBLISHED",
      $or: [{ region: "ALL" }, { region }]
    };

    const events = await Event.find(query)
      .skip(skip)
      .limit(limit)
      .sort({ date: 1 });

    const total = await Event.countDocuments(query);
    
    // Check user registration status for each event
    const eventIds = events.map(e => e._id);
    const registrations = await EventRegistration.find({ userId, eventId: { $in: eventIds } });
    
    const regMap = registrations.reduce((acc, reg) => {
      acc[reg.eventId.toString()] = reg.status;
      return acc;
    }, {});

    const enrichedEvents = events.map(event => {
      const evObj = event.toObject();
      evObj.userStatus = regMap[event._id.toString()] || "NONE";
      return evObj;
    });

    return {
      success: true,
      data: {
        events: enrichedEvents,
        limit,
        totalPages: Math.ceil(total / limit),
        total,
        page,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.getMyRegistrations = async (userId, data) => {
  try {
    const { page = 1, limit = 10 } = data;
    const skip = (page - 1) * limit;

    const query = { userId, status: { $in: ["REGISTERED", "ATTENDED", "INVITED"] } };

    const registrations = await EventRegistration.find(query)
      .populate("eventId")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const total = await EventRegistration.countDocuments(query);

    return {
      success: true,
      data: {
        registrations,
        limit,
        totalPages: Math.ceil(total / limit),
        total,
        page,
      },
    };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.markInterest = async (eventId, userId) => {
  try {
    let registration = await EventRegistration.findOne({ eventId, userId });
    if (registration) {
      if (registration.status === "REGISTERED" || registration.status === "ATTENDED") {
        return { success: false, message: "You are already registered" };
      }
      registration.status = "INTERESTED";
      await registration.save();
    } else {
      registration = new EventRegistration({
        eventId,
        userId,
        status: "INTERESTED"
      });
      await registration.save();
    }
    
    return { success: true, message: "Marked as interested", data: registration };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.registerForEvent = async (eventId, userId) => {
  try {
    const event = await Event.findById(eventId);
    if (!event) return { success: false, message: "Event not found" };

    if (event.status !== "PUBLISHED") {
      return { success: false, message: "Event is not open for registration" };
    }

    if (new Date() > event.registrationDeadline) {
      return { success: false, message: "Registration deadline has passed" };
    }

    let registration = await EventRegistration.findOne({ eventId, userId });

    if (event.requiresInvitation) {
      if (!registration || registration.status !== "INVITED") {
        return { success: false, message: "This event requires an invitation to register" };
      }
    }

    if (registration && registration.status === "REGISTERED") {
      return { success: false, message: "You are already registered" };
    }

    // Check capacity
    if (event.capacity > 0) {
      const currentRegistrations = await EventRegistration.countDocuments({ eventId, status: "REGISTERED" });
      if (currentRegistrations >= event.capacity) {
        return { success: false, message: "Event is at full capacity" };
      }
    }

    // Generate unique QR code data string
    const qrCodeData = crypto.randomBytes(16).toString("hex");

    if (registration) {
      registration.status = "REGISTERED";
      registration.qrCodeData = qrCodeData;
      await registration.save();
    } else {
      registration = new EventRegistration({
        eventId,
        userId,
        status: "REGISTERED",
        qrCodeData
      });
      await registration.save();
    }

    const userToNotify = await User.findById(userId);
    if (userToNotify?.fcmTokens?.length && userToNotify?.enableNotification) {
      await sendFcmNotifications(
        userToNotify.fcmTokens,
        APP_NOTIFICATIONS.events.registrationConfirmed.title,
        formatNotification(APP_NOTIFICATIONS.events.registrationConfirmed.body, { eventName: event.name })
      );
    }

    return { success: true, message: "Registered successfully", data: registration };
  } catch (error) {
    return { success: false, message: error.message };
  }
};

exports.cancelRegistration = async (eventId, userId) => {
  try {
    let registration = await EventRegistration.findOne({ eventId, userId });
    if (!registration) {
      return { success: false, message: "Registration not found" };
    }

    if (registration.status === "ATTENDED") {
      return { success: false, message: "Cannot cancel after attending" };
    }

    registration.status = "CANCELLED";
    registration.qrCodeData = null; // Invalidate QR
    await registration.save();

    return { success: true, message: "Registration cancelled successfully" };
  } catch (error) {
    return { success: false, message: error.message };
  }
};
