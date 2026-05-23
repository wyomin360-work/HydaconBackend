const { requireVerifiedKyc } = require("../../src/middlewares/kycVerification");
const User = require("../../src/schemas/user.schema");
const { KYC_STATUS } = require("../../src/constants/user");
const AppError = require("../../src/utils/appError");

jest.mock("../../src/schemas/user.schema");

describe("requireVerifiedKyc middleware", () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      userId: "user123",
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  it("should fail with 401 if req.userId is missing", async () => {
    delete req.userId;

    await requireVerifiedKyc(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(401);
    expect(error.message).toBe("User authentication required");
  });

  it("should fail with 404 if user is not found in database", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    await requireVerifiedKyc(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = next.mock.calls[0][0];
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe("User not found");
  });

  it("should pass (call next with no arguments) if user KYC status is APPROVED", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ kycStatus: KYC_STATUS.APPROVED }),
      }),
    });

    await requireVerifiedKyc(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should pass if user KYC status is VERIFIED", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ kycStatus: KYC_STATUS.VERIFIED }),
      }),
    });

    await requireVerifiedKyc(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("should block with 403 and status NOT_STARTED if KYC is not started", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue({ kycStatus: KYC_STATUS.NOT_STARTED }),
      }),
    });

    await requireVerifiedKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message:
        "KYC verification is required before you can redeem points. Please complete your KYC.",
      data: {
        kycStatus: KYC_STATUS.NOT_STARTED,
        redeemBlocked: true,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should block with 403 and status PENDING if KYC is pending", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ kycStatus: KYC_STATUS.PENDING }),
      }),
    });

    await requireVerifiedKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message:
        "Your KYC verification is pending. You cannot redeem points until your KYC is approved.",
      data: {
        kycStatus: KYC_STATUS.PENDING,
        redeemBlocked: true,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should block with 403 and status REJECTED if KYC is rejected", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ kycStatus: KYC_STATUS.REJECTED }),
      }),
    });

    await requireVerifiedKyc(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: "fail",
      message:
        "Your KYC verification was rejected. Please re-submit your documents to redeem points.",
      data: {
        kycStatus: KYC_STATUS.REJECTED,
        redeemBlocked: true,
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
