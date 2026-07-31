require("dotenv").config();
const connectDB = require("./src/config/mongodb.config");
const Content = require("./src/schemas/content.schema");

const sampleData = [
  // ── HOME TOP CAROUSEL (BANNERS) ──
  {
    title: "Introducing HydraShield Pro",
    subtitle: "Next-Gen Waterproofing Membrane",
    description:
      "Experience 100% leak protection with our advanced polymer-modified fiber-reinforced waterproofing coat. Earn 5x loyalty points this week.",
    type: "BANNER",
    placements: ["HOME_TOP_CAROUSEL"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=1200&auto=format&fit=crop",
      thumbnail:
        "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=200&auto=format&fit=crop",
    },
    action: "OPEN_PRODUCT",
    actionData: "hydrashield-pro",
    active: true,
    priority: 30,
    sortOrder: 1,
  },
  {
    title: "Double Points Bonanza",
    subtitle: "Scan & Earn 2x Points on All Grouts",
    description:
      "Boost your loyalty balance instantly. Double points apply to all Hydacon Epoxy & Cementitious Grout scans till Sunday.",
    type: "BANNER",
    placements: ["HOME_TOP_CAROUSEL"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?q=80&w=1200&auto=format&fit=crop",
      thumbnail:
        "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?q=80&w=200&auto=format&fit=crop",
    },
    action: "OPEN_SCAN",
    active: true,
    priority: 25,
    sortOrder: 2,
  },
  {
    title: "Exclusive Contractor Meet 2026",
    subtitle: "Join the Platinum League",
    description:
      "Register for the biggest construction technology summit of the year. Connect with industry experts and see live demos.",
    type: "BANNER",
    placements: ["HOME_TOP_CAROUSEL", "SEASON_LANDING_PAGE"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop",
      thumbnail:
        "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=200&auto=format&fit=crop",
    },
    action: "OPEN_EXTERNAL_URL",
    actionData: "https://hydacon.com/contractor-meet-2026",
    active: true,
    priority: 20,
    sortOrder: 3,
  },

  // ── HOME MIDDLE BANNER (BANNERS) ──
  {
    title: "Calculate Tile Grout Easily",
    subtitle: "Try Grout Coverage Estimator",
    description:
      "Never run out of material again. Enter tile dimensions and get instant pack recommendations.",
    type: "BANNER",
    placements: ["HOME_MIDDLE_BANNER", "COVERAGE_CALCULATOR"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop",
      thumbnail:
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=200&auto=format&fit=crop",
    },
    action: "OPEN_COVERAGE_CALCULATOR",
    active: true,
    priority: 15,
    sortOrder: 1,
  },
  {
    title: "Claim Cashback Vouchers",
    subtitle: "Direct Bank Transfer Vouchers",
    description:
      "Redeem your Hydacon reward points for cash vouchers transferred straight to your bank account.",
    type: "BANNER",
    placements: ["HOME_MIDDLE_BANNER", "REWARDS_PAGE"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=1200&auto=format&fit=crop",
      thumbnail:
        "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?q=80&w=200&auto=format&fit=crop",
    },
    action: "OPEN_REWARDS",
    active: true,
    priority: 10,
    sortOrder: 2,
  },

  // ── HOME BOTTOM BANNER ──
  {
    title: "Upgrade to HydraGrip Elite",
    subtitle: "High performance Tile Adhesive",
    description:
      "Engineered for heavy format tiles and marble. Anti-slump, zero slip, and extra-long open time.",
    type: "BANNER",
    placements: ["HOME_BOTTOM_BANNER", "PRODUCT_SELECTOR"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=1200&auto=format&fit=crop",
    },
    action: "OPEN_PRODUCT",
    actionData: "hydragrip-elite",
    active: true,
    priority: 10,
    sortOrder: 1,
  },
  {
    title: "Unlock Premium Toolkits",
    subtitle: "Exclusive Gift Catalogue Items",
    description:
      "Get original Makita drill machines, laser levels, and heavy-duty trowels by redeeming your loyalty points.",
    type: "BANNER",
    placements: ["HOME_BOTTOM_BANNER", "GIFT_CATALOGUE"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1534224039826-c7a0dea0e66a?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1534224039826-c7a0dea0e66a?q=80&w=1200&auto=format&fit=crop",
    },
    action: "OPEN_INTERNAL_PAGE",
    actionData: "Route_Gift_Catalogue",
    active: true,
    priority: 5,
    sortOrder: 2,
  },

  // ── INDIVIDUAL SCREENS (BANNERS / CAMPAIGNS) ──
  {
    title: "Hydacon Loyalty App Guide",
    subtitle: "Complete Profile & Start Scans",
    description:
      "Get access to all application widgets, view tutorials, and track your daily reward success stats.",
    type: "BANNER",
    placements: ["PROFILE"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=800&auto=format&fit=crop",
    },
    action: "OPEN_INTERNAL_PAGE",
    actionData: "Route_Profile_Settings",
    active: true,
    priority: 10,
    sortOrder: 1,
  },
  {
    title: "Double Rewards on Scan Page",
    subtitle: "Scan original Hydacon QR tags",
    description:
      "Validate authenticity and credit points instantly. Read QR tags clearly under good lighting.",
    type: "BANNER",
    placements: ["SCAN_PAGE"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1614741118887-7a4ee193a5fa?q=80&w=800&auto=format&fit=crop",
    },
    action: "OPEN_SCAN",
    active: true,
    priority: 10,
    sortOrder: 1,
  },
  {
    title: "Mega Lucky Draw!",
    subtitle: "Scan more to win a bike",
    description:
      "Every 1,000 points earned adds a lucky draw ticket to your name. Winner announced end of season.",
    type: "CAMPAIGN",
    placements: ["SEASON_CAMPAIGN"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1485965120184-e220f721d03e?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1485965120184-e220f721d03e?q=80&w=1200",
    },
    action: "OPEN_CAMPAIGN_DETAILS",
    active: true,
    priority: 10,
    sortOrder: 1,
  },
  {
    title: "Points Credited Successfully!",
    subtitle: "Congratulations!",
    description:
      "You've successfully secured authentic points. Browse the Gift Catalogue for matching redemptions.",
    type: "BANNER",
    placements: ["REWARD_SUCCESS_SCREEN"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1513151233558-d860c5398176?q=80&w=800&auto=format&fit=crop",
    },
    action: "OPEN_REWARDS",
    active: true,
    priority: 10,
    sortOrder: 1,
  },

  // ── ANNOUNCEMENTS ──
  {
    title: "Weekend Bank Settlement Delay",
    subtitle: "IMPS Transfers Update",
    description:
      "Bank transfers initiated between Sat 6 PM to Sun midnight will be processed on Monday morning.",
    type: "ANNOUNCEMENT",
    placements: ["ANNOUNCEMENTS", "HOME_ANNOUNCEMENT_FEED"],
    images: {
      icon: "https://cdn-icons-png.flaticon.com/512/2845/2845722.png",
    },
    action: "DO_NOTHING",
    active: true,
    priority: 50,
    sortOrder: 1,
  },
  {
    title: "New Product Category Added",
    subtitle: "Dry-mix Screeds & Plasters",
    description:
      "Check out our newly launched high-strength underlayment screeds. Available with promotional point payouts.",
    type: "ANNOUNCEMENT",
    placements: ["ANNOUNCEMENTS", "HOME_ANNOUNCEMENT_FEED"],
    images: {
      icon: "https://cdn-icons-png.flaticon.com/512/3067/3067451.png",
    },
    action: "OPEN_PRODUCT_SELECTOR",
    active: true,
    priority: 45,
    sortOrder: 2,
  },

  // ── POPUPS (ALL POPUP PLACEMENTS) ──
  {
    title: "Season Opening Bonanza!",
    subtitle: "Welcome to Hydacon 2026",
    description:
      "New tasks, higher point milestones, and a completely refreshed gift catalog awaits. Let's build together!",
    type: "POPUP",
    popupType: "FULLSCREEN",
    placements: ["HOME_OPENING"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=800&auto=format&fit=crop",
    },
    action: "DO_NOTHING",
    active: true,
    priority: 10,
    sortOrder: 1,
    dismissible: true,
  },
  {
    title: "Maximize Redemptions",
    subtitle: "Exclusive Platinum Rewards",
    description:
      "Get premium rewards with lower point requirements this weekend only.",
    type: "POPUP",
    popupType: "BOTTOM_SHEET",
    placements: ["REWARDS_OPENING"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1542838132-92c53300491e?q=80&w=800&auto=format&fit=crop",
    },
    action: "OPEN_REWARDS",
    active: true,
    priority: 10,
    sortOrder: 1,
    dismissible: true,
  },
  {
    title: "Tips for Faster QR Scanning",
    subtitle: "Camera Access & Lighting",
    description:
      "Avoid direct reflections. Hold the device 10-15cm away from the packaging tag.",
    type: "POPUP",
    popupType: "BOTTOM_SHEET",
    placements: ["SCAN_OPENING"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1517409095697-d8dcde0a9cf1?q=80&w=800&auto=format&fit=crop",
    },
    action: "OPEN_SCAN",
    active: true,
    priority: 10,
    sortOrder: 1,
    dismissible: true,
  },
  {
    title: "Add Bank Details Now",
    subtitle: "Complete Profile Verification",
    description:
      "Submit your KYC details to instantly unlock real-time UPI and bank transfer rewards.",
    type: "POPUP",
    popupType: "FULLSCREEN",
    placements: ["PROFILE_OPENING"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?q=80&w=800&auto=format&fit=crop",
    },
    action: "OPEN_INTERNAL_PAGE",
    actionData: "Route_Edit_Profile",
    active: true,
    priority: 10,
    sortOrder: 1,
    dismissible: true,
  },
  {
    title: "Winter Festival Active",
    subtitle: "Explore Special Campaigns",
    description:
      "Join the regional leaderboards and check active contractor milestones to win mega jackpots.",
    type: "POPUP",
    popupType: "FULLSCREEN",
    placements: ["SEASON_LANDING_OPENING"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1482862549707-f63cb32c5fd9?q=80&w=800&auto=format&fit=crop",
    },
    action: "OPEN_CAMPAIGN_DETAILS",
    active: true,
    priority: 10,
    sortOrder: 1,
    dismissible: true,
  },
  {
    title: "Which Product is Right for You?",
    subtitle: "Find matching materials in seconds",
    description:
      "Select your project type, substrates, and tile specifications to get direct suggestions.",
    type: "POPUP",
    popupType: "BOTTOM_SHEET",
    placements: ["PRODUCT_SELECTOR_OPENING"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=800&auto=format&fit=crop",
    },
    action: "OPEN_PRODUCT_SELECTOR",
    active: true,
    priority: 10,
    sortOrder: 1,
    dismissible: true,
  },
];

const seedData = async () => {
  try {
    const Database = require("./src/config/mongodb.config");
    const db = new Database();
    await db.connectDb();
    console.log("Connected to MongoDB.");

    // Clear existing content to avoid duplicates during seeding
    await Content.deleteMany({});
    console.log("Cleared existing content.");

    await Content.insertMany(sampleData);
    console.log("Sample content seeded successfully!");

    process.exit(0);
  } catch (error) {
    console.error("Error seeding data:", error);
    process.exit(1);
  }
};

seedData();
