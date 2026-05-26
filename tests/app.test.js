require("dotenv").config();
const request = require("supertest");
const app = require("../src/app");

describe("Initial Endpoint / testing", () => {
  it("should return Hello World", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("message", "Hello World");
  });
});
