const rateLimiter = require("../rateLimiter");
const RateLimit = require("../../schemas/rate-limit.schema");
const ServiceRequest = require("../../schemas/service-request.schema");
const userService = require("../../modules/user/user.service");
const AppError = require("../../utils/appError");
const { compareHash } = require("../../utils/heplers");

jest.mock("../../schemas/rate-limit.schema");
jest.mock("../../schemas/service-request.schema");
jest.mock("../../schemas/user.schema");
jest.mock("../../utils/heplers", () => {
  const original = jest.requireActual("../../utils/heplers");
  return {
    ...original,
    compareHash: jest.fn(),
  };
});

describe("Rate Limiter & OTP Abuse Prevention Tests", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      ip: "127.0.0.1",
      body: {}, // Empty body by default to isolate IP limit test
      headers: {},
      socket: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
    };
    next = jest.fn();
  });

  describe("rateLimiter Middleware", () => {
    it("should allow request if under limit and create a new record if none exists", async () => {
      RateLimit.findOne.mockResolvedValue(null);
      RateLimit.create.mockResolvedValue({
        key: "otp:ip:127.0.0.1",
        hits: 1,
        resetTime: new Date(Date.now() + 60000),
      });

      const limiter = rateLimiter({ windowMs: 60000, max: 3 });
      await limiter(req, res, next);

      expect(RateLimit.findOne).toHaveBeenCalled();
      expect(RateLimit.create).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("should increment hits and call next if within limits", async () => {
      const mockRecord = {
        key: "otp:ip:127.0.0.1",
        hits: 2,
        resetTime: new Date(Date.now() + 60000),
        save: jest.fn().mockResolvedValue(true),
      };
      RateLimit.findOne.mockResolvedValue(mockRecord);

      const limiter = rateLimiter({ windowMs: 60000, max: 3 });
      await limiter(req, res, next);

      expect(mockRecord.hits).toBe(3);
      expect(mockRecord.save).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it("should block request and throw AppError with 429 if limit is exceeded", async () => {
      const mockRecord = {
        key: "otp:ip:127.0.0.1",
        hits: 3,
        resetTime: new Date(Date.now() + 60000),
        save: jest.fn().mockResolvedValue(true),
      };
      RateLimit.findOne.mockResolvedValue(mockRecord);

      const limiter = rateLimiter({ windowMs: 60000, max: 3 });
      await limiter(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(429);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Retry-After",
        expect.any(Number),
      );
    });

    it("should reset hits to 1 if resetTime has passed", async () => {
      const mockRecord = {
        key: "otp:ip:127.0.0.1",
        hits: 3,
        resetTime: new Date(Date.now() - 1000), // expired resetTime
        save: jest.fn().mockResolvedValue(true),
      };
      RateLimit.findOne.mockResolvedValue(mockRecord);

      const limiter = rateLimiter({ windowMs: 60000, max: 3 });
      await limiter(req, res, next);

      expect(mockRecord.hits).toBe(1);
      expect(mockRecord.save).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it("should check both IP and normalized identifier keys if body contains identity", async () => {
      req.body = { identity: " +91 98765-43210 " }; // normalized to 9876543210

      RateLimit.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const limiter = rateLimiter({ windowMs: 60000, max: 3 });
      await limiter(req, res, next);

      expect(RateLimit.findOne).toHaveBeenCalledTimes(2);
      expect(RateLimit.findOne).toHaveBeenNthCalledWith(1, {
        key: "otp:ip:127.0.0.1",
      });
      expect(RateLimit.findOne).toHaveBeenNthCalledWith(2, {
        key: "otp:id:9876543210",
      });
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe("verifyOtp OTP Verification Brute-Force Prevention", () => {
    it("should verify OTP successfully and delete ServiceRequest", async () => {
      const mockSR = {
        _id: "sr_id_123",
        data: "hashed_otp_data",
        attempts: 0,
        expiresAt: new Date(Date.now() + 600000),
        requestType: "RESET_PASSWORD",
        userId: "user_id_123",
      };

      const mockUser = {
        id: "user_id_123",
        _id: "user_id_123",
      };

      ServiceRequest.findOne.mockResolvedValue(mockSR);
      compareHash.mockResolvedValue(true);
      ServiceRequest.findByIdAndDelete.mockResolvedValue(true);
      ServiceRequest.deleteMany.mockResolvedValue(true);
      ServiceRequest.create.mockResolvedValue({ token: "reset_token" });
      const User = require("../../schemas/user.schema");
      User.findOne.mockResolvedValue(mockUser);

      const result = await userService.verifyOtp({
        otp: "1234",
        token: "token_123",
      });

      expect(ServiceRequest.findOne).toHaveBeenCalledWith({
        token: "token_123",
        status: "PENDING",
      });
      expect(compareHash).toHaveBeenCalledWith("1234", "hashed_otp_data");
      expect(ServiceRequest.findByIdAndDelete).toHaveBeenCalledWith(
        "sr_id_123",
      );
      expect(result.data.otpVerified).toBe(true);
    });

    it("should increment attempts if verification fails but attempts < 5", async () => {
      const mockSR = {
        _id: "sr_id_123",
        data: "hashed_otp_data",
        attempts: 1,
        expiresAt: new Date(Date.now() + 600000),
        save: jest.fn().mockResolvedValue(true),
      };

      ServiceRequest.findOne.mockResolvedValue(mockSR);
      compareHash.mockResolvedValue(false);

      await expect(
        userService.verifyOtp({ otp: "1234", token: "token_123" }),
      ).rejects.toThrow("Otp mismatch. 3 attempts remaining.");

      expect(mockSR.attempts).toBe(2);
      expect(mockSR.save).toHaveBeenCalled();
      expect(ServiceRequest.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it("should delete ServiceRequest and block if 5th attempt fails", async () => {
      const mockSR = {
        _id: "sr_id_123",
        data: "hashed_otp_data",
        attempts: 4,
        expiresAt: new Date(Date.now() + 600000),
        save: jest.fn().mockResolvedValue(true),
      };

      ServiceRequest.findOne.mockResolvedValue(mockSR);
      compareHash.mockResolvedValue(false);
      ServiceRequest.findByIdAndDelete.mockResolvedValue(true);

      await expect(
        userService.verifyOtp({ otp: "1234", token: "token_123" }),
      ).rejects.toThrow("Too many failed attempts. Please request a new OTP.");

      expect(ServiceRequest.findByIdAndDelete).toHaveBeenCalledWith(
        "sr_id_123",
      );
    });
  });
});
