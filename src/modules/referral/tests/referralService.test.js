jest.mock("../../../schemas/user.schema");
jest.mock("../../../schemas/app-config.schema");
jest.mock("../../../utils/responseHandlers", () => ({
  sendFailResponse: jest.fn((msg, code) => {
    const err = new Error(msg);
    err.statusCode = code || 400;
    throw err;
  }),
}));

const referralService = require("../referral.service");
const User = require("../../../schemas/user.schema");
const AppConfig = require("../../../schemas/app-config.schema");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeId = () => `user_${Math.random().toString(36).slice(2)}`;

const makeUser = (overrides = {}) => ({
  _id: { toString: () => overrides.id || makeId() },
  name: "Test User",
  phone: "9876543210",
  email: "test@example.com",
  totalScans: 0,
  kycStatus: "NOT_STARTED",
  referralCode: "CODE123",
  referredBy: null,
  createdAt: new Date("2024-01-15T10:00:00Z"),
  ...overrides,
});

// ─── getMobileReferralStats ────────────────────────────────────────────────────

describe("getMobileReferralStats", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns zero totals when user has no referrals", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ referralCode: "CODE123" }),
      }),
    });
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });

    const result = await referralService.getMobileReferralStats("inviter1");

    expect(result.totalReferrals).toBe(0);
    expect(result.totalPoints).toBe(0);
    expect(result.totalEarnings).toBe(0);
    expect(result.referralCode).toBe("CODE123");
    expect(result.referralLink).toBe("https://hydacon.com/r/CODE123");
  });

  it("earns 150 points per referred user who has scanned", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ referralCode: "ABC" }),
      }),
    });
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { totalScans: 3, kycStatus: "VERIFIED" },
          { totalScans: 1, kycStatus: "NOT_STARTED" },
        ]),
      }),
    });

    const result = await referralService.getMobileReferralStats("inviter1");

    expect(result.totalReferrals).toBe(2);
    expect(result.totalEarnings).toBe(300); // 2 × 150
  });

  it("earns 50 points per referred user who is KYC verified but hasn't scanned", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ referralCode: "XYZ" }),
      }),
    });
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { totalScans: 0, kycStatus: "VERIFIED" },
          { totalScans: 0, kycStatus: "VERIFIED" },
        ]),
      }),
    });

    const result = await referralService.getMobileReferralStats("inviter1");

    expect(result.totalEarnings).toBe(100); // 2 × 50
  });

  it("earns 0 points for a referred user who only joined (no scans, no KYC)", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ referralCode: "XYZ" }),
      }),
    });
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest
          .fn()
          .mockResolvedValue([{ totalScans: 0, kycStatus: "NOT_STARTED" }]),
      }),
    });

    const result = await referralService.getMobileReferralStats("inviter1");

    expect(result.totalEarnings).toBe(0);
  });

  it("returns empty referralCode and referralLink when inviter has no code", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });
    User.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });

    const result = await referralService.getMobileReferralStats("inviter1");

    expect(result.referralCode).toBe("");
    expect(result.referralLink).toBe("https://hydacon.com/r/");
  });
});

// ─── getMobileReferralList ─────────────────────────────────────────────────────

describe("getMobileReferralList", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an empty array when no one was referred", async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await referralService.getMobileReferralList("inviter1");

    expect(result).toEqual([]);
  });

  it("maps a scanned user to status=scanned with 150 points", async () => {
    const userId = makeId();
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          makeUser({ id: userId, totalScans: 5, kycStatus: "VERIFIED" }),
        ]),
    });

    const [entry] = await referralService.getMobileReferralList("inviter1");

    expect(entry.status).toBe("scanned");
    expect(entry.pointsEarned).toBe(150);
    expect(entry.scans).toBe(5);
  });

  it("maps a KYC-verified user with 0 scans to status=kyc_done with 50 points", async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          makeUser({ totalScans: 0, kycStatus: "VERIFIED" }),
        ]),
    });

    const [entry] = await referralService.getMobileReferralList("inviter1");

    expect(entry.status).toBe("kyc_done");
    expect(entry.pointsEarned).toBe(50);
  });

  it("maps a user who only joined (no scans, no KYC) to status=joined with 0 points", async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          makeUser({ totalScans: 0, kycStatus: "NOT_STARTED" }),
        ]),
    });

    const [entry] = await referralService.getMobileReferralList("inviter1");

    expect(entry.status).toBe("joined");
    expect(entry.pointsEarned).toBe(0);
  });

  it("falls back to phone number when user has no name", async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          makeUser({ name: undefined, phone: "9999988888" }),
        ]),
    });

    const [entry] = await referralService.getMobileReferralList("inviter1");

    expect(entry.name).toBe("9999988888");
  });

  it("falls back to 'Unknown User' when user has no name and no phone", async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([makeUser({ name: undefined, phone: undefined })]),
    });

    const [entry] = await referralService.getMobileReferralList("inviter1");

    expect(entry.name).toBe("Unknown User");
  });

  it("formats joinedDate from createdAt", async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue([
          makeUser({ createdAt: new Date("2024-03-05T00:00:00Z") }),
        ]),
    });

    const [entry] = await referralService.getMobileReferralList("inviter1");

    expect(entry.joinedDate).toBe("5 Mar 2024");
  });

  it("returns 'Pending' when createdAt is missing", async () => {
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([makeUser({ createdAt: null })]),
    });

    const [entry] = await referralService.getMobileReferralList("inviter1");

    expect(entry.joinedDate).toBe("Pending");
  });
});

// ─── getMyReferrals ────────────────────────────────────────────────────────────

describe("getMyReferrals", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns an object with stats and referrals keys", async () => {
    // Stats query
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ referralCode: "CODE" }),
      }),
    });
    // List and stats both use User.find
    User.find.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    const result = await referralService.getMyReferrals("inviter1");

    expect(result).toHaveProperty("stats");
    expect(result).toHaveProperty("referrals");
    expect(Array.isArray(result.referrals)).toBe(true);
  });
});

// ─── sendReminderByUserId ──────────────────────────────────────────────────────

describe("sendReminderByUserId", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns acknowledgement message when user exists", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "uid1", name: "Alice" }),
      }),
    });

    const result = await referralService.sendReminderByUserId("uid1");

    expect(result.message).toBe("Reminder acknowledged.");
    expect(result.data.referredUserId).toBe("uid1");
  });

  it("throws when user is not found", async () => {
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });

    await expect(
      referralService.sendReminderByUserId("missing"),
    ).rejects.toThrow("User not found.");
  });
});

// ─── evaluateReferralReward ────────────────────────────────────────────────────

describe("evaluateReferralReward", () => {
  beforeEach(() => jest.clearAllMocks());

  const mockConfig = (rewards) => {
    AppConfig.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ referralRewards: rewards }),
    });
  };

  it("does nothing when no AppConfig exists", async () => {
    AppConfig.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null),
    });

    await referralService.evaluateReferralReward("u1", 1);

    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when referralRewards is not an array", async () => {
    AppConfig.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue({ referralRewards: null }),
    });

    await referralService.evaluateReferralReward("u1", 1);

    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when scan count does not match any milestone", async () => {
    mockConfig([
      { requiredScans: 5, referrerRewardPoints: 50, refereeRewardPoints: 50 },
    ]);

    await referralService.evaluateReferralReward("u1", 3);

    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("credits both referee and referrer when milestone is first hit", async () => {
    mockConfig([
      { requiredScans: 10, referrerRewardPoints: 100, refereeRewardPoints: 75 },
    ]);

    const referrerId = "referrer1";
    User.findOneAndUpdate.mockResolvedValue({
      _id: "u1",
      referredBy: referrerId,
    });
    User.findByIdAndUpdate.mockResolvedValue({});

    await referralService.evaluateReferralReward("u1", 10);

    // Atomic milestone claim
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "u1",
        referralRewardedMilestones: { $ne: 10 },
      }),
      { $addToSet: { referralRewardedMilestones: 10 } },
      expect.any(Object),
    );

    // Referee credited
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("u1", {
      $inc: { totalPoints: 75, lifetimePoints: 75 },
    });

    // Referrer credited
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(referrerId, {
      $inc: { totalPoints: 100, lifetimePoints: 100 },
    });
  });

  it("does NOT credit again when milestone was already claimed (findOneAndUpdate returns null)", async () => {
    mockConfig([
      { requiredScans: 10, referrerRewardPoints: 100, refereeRewardPoints: 75 },
    ]);

    // Simulates the $ne guard blocking — returns null meaning already claimed
    User.findOneAndUpdate.mockResolvedValue(null);

    await referralService.evaluateReferralReward("u1", 10);

    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("does NOT credit when user has no referredBy (not referred)", async () => {
    mockConfig([
      { requiredScans: 1, referrerRewardPoints: 50, refereeRewardPoints: 50 },
    ]);

    // findOneAndUpdate returns null because referredBy condition ($ne null) failed
    User.findOneAndUpdate.mockResolvedValue(null);

    await referralService.evaluateReferralReward("u1", 1);

    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("skips referee credit when refereeRewardPoints is 0", async () => {
    mockConfig([
      { requiredScans: 5, referrerRewardPoints: 50, refereeRewardPoints: 0 },
    ]);

    User.findOneAndUpdate.mockResolvedValue({ referredBy: "ref1" });
    User.findByIdAndUpdate.mockResolvedValue({});

    await referralService.evaluateReferralReward("u1", 5);

    // Referrer still credited, referee skipped
    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("ref1", {
      $inc: { totalPoints: 50, lifetimePoints: 50 },
    });
  });

  it("skips referrer credit when referrerRewardPoints is 0", async () => {
    mockConfig([
      { requiredScans: 5, referrerRewardPoints: 0, refereeRewardPoints: 75 },
    ]);

    User.findOneAndUpdate.mockResolvedValue({ referredBy: "ref1" });
    User.findByIdAndUpdate.mockResolvedValue({});

    await referralService.evaluateReferralReward("u1", 5);

    // Referee credited, referrer skipped
    expect(User.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("u1", {
      $inc: { totalPoints: 75, lifetimePoints: 75 },
    });
  });

  it("matches the correct milestone when multiple are configured", async () => {
    mockConfig([
      { requiredScans: 1, referrerRewardPoints: 30, refereeRewardPoints: 20 },
      { requiredScans: 10, referrerRewardPoints: 100, refereeRewardPoints: 75 },
      {
        requiredScans: 15,
        referrerRewardPoints: 200,
        refereeRewardPoints: 150,
      },
    ]);

    User.findOneAndUpdate.mockResolvedValue({ referredBy: "ref1" });
    User.findByIdAndUpdate.mockResolvedValue({});

    await referralService.evaluateReferralReward("u1", 10);

    // Only the 10-scan milestone values should be used
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("u1", {
      $inc: { totalPoints: 75, lifetimePoints: 75 },
    });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith("ref1", {
      $inc: { totalPoints: 100, lifetimePoints: 100 },
    });
  });

  it("swallows errors and does not rethrow", async () => {
    AppConfig.findOne.mockReturnValue({
      sort: jest.fn().mockRejectedValue(new Error("DB connection lost")),
    });

    await expect(
      referralService.evaluateReferralReward("u1", 1),
    ).resolves.toBeUndefined();
  });
});
