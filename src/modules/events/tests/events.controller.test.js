const eventsController = require("../events.controller");
const eventsService = require("../events.service");

jest.mock("../events.service");

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Events Controller Unit Tests", () => {
  let res;

  beforeEach(() => {
    jest.clearAllMocks();
    res = mockRes();
  });

  describe("Admin Controller Actions", () => {
    it("adminCreateEvent should delegate to eventsService.adminCreateEvent", async () => {
      const req = { body: { title: "Test Event" }, admin: { _id: "admin1" } };
      eventsService.adminCreateEvent.mockResolvedValue({
        message: "Event created",
        data: { eventId: "e1" },
      });

      await eventsController.adminCreateEvent(req, res);

      expect(eventsService.adminCreateEvent).toHaveBeenCalledWith(
        { title: "Test Event" },
        "admin1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success" }),
      );
    });

    it("adminUpdateEvent should delegate to eventsService.adminUpdateEvent", async () => {
      const req = { params: { eventId: "e1" }, body: { title: "New Title" } };
      eventsService.adminUpdateEvent.mockResolvedValue({
        message: "Event updated",
        data: { updated: true },
      });

      await eventsController.adminUpdateEvent(req, res);

      expect(eventsService.adminUpdateEvent).toHaveBeenCalledWith("e1", {
        title: "New Title",
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminDeleteEvent should delegate to eventsService.adminDeleteEvent", async () => {
      const req = { params: { eventId: "e1" } };
      eventsService.adminDeleteEvent.mockResolvedValue({
        message: "Event deleted",
        data: { deleted: true },
      });

      await eventsController.adminDeleteEvent(req, res);

      expect(eventsService.adminDeleteEvent).toHaveBeenCalledWith("e1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminListEvents should delegate to eventsService.adminListEvents", async () => {
      const req = { query: { page: "1", limit: "10" } };
      eventsService.adminListEvents.mockResolvedValue({
        data: { events: [], page: 1, limit: 10, total: 0 },
      });

      await eventsController.adminListEvents(req, res);

      expect(eventsService.adminListEvents).toHaveBeenCalledWith({
        page: "1",
        limit: "10",
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminGetEventDetails should delegate to eventsService.adminGetEventDetails", async () => {
      const req = { params: { eventId: "e1" } };
      eventsService.adminGetEventDetails.mockResolvedValue({
        data: { _id: "e1", title: "Summit" },
      });

      await eventsController.adminGetEventDetails(req, res);

      expect(eventsService.adminGetEventDetails).toHaveBeenCalledWith("e1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminInviteUser should delegate to eventsService.adminInviteUser", async () => {
      const req = { params: { eventId: "e1" }, body: { userId: "u1" } };
      eventsService.adminInviteUser.mockResolvedValue({
        message: "User invited",
        data: { registrationId: "r1" },
      });

      await eventsController.adminInviteUser(req, res);

      expect(eventsService.adminInviteUser).toHaveBeenCalledWith("e1", "u1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("adminCheckIn should delegate to eventsService.adminCheckIn", async () => {
      const req = { params: { registrationId: "r1" } };
      eventsService.adminCheckIn.mockResolvedValue({
        message: "Checked in",
        data: { attendanceStatus: "checked_in" },
      });

      await eventsController.adminCheckIn(req, res);

      expect(eventsService.adminCheckIn).toHaveBeenCalledWith("r1");
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe("User Controller Actions", () => {
    it("userListEvents should pass userId and query to service", async () => {
      const req = {
        query: { tab: "upcoming" },
        user: { _id: "u1" },
      };
      eventsService.userListEvents.mockResolvedValue({
        data: { events: [] },
      });

      await eventsController.userListEvents(req, res);

      expect(eventsService.userListEvents).toHaveBeenCalledWith(
        { tab: "upcoming" },
        "u1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("userGetEventDetails should pass eventId and userId to service", async () => {
      const req = {
        params: { eventId: "e1" },
        user: { id: "u1" },
      };
      eventsService.userGetEventDetails.mockResolvedValue({
        data: { event: {} },
      });

      await eventsController.userGetEventDetails(req, res);

      expect(eventsService.userGetEventDetails).toHaveBeenCalledWith(
        "e1",
        "u1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("userRegisterForEvent should pass eventId and userId to service", async () => {
      const req = {
        params: { eventId: "e1" },
        user: { _id: "u1" },
      };
      eventsService.userRegisterForEvent.mockResolvedValue({
        message: "Registered successfully",
        data: { registrationId: "r1" },
      });

      await eventsController.userRegisterForEvent(req, res);

      expect(eventsService.userRegisterForEvent).toHaveBeenCalledWith(
        "e1",
        "u1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("userGetEventPass should pass registrationId and userId to service", async () => {
      const req = {
        params: { registrationId: "r1" },
        user: { _id: "u1" },
      };
      eventsService.userGetEventPass.mockResolvedValue({
        data: { registrationId: "r1" },
      });

      await eventsController.userGetEventPass(req, res);

      expect(eventsService.userGetEventPass).toHaveBeenCalledWith("r1", "u1");
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("userMyEvents should pass userId and query to service", async () => {
      const req = {
        query: { page: "1" },
        user: { _id: "u1" },
      };
      eventsService.userMyEvents.mockResolvedValue({
        data: { events: [] },
      });

      await eventsController.userMyEvents(req, res);

      expect(eventsService.userMyEvents).toHaveBeenCalledWith("u1", {
        page: "1",
      });
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
