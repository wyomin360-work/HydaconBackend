const eventsPaths = require("../modules/events/events.paths");

const root = eventsPaths.root;

module.exports = {
  [`${root}${eventsPaths.adminCreate}`]: {
    post: {
      summary: "Admin Create Event",
      tags: ["Events Admin"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["title", "description", "venue", "date"],
              properties: {
                title: { type: "string", example: "Annual Tech Expo" },
                description: { type: "string", example: "Annual tech conference" },
                bannerImage: { type: "string", example: "https://cdn.example.com/banner.jpg" },
                venue: { type: "string", example: "Convention Center Hall 1" },
                city: { type: "string", example: "Kochi" },
                state: { type: "string", example: "Kerala" },
                country: { type: "string", example: "India" },
                date: { type: "string", format: "date-time", example: "2026-09-01T10:00:00.000Z" },
                endDate: { type: "string", format: "date-time", example: "2026-09-02T18:00:00.000Z" },
                registrationDeadline: { type: "string", format: "date-time", example: "2026-08-30T23:59:59.000Z" },
                capacity: { type: "integer", example: 200 },
                type: { type: "string", enum: ["webinar", "workshop", "conference", "meetup", "other"], example: "conference" },
                isInvitationOnly: { type: "boolean", example: false },
                active: { type: "boolean", example: true },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Event created successfully" },
        400: { description: "Bad request / Validation error" },
        401: { description: "Unauthorized" },
      },
    },
  },
  [`${root}${eventsPaths.adminUpdate}`]: {
    patch: {
      summary: "Admin Update Event",
      tags: ["Events Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "eventId", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                venue: { type: "string" },
                date: { type: "string", format: "date-time" },
                endDate: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Event updated successfully" },
        404: { description: "Event not found" },
      },
    },
  },
  [`${root}${eventsPaths.adminDelete}`]: {
    delete: {
      summary: "Admin Delete Event",
      tags: ["Events Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "eventId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: { description: "Event deleted successfully" },
        404: { description: "Event not found" },
      },
    },
  },
  [`${root}${eventsPaths.adminList}`]: {
    get: {
      summary: "Admin List Events",
      tags: ["Events Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
        { name: "status", in: "query", schema: { type: "string", enum: ["upcoming", "ongoing", "completed"] } },
      ],
      responses: {
        200: { description: "Paginated events list" },
      },
    },
  },
  [`${root}${eventsPaths.adminDetails}`]: {
    get: {
      summary: "Admin Get Event Details",
      tags: ["Events Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "eventId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: { description: "Event details with registrations" },
        404: { description: "Event not found" },
      },
    },
  },
  [`${root}${eventsPaths.adminInviteUser}`]: {
    post: {
      summary: "Admin Invite User to Event",
      tags: ["Events Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "eventId", in: "path", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userId"],
              properties: {
                userId: { type: "string", example: "64f1a2b3c4d5e6f7a8b9c0d1" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "User invited successfully" },
        404: { description: "Event or User not found" },
      },
    },
  },
  [`${root}${eventsPaths.adminCheckIn}`]: {
    patch: {
      summary: "Admin Check-In Attendee",
      tags: ["Events Admin"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "registrationId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: { description: "Attendee checked in successfully" },
        400: { description: "Cannot check in cancelled registration" },
        404: { description: "Registration not found" },
      },
    },
  },
  [`${root}${eventsPaths.userList}`]: {
    get: {
      summary: "User List Events Feed",
      tags: ["Events User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "tab", in: "query", schema: { type: "string", enum: ["featured", "nearby", "upcoming"] } },
        { name: "lat", in: "query", schema: { type: "string" } },
        { name: "lng", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
      ],
      responses: {
        200: { description: "User event feed" },
      },
    },
  },
  [`${root}${eventsPaths.userDetails}`]: {
    get: {
      summary: "User Get Event Details",
      tags: ["Events User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "eventId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: { description: "Event details and user eligibility status" },
        404: { description: "Event not found" },
      },
    },
  },
  [`${root}${eventsPaths.userRegister}`]: {
    post: {
      summary: "User Register for Event",
      tags: ["Events User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "eventId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: { description: "Registered successfully" },
        400: { description: "Event ended or capacity full" },
        403: { description: "Not eligible for invitation-only event" },
        404: { description: "Event not found" },
      },
    },
  },
  [`${root}${eventsPaths.userPass}`]: {
    get: {
      summary: "User Get Event Pass",
      tags: ["Events User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "registrationId", in: "path", required: true, schema: { type: "string" } },
      ],
      responses: {
        200: { description: "Event pass data" },
        403: { description: "Unauthorized access to another user's pass" },
        404: { description: "Registration not found" },
      },
    },
  },
  [`${root}${eventsPaths.myEvents}`]: {
    get: {
      summary: "User My Registered Events",
      tags: ["Events User"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", default: 10 } },
      ],
      responses: {
        200: { description: "List of user registered events" },
      },
    },
  },
};
