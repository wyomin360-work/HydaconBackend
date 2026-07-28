/**
 * Referral Lifecycle Integration Test
 *
 * Simulates the full referral journey using an in-memory user store:
 *
 *  Phase 1 — Signup:    User B registers with User A's referral code
 *  Phase 2 — KYC:       User B completes KYC verification
 *  Phase 3 — Scan 1:    First scan triggers milestone reward
 *  Phase 4 — Scan 10:   Tenth scan triggers next milestone
 *  Phase 5 — Scan 50:   50th scan triggers final configured milestone
 *  Phase 6 — Duplicate: Re-running the same scan milestone does NOT re-credit
 *  Phase 7 — Dashboard: Referrer's dashboard reflects correct state at each stage
 */

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

// ─── In-memory user store ─────────────────────────────────────────────────────

const db = {};

function createUser(id, overrides = {}) {
  db[id] = {
    _id: id,
    name: overrides.name || `User ${id}`,
    phone: overrides.phone || `98765${id}`,
    email: overrides.email || `${id}@test.com`,
    referralCode: overrides.referralCode || null,
    referredBy: overrides.referredBy || null,
    totalPoints: 0,
    lifetimePoints: 0,
    totalScans: 0,
    kycStatus: "NOT_STARTED",
    profileCompletionPercentage: 0,
    referralRewardedMilestones: [],
    createdAt: new Date(),
    ...overrides,
  };
  return db[id];
}

function getUser(id) {
  return db[id] ? { ...db[id] } : null;
}

function applyInc(id, inc) {
  Object.entries(inc).forEach(([k, v]) => {
    db[id][k] = (db[id][k] || 0) + v;
  });
}

// ─── AppConfig with milestone rewards ────────────────────────────────────────

const MILESTONE_CONFIG = [
  { requiredScans: 1, referrerRewardPoints: 30, refereeRewardPoints: 20 },
  { requiredScans: 10, referrerRewardPoints: 100, refereeRewardPoints: 75 },
  { requiredScans: 50, referrerRewardPoints: 200, refereeRewardPoints: 150 },
];

function setupAppConfig() {
  AppConfig.findOne.mockReturnValue({
    sort: jest.fn().mockResolvedValue({ referralRewards: MILESTONE_CONFIG }),
  });
}

// ─── Helpers to wire User mock methods to the in-memory store ─────────────────

function wireMocks() {
  // findById
  User.findById.mockImplementation((id) => ({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(getUser(id)),
    }),
    lean: jest.fn().mockResolvedValue(getUser(id)),
  }));

  // find — supports { referredBy } and general queries
  User.find.mockImplementation((query) => {
    let results = Object.values(db);
    if (query?.referredBy !== undefined) {
      results = results.filter(
        (u) => String(u.referredBy) === String(query.referredBy),
      );
    }
    return {
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      lean: jest
        .fn()
        .mockResolvedValue(
          results.map((u) => ({ ...u, _id: { toString: () => u._id } })),
        ),
    };
  });

  // findByIdAndUpdate — apply $inc operations
  User.findByIdAndUpdate.mockImplementation((id, update) => {
    if (update.$inc) applyInc(id, update.$inc);
    return Promise.resolve(getUser(id));
  });

  // findOneAndUpdate — atomic milestone claim
  User.findOneAndUpdate.mockImplementation((filter, update) => {
    const id = filter._id;
    const user = db[id];
    if (!user) return Promise.resolve(null);

    // Check all filter conditions
    if (filter.referredBy?.$ne === null && !user.referredBy)
      return Promise.resolve(null);
    const milestone = filter.referralRewardedMilestones?.$ne;
    if (
      milestone !== undefined &&
      user.referralRewardedMilestones.includes(milestone)
    ) {
      return Promise.resolve(null); // already claimed
    }

    // Apply $addToSet
    if (update.$addToSet?.referralRewardedMilestones !== undefined) {
      const val = update.$addToSet.referralRewardedMilestones;
      if (!user.referralRewardedMilestones.includes(val)) {
        user.referralRewardedMilestones.push(val);
      }
    }

    return Promise.resolve({ ...user, _id: id });
  });
}

// ─── Lifecycle test suite ─────────────────────────────────────────────────────

describe("Referral Full Lifecycle", () => {
  const REFERRER_ID = "referrerA";
  const REFEREE_ID = "refereeB";

  beforeAll(() => {
    // User A — the referrer
    createUser(REFERRER_ID, { name: "Alice", referralCode: "ALICE123" });
    // User B — signs up using Alice's code → referredBy is set at User.create time
    createUser(REFEREE_ID, { name: "Bob", referredBy: REFERRER_ID });

    setupAppConfig();
    wireMocks();
  });

  beforeEach(() => {
    // Re-wire mocks before each test (mocks are not cleared, store persists)
    wireMocks();
    setupAppConfig();
  });

  // ─── Phase 1: Signup ────────────────────────────────────────────────────────

  describe("Phase 1 — Signup", () => {
    it("referee is stored with referredBy pointing to the referrer", () => {
      const bob = getUser(REFEREE_ID);
      expect(bob.referredBy).toBe(REFERRER_ID);
    });

    it("referrer dashboard shows 1 referral in 'joined' status with 0 earnings", async () => {
      const { stats, referrals } =
        await referralService.getMyReferrals(REFERRER_ID);

      expect(stats.totalReferrals).toBe(1);
      expect(stats.totalEarnings).toBe(0);
      expect(referrals[0].status).toBe("joined");
      expect(referrals[0].pointsEarned).toBe(0);
    });

    it("neither party has any points yet", () => {
      expect(getUser(REFERRER_ID).totalPoints).toBe(0);
      expect(getUser(REFEREE_ID).totalPoints).toBe(0);
    });
  });

  // ─── Phase 2: KYC Completion ────────────────────────────────────────────────

  describe("Phase 2 — KYC Completion", () => {
    beforeAll(() => {
      db[REFEREE_ID].kycStatus = "VERIFIED";
      db[REFEREE_ID].profileCompletionPercentage = 80;
    });

    it("referral list shows referee in 'kyc_done' status", async () => {
      const list = await referralService.getMobileReferralList(REFERRER_ID);
      expect(list[0].status).toBe("kyc_done");
    });

    it("referrer stats show 50 earnings (KYC tier) before any scan", async () => {
      const stats = await referralService.getMobileReferralStats(REFERRER_ID);
      expect(stats.totalEarnings).toBe(50);
    });

    it("no points are directly credited on KYC (rewards fire at scan milestones)", () => {
      expect(getUser(REFERRER_ID).totalPoints).toBe(0);
      expect(getUser(REFEREE_ID).totalPoints).toBe(0);
    });
  });

  // ─── Phase 3: First Scan (Milestone 1) ──────────────────────────────────────

  describe("Phase 3 — First Scan (scan milestone: 1)", () => {
    beforeAll(async () => {
      db[REFEREE_ID].totalScans = 1;
      await referralService.evaluateReferralReward(REFEREE_ID, 1);
    });

    it("referee receives 20 points", () => {
      expect(getUser(REFEREE_ID).totalPoints).toBe(20);
      expect(getUser(REFEREE_ID).lifetimePoints).toBe(20);
    });

    it("referrer receives 30 points", () => {
      expect(getUser(REFERRER_ID).totalPoints).toBe(30);
      expect(getUser(REFERRER_ID).lifetimePoints).toBe(30);
    });

    it("milestone 1 is recorded on the referee to prevent duplicate reward", () => {
      expect(getUser(REFEREE_ID).referralRewardedMilestones).toContain(1);
    });

    it("referral list shows referee in 'scanned' status", async () => {
      const list = await referralService.getMobileReferralList(REFERRER_ID);
      expect(list[0].status).toBe("scanned");
      expect(list[0].scans).toBe(1);
    });

    it("re-triggering scan 1 does NOT duplicate the reward (idempotency)", async () => {
      const pointsBefore = getUser(REFEREE_ID).totalPoints;
      await referralService.evaluateReferralReward(REFEREE_ID, 1);
      expect(getUser(REFEREE_ID).totalPoints).toBe(pointsBefore);
    });
  });

  // ─── Phase 4: Intermediate Scans 2–9 (no milestone) ────────────────────────

  describe("Phase 4 — Scans 2 through 9 (no milestone, no reward)", () => {
    beforeAll(async () => {
      for (let scan = 2; scan <= 9; scan++) {
        db[REFEREE_ID].totalScans = scan;
        await referralService.evaluateReferralReward(REFEREE_ID, scan);
      }
    });

    it("no additional points are credited between milestones", () => {
      expect(getUser(REFEREE_ID).totalPoints).toBe(20); // unchanged from scan 1
      expect(getUser(REFERRER_ID).totalPoints).toBe(30); // unchanged from scan 1
    });

    it("only milestone 1 remains in the claimed list", () => {
      expect(getUser(REFEREE_ID).referralRewardedMilestones).toEqual([1]);
    });
  });

  // ─── Phase 5: Tenth Scan (Milestone 10) ─────────────────────────────────────

  describe("Phase 5 — Tenth Scan (scan milestone: 10)", () => {
    beforeAll(async () => {
      db[REFEREE_ID].totalScans = 10;
      await referralService.evaluateReferralReward(REFEREE_ID, 10);
    });

    it("referee receives 75 more points (total 95)", () => {
      expect(getUser(REFEREE_ID).totalPoints).toBe(95); // 20 + 75
    });

    it("referrer receives 100 more points (total 130)", () => {
      expect(getUser(REFERRER_ID).totalPoints).toBe(130); // 30 + 100
    });

    it("milestone 10 is added to the claimed list", () => {
      expect(getUser(REFEREE_ID).referralRewardedMilestones).toContain(10);
    });

    it("re-running scan 10 does NOT credit again", async () => {
      const refereePts = getUser(REFEREE_ID).totalPoints;
      const referrerPts = getUser(REFERRER_ID).totalPoints;
      await referralService.evaluateReferralReward(REFEREE_ID, 10);
      expect(getUser(REFEREE_ID).totalPoints).toBe(refereePts);
      expect(getUser(REFERRER_ID).totalPoints).toBe(referrerPts);
    });
  });

  // ─── Phase 6: Intermediate Scans 11–49 (no milestone) ───────────────────────

  describe("Phase 6 — Scans 11 through 49 (no milestone)", () => {
    beforeAll(async () => {
      for (let scan = 11; scan <= 49; scan++) {
        db[REFEREE_ID].totalScans = scan;
        await referralService.evaluateReferralReward(REFEREE_ID, scan);
      }
    });

    it("points do not change during non-milestone scans", () => {
      expect(getUser(REFEREE_ID).totalPoints).toBe(95);
      expect(getUser(REFERRER_ID).totalPoints).toBe(130);
    });
  });

  // ─── Phase 7: 50th Scan (Milestone 50) ──────────────────────────────────────

  describe("Phase 7 — 50th Scan (scan milestone: 50)", () => {
    beforeAll(async () => {
      db[REFEREE_ID].totalScans = 50;
      await referralService.evaluateReferralReward(REFEREE_ID, 50);
    });

    it("referee receives 150 more points (total 245)", () => {
      expect(getUser(REFEREE_ID).totalPoints).toBe(245); // 95 + 150
    });

    it("referrer receives 200 more points (total 330)", () => {
      expect(getUser(REFERRER_ID).totalPoints).toBe(330); // 130 + 200
    });

    it("all three milestones are now in the claimed list", () => {
      expect(getUser(REFEREE_ID).referralRewardedMilestones.sort()).toEqual([
        1, 10, 50,
      ]);
    });

    it("re-running scan 50 does NOT credit again", async () => {
      const refereePts = getUser(REFEREE_ID).totalPoints;
      const referrerPts = getUser(REFERRER_ID).totalPoints;
      await referralService.evaluateReferralReward(REFEREE_ID, 50);
      expect(getUser(REFEREE_ID).totalPoints).toBe(refereePts);
      expect(getUser(REFERRER_ID).totalPoints).toBe(referrerPts);
    });
  });

  // ─── Phase 8: Final Dashboard State ─────────────────────────────────────────

  describe("Phase 8 — Final Dashboard State", () => {
    it("getMyReferrals returns correct final aggregate for the referrer", async () => {
      const { stats, referrals } =
        await referralService.getMyReferrals(REFERRER_ID);

      expect(stats.totalReferrals).toBe(1);
      // totalEarnings in stats reflects display points (150 flat for scanned user)
      expect(stats.totalEarnings).toBe(150);
      expect(referrals[0].status).toBe("scanned");
      expect(referrals[0].scans).toBe(50);
    });

    it("referee's lifetime points match cumulative milestone rewards", () => {
      // 20 (scan 1) + 75 (scan 10) + 150 (scan 50)
      expect(getUser(REFEREE_ID).lifetimePoints).toBe(245);
    });

    it("referrer's lifetime points match cumulative milestone rewards", () => {
      // 30 (scan 1) + 100 (scan 10) + 200 (scan 50)
      expect(getUser(REFERRER_ID).lifetimePoints).toBe(330);
    });
  });
});
