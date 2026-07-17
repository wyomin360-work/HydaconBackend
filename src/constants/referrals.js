const REFERRAL_MILESTONES = {
  FIRST_SCAN: "first_scan",
  KYC_VERIFICATION: "kyc_verification",
  FIRST_TIER_UP: "first_tier_up",
  CASH_WITHDRAWAL: "cash_withdrawal",
  DAILY_SCAN: "daily_scan",
};

const REFERRAL_MILESTONE_DETAILS = {
  [REFERRAL_MILESTONES.FIRST_SCAN]: {
    points: 1000,
    name: "1st scan by your friend",
    label: "Get 1000 points on 1st scan by your friend",
  },
  [REFERRAL_MILESTONES.KYC_VERIFICATION]: {
    points: 500,
    name: "when they verify KYC",
    label: "Get 500 points when they verify KYC",
  },
  [REFERRAL_MILESTONES.FIRST_TIER_UP]: {
    points: 250,
    name: "when they tier up",
    label: "Get 250 points when they tier up",
  },
  [REFERRAL_MILESTONES.CASH_WITHDRAWAL]: {
    points: 100,
    name: "on their first cash withdrawal",
    label: "Get 100 points on their first cash withdrawal",
  },
  [REFERRAL_MILESTONES.DAILY_SCAN]: {
    points: 10,
    name: "when they scan daily",
    label: "Get 10 points when they scan daily",
  },
};

module.exports = { REFERRAL_MILESTONES, REFERRAL_MILESTONE_DETAILS };
