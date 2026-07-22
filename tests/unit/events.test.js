const eventsService = require("../../src/modules/events/events.service");
const { Event, EVENT_STATUS } = require("../../src/schemas/event.schema");
const {
  EventRegistration,
  ATTENDANCE_STATUS,
} = require("../../src/schemas/event-registration.schema");
const User = require("../../src/schemas/user.schema");
const { sendFcmNotifications } = require("../../src/functions/fcm");

// Mock Mongoose schemas and functions
jest.mock("../../src/schemas/event.schema");
jest.mock("../../src/schemas/event-registration.schema");
jest.mock("../../src/schemas/user.schema");
jest.mock("../../src/functions/fcm", () => ({
  sendFcmNotifications: jest.fn().mockResolvedValue({ successCount: 1 }),
}));

describe("Events Service Unit Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ADMIN FUNCTIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe("Admin Functions", () => {
    // ── adminCreateEvent ────────────────────────────────────────────────────
    describe("adminCreateEvent", () => {
      it("should create an upcoming event successfully", async () => {
        const futureDate = new Date(Date.now() + 86400000); // tomorrow
        const futureEnd = new Date(Date.now() + 172800000); // day after
        const mockCreated = { _id: "event123" };
        Event.create.mockResolvedValue(mockCreated);

        const result = await eventsService.adminCreateEvent(
          {
            title: "Future Tech Summit",
            description: "Tech summit",
            venue: "Convention Center",
            date: futureDate,
            endDate: futureEnd,
          },
          "admin123",
        );

        expect(Event.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Future Tech Summit",
            status: EVENT_STATUS.UPCOMING,
            createdBy: "admin123",
          }),
        );
        expect(result.data.eventId).toBe("event123");
      });

      it("should default endDate to date if endDate is omitted", async () => {
        const futureDate = new Date(Date.now() + 86400000);
        const mockCreated = { _id: "event124" };
        Event.create.mockResolvedValue(mockCreated);

        await eventsService.adminCreateEvent(
          {
            title: "One Day Tech Event",
            description: "Event description",
            venue: "Hall A",
            date: futureDate,
          },
          "admin123",
        );

        expect(Event.create).toHaveBeenCalledWith(
          expect.objectContaining({
            date: futureDate,
            endDate: futureDate,
            status: EVENT_STATUS.UPCOMING,
          }),
        );
      });

      it("should set status to ONGOING if current time is between date and endDate", async () => {
        const pastStart = new Date(Date.now() - 3600000); // 1 hr ago
        const futureEnd = new Date(Date.now() + 3600000); // 1 hr later
        Event.create.mockResolvedValue({ _id: "event125" });

        await eventsService.adminCreateEvent(
          {
            title: "Live Hackathon",
            description: "Hackathon in progress",
            venue: "Lab 1",
            date: pastStart,
            endDate: futureEnd,
          },
          "admin123",
        );

        expect(Event.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: EVENT_STATUS.ONGOING,
          }),
        );
      });

      it("should set status to COMPLETED if current time is after endDate", async () => {
        const pastStart = new Date(Date.now() - 7200000);
        const pastEnd = new Date(Date.now() - 3600000);
        Event.create.mockResolvedValue({ _id: "event126" });

        await eventsService.adminCreateEvent(
          {
            title: "Past Summit",
            description: "Past event",
            venue: "Hall B",
            date: pastStart,
            endDate: pastEnd,
          },
          "admin123",
        );

        expect(Event.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: EVENT_STATUS.COMPLETED,
          }),
        );
      });

      it("should throw 400 for invalid start date format", async () => {
        await expect(
          eventsService.adminCreateEvent(
            {
              title: "Bad Event",
              date: "invalid-date-string",
            },
            "admin123",
          ),
        ).rejects.toThrow("Invalid start date");
      });

      it("should throw 400 for invalid end date format", async () => {
        await expect(
          eventsService.adminCreateEvent(
            {
              title: "Bad Event",
              date: new Date(),
              endDate: "invalid-end-date",
            },
            "admin123",
          ),
        ).rejects.toThrow("Invalid end date");
      });

      it("should throw 400 if endDate is before date", async () => {
        const futureDate = new Date(Date.now() + 86400000);
        const pastDate = new Date(Date.now() - 86400000);

        await expect(
          eventsService.adminCreateEvent(
            {
              title: "Broken Time Event",
              date: futureDate,
              endDate: pastDate,
            },
            "admin123",
          ),
        ).rejects.toThrow("End date cannot be before start date");
      });
    });

    // ── adminUpdateEvent ────────────────────────────────────────────────────
    describe("adminUpdateEvent", () => {
      it("should update an event successfully and recalculate status", async () => {
        const mockEvent = {
          _id: "event123",
          date: new Date(Date.now() + 86400000),
          endDate: new Date(Date.now() + 172800000),
        };
        Event.findById.mockResolvedValue(mockEvent);
        Event.findByIdAndUpdate.mockResolvedValue({
          ...mockEvent,
          title: "Updated Title",
        });

        const result = await eventsService.adminUpdateEvent("event123", {
          title: "Updated Title",
        });

        expect(result.data.updated).toBe(true);
      });

      it("should throw 404 if event to update does not exist", async () => {
        Event.findById.mockResolvedValue(null);

        await expect(
          eventsService.adminUpdateEvent("nonexistent", { title: "Test" }),
        ).rejects.toThrow("Event not found");
      });

      it("should throw 400 if update sets endDate before date", async () => {
        const mockEvent = {
          _id: "event123",
          date: new Date(Date.now() + 86400000),
          endDate: new Date(Date.now() + 172800000),
        };
        Event.findById.mockResolvedValue(mockEvent);

        await expect(
          eventsService.adminUpdateEvent("event123", {
            endDate: new Date(Date.now() - 86400000),
          }),
        ).rejects.toThrow("End date cannot be before start date");
      });
    });

    // ── adminDeleteEvent ────────────────────────────────────────────────────
    describe("adminDeleteEvent", () => {
      it("should delete an event and cancel registrations if event is in the future", async () => {
        const futureDate = new Date(Date.now() + 86400000);
        Event.findById.mockResolvedValue({
          _id: "event123",
          date: futureDate,
        });
        EventRegistration.updateMany.mockResolvedValue({ modifiedCount: 5 });
        Event.findByIdAndDelete.mockResolvedValue({ _id: "event123" });

        const result = await eventsService.adminDeleteEvent("event123");

        expect(EventRegistration.updateMany).toHaveBeenCalledWith(
          { eventId: "event123" },
          { $set: { attendanceStatus: ATTENDANCE_STATUS.EVENT_CANCELLED } },
        );
        expect(Event.findByIdAndDelete).toHaveBeenCalledWith("event123");
        expect(result.data.deleted).toBe(true);
      });

      it("should throw 404 if deleting non-existent event", async () => {
        Event.findById.mockResolvedValue(null);

        await expect(
          eventsService.adminDeleteEvent("nonexistent"),
        ).rejects.toThrow("Event not found");
      });
    });

    // ── adminListEvents ─────────────────────────────────────────────────────
    describe("adminListEvents", () => {
      it("should return paginated list of events", async () => {
        const mockEvents = [
          { _id: "e1", title: "Event 1" },
          { _id: "e2", title: "Event 2" },
        ];
        Event.updateMany.mockResolvedValue({});
        Event.find.mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockEvents),
        });
        Event.countDocuments.mockResolvedValue(2);

        const result = await eventsService.adminListEvents({
          page: "1",
          limit: "10",
        });

        expect(result.data.events.length).toBe(2);
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(10);
        expect(result.data.total).toBe(2);
      });
    });

    // ── adminGetEventDetails ────────────────────────────────────────────────
    describe("adminGetEventDetails", () => {
      it("should return event details and registration count", async () => {
        const mockEvent = { _id: "event123", title: "Tech Conf" };
        const mockRegistrations = [
          { _id: "r1", registrationId: "REG001", userId: { name: "Alice" } },
        ];
        Event.findById.mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockEvent),
        });
        EventRegistration.find.mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockRegistrations),
        });

        const result = await eventsService.adminGetEventDetails("event123");

        expect(result.data.title).toBe("Tech Conf");
        expect(result.data.registrationCount).toBe(1);
      });

      it("should throw 404 if event details not found", async () => {
        Event.findById.mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        });

        await expect(
          eventsService.adminGetEventDetails("nonexistent"),
        ).rejects.toThrow("Event not found");
      });
    });

    // ── adminInviteUser ─────────────────────────────────────────────────────
    describe("adminInviteUser", () => {
      it("should invite user successfully and send notification", async () => {
        Event.findById.mockResolvedValue({
          _id: "event123",
          title: "VIP Gala",
        });
        User.findById.mockResolvedValue({
          _id: "user123",
          fcmTokens: ["token123"],
          enableNotification: true,
        });
        EventRegistration.findOneAndUpdate.mockResolvedValue({
          registrationId: "REG_VIP_123",
        });

        const result = await eventsService.adminInviteUser(
          "event123",
          "user123",
        );

        expect(result.data.registrationId).toBe("REG_VIP_123");
        expect(sendFcmNotifications).toHaveBeenCalledWith(
          ["token123"],
          "You're invited! 🎉",
          "You have received an invitation to VIP Gala",
          expect.objectContaining({ type: "EVENT_INVITATION" }),
        );
      });

      it("should throw 404 if target user does not exist", async () => {
        Event.findById.mockResolvedValue({ _id: "event123" });
        User.findById.mockResolvedValue(null);

        await expect(
          eventsService.adminInviteUser("event123", "nonexistentUser"),
        ).rejects.toThrow("User not found");
      });
    });

    // ── adminCheckIn ────────────────────────────────────────────────────────
    describe("adminCheckIn", () => {
      it("should check in attendee successfully", async () => {
        const mockReg = {
          registrationId: "REG123",
          attendanceStatus: ATTENDANCE_STATUS.REGISTERED,
          save: jest.fn().mockResolvedValue(true),
        };
        EventRegistration.findOne.mockResolvedValue(mockReg);

        const result = await eventsService.adminCheckIn("REG123");

        expect(mockReg.attendanceStatus).toBe(ATTENDANCE_STATUS.CHECKED_IN);
        expect(mockReg.save).toHaveBeenCalled();
        expect(result.data.attendanceStatus).toBe(
          ATTENDANCE_STATUS.CHECKED_IN,
        );
      });

      it("should throw 400 when attempting to check in a cancelled registration", async () => {
        const mockReg = {
          registrationId: "REG123",
          attendanceStatus: ATTENDANCE_STATUS.CANCELLED,
        };
        EventRegistration.findOne.mockResolvedValue(mockReg);

        await expect(eventsService.adminCheckIn("REG123")).rejects.toThrow(
          "Cannot check in a cancelled registration",
        );
      });

      it("should throw 404 if registration not found", async () => {
        EventRegistration.findOne.mockResolvedValue(null);

        await expect(
          eventsService.adminCheckIn("NONEXISTENT"),
        ).rejects.toThrow("Registration not found");
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // USER FUNCTIONS
  // ───────────────────────────────────────────────────────────────────────────
  describe("User Functions", () => {
    // ── userListEvents ──────────────────────────────────────────────────────
    describe("userListEvents", () => {
      it("should return featured events tab", async () => {
        const mockFeatured = [{ _id: "f1", title: "Featured 1" }];
        Event.updateMany.mockResolvedValue({});
        EventRegistration.find.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        });
        Event.find.mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockFeatured),
        });

        const result = await eventsService.userListEvents(
          { tab: "featured" },
          "user123",
        );

        expect(result.data.events.length).toBe(1);
      });

      it("should handle nearby tab with fallback when geo query throws error", async () => {
        Event.updateMany.mockResolvedValue({});
        EventRegistration.find.mockReturnValue({
          select: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        });
        Event.aggregate.mockRejectedValue(
          new Error("2dsphere index missing"),
        );
        Event.find.mockReturnValue({
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([{ _id: "e1", title: "Fallback Event" }]),
        });
        Event.countDocuments.mockResolvedValue(1);

        const result = await eventsService.userListEvents({
          tab: "nearby",
          lat: "12.9716",
          lng: "77.5946",
        });

        expect(result.data.hasLocationData).toBe(false);
        expect(result.data.events.length).toBe(1);
      });
    });

    // ── userGetEventDetails ─────────────────────────────────────────────────
    describe("userGetEventDetails", () => {
      it("should return event details and mark eligible for public events", async () => {
        const mockEvent = { _id: "e1", isInvitationOnly: false };
        Event.findById.mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockEvent),
        });
        EventRegistration.countDocuments.mockResolvedValue(10);
        EventRegistration.findOne.mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        });

        const result = await eventsService.userGetEventDetails("e1", "user123");

        expect(result.data.isEligible).toBe(true);
        expect(result.data.registrationCount).toBe(10);
      });

      it("should mark isEligible = false for uninvited user on invitation-only event", async () => {
        const mockEvent = { _id: "e1", isInvitationOnly: true };
        Event.findById.mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockEvent),
        });
        EventRegistration.countDocuments.mockResolvedValue(2);
        EventRegistration.findOne.mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        });

        const result = await eventsService.userGetEventDetails("e1", "user123");

        expect(result.data.isEligible).toBe(false);
      });
    });

    // ── userRegisterForEvent ────────────────────────────────────────────────
    describe("userRegisterForEvent", () => {
      it("should register user successfully for active upcoming event", async () => {
        const futureDate = new Date(Date.now() + 86400000);
        const futureEnd = new Date(Date.now() + 172800000);
        Event.findById.mockResolvedValue({
          _id: "e1",
          active: true,
          status: EVENT_STATUS.UPCOMING,
          date: futureDate,
          endDate: futureEnd,
          title: "Design Conf",
          venue: "Hall C",
        });
        EventRegistration.findOne.mockResolvedValue(null);
        EventRegistration.findOneAndUpdate.mockResolvedValue({
          registrationId: "REG_DESIGN_101",
          attendanceStatus: ATTENDANCE_STATUS.REGISTERED,
        });
        User.findById.mockResolvedValue({
          _id: "user123",
          fcmTokens: ["token1"],
          enableNotification: true,
        });

        const result = await eventsService.userRegisterForEvent("e1", "user123");

        expect(result.data.registrationId).toBe("REG_DESIGN_101");
        expect(result.message).toBe("Registered successfully");
      });

      it("should reject registration for completed/ended event", async () => {
        Event.findById.mockResolvedValue({
          _id: "e1",
          active: true,
          status: EVENT_STATUS.COMPLETED,
          endDate: new Date(Date.now() - 3600000),
        });

        await expect(
          eventsService.userRegisterForEvent("e1", "user123"),
        ).rejects.toThrow("Event has already ended");
      });

      it("should reject registration if capacity is full for new user", async () => {
        Event.findById.mockResolvedValue({
          _id: "e1",
          active: true,
          capacity: 5,
          endDate: new Date(Date.now() + 86400000),
        });
        EventRegistration.findOne.mockResolvedValue(null);
        EventRegistration.countDocuments.mockResolvedValue(5);

        await expect(
          eventsService.userRegisterForEvent("e1", "user123"),
        ).rejects.toThrow("Event is at full capacity");
      });

      it("should allow registration if user is already registered even if capacity is full", async () => {
        Event.findById.mockResolvedValue({
          _id: "e1",
          active: true,
          capacity: 5,
          endDate: new Date(Date.now() + 86400000),
          title: "Full Conf",
        });
        EventRegistration.findOne.mockResolvedValue({
          _id: "reg1",
          attendanceStatus: ATTENDANCE_STATUS.REGISTERED,
        });
        EventRegistration.findOneAndUpdate.mockResolvedValue({
          registrationId: "REG_EXISTS_101",
          attendanceStatus: ATTENDANCE_STATUS.REGISTERED,
        });
        User.findById.mockResolvedValue({ _id: "user123" });

        const result = await eventsService.userRegisterForEvent("e1", "user123");

        expect(result.data.registrationId).toBe("REG_EXISTS_101");
      });
    });

    // ── userGetEventPass ────────────────────────────────────────────────────
    describe("userGetEventPass", () => {
      it("should return event pass for owner", async () => {
        const mockReg = {
          registrationId: "REG123",
          userId: "user123",
          attendanceStatus: ATTENDANCE_STATUS.REGISTERED,
          event: { title: "Annual Meetup" },
        };
        EventRegistration.findOne.mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockReg),
        });

        const result = await eventsService.userGetEventPass(
          "REG123",
          "user123",
        );

        expect(result.data.registrationId).toBe("REG123");
        expect(result.data.event.title).toBe("Annual Meetup");
      });

      it("should throw 403 if user tries to access pass of another user", async () => {
        const mockReg = {
          registrationId: "REG123",
          userId: "user999",
        };
        EventRegistration.findOne.mockReturnValue({
          populate: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockReg),
        });

        await expect(
          eventsService.userGetEventPass("REG123", "user123"),
        ).rejects.toThrow("Unauthorized");
      });
    });
  });
});
