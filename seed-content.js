require("dotenv").config();
const connectDB = require("./src/config/mongodb.config");
const Content = require("./src/schemas/content.schema");

const sampleData = [
  {
    title: "Summer Offer",
    subtitle: "Get up to 20% off on premium hydacon products",
    description:
      "Welcome the summer with massive discounts on our premium range. Limited time offer.",
    type: "BANNER",
    placements: ["HOME_TOP_CAROUSEL", "SEASON_LANDING_PAGE"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1572916118970-fb5c8a1cb565?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1572916118970-fb5c8a1cb565?q=80&w=1200&auto=format&fit=crop",
      thumbnail:
        "https://images.unsplash.com/photo-1572916118970-fb5c8a1cb565?q=80&w=200&auto=format&fit=crop",
    },
    action: "OPEN_CATEGORY",
    actionData: "SUMMER2026",
    active: true,
    priority: 10,
    sortOrder: 1,
    startDate: new Date(),
    endDate: new Date(new Date().setMonth(new Date().getMonth() + 1)),
    dismissible: false,
    showOnce: false,
  },
  {
    title: "New Loyalty Season Started",
    subtitle: "2026 Platinum Season",
    description:
      "The new season is here! Start earning points now to win amazing rewards.",
    type: "POPUP",
    popupType: "FULLSCREEN",
    placements: ["HOME_MIDDLE_BANNER", "REWARDS_PAGE"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?q=80&w=1200&auto=format&fit=crop",
      thumbnail:
        "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?q=80&w=200&auto=format&fit=crop",
    },
    action: "OPEN_REWARDS",
    active: true,
    priority: 20,
    sortOrder: 1,
    dismissible: true,
    showOnce: true,
  },
  {
    title: "New Waterproofing Video Tutorial",
    subtitle: "Learn how to apply HydraSeal",
    description: "Watch our latest video guide on achieving the perfect seal.",
    type: "INFORMATION_CARD",
    placements: ["PROFILE", "PRODUCT_SELECTOR"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1581092160562-40aa08e78837?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?q=80&w=1200&auto=format&fit=crop",
    },
    action: "OPEN_INTERNAL_PAGE",
    actionData: "/videos/how-to-apply",
    active: true,
    priority: 5,
    sortOrder: 2,
  },
  {
    title: "Scan & Win Campaign",
    subtitle: "Double points weekend!",
    description:
      "Scan any product QR code this weekend to earn double loyalty points.",
    type: "CAMPAIGN",
    placements: ["SCAN_PAGE", "HOME_BOTTOM_BANNER"],
    images: {
      mobile:
        "https://images.unsplash.com/photo-1517409095697-d8dcde0a9cf1?q=80&w=800&auto=format&fit=crop",
      web: "https://images.unsplash.com/photo-1517409095697-d8dcde0a9cf1?q=80&w=1200&auto=format&fit=crop",
      thumbnail:
        "https://images.unsplash.com/photo-1517409095697-d8dcde0a9cf1?q=80&w=200&auto=format&fit=crop",
    },
    detailImages: [
      "https://images.unsplash.com/photo-1517409095697-d8dcde0a9cf1?q=80&w=1200",
      "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=1200",
    ],
    action: "OPEN_SCAN",
    active: true,
    priority: 15,
    sortOrder: 1,
    tags: ["weekend", "promo", "scan"],
  },
  {
    title: "System Maintenance",
    subtitle: "Scheduled downtime on Saturday",
    description:
      "Please note that the rewards catalog will be down for 2 hours this Saturday for upgrades.",
    type: "ANNOUNCEMENT",
    placements: ["ANNOUNCEMENTS"],
    images: {
      icon: "https://cdn-icons-png.flaticon.com/512/272/272340.png",
    },
    action: "DO_NOTHING",
    active: true,
    priority: 100,
    sortOrder: 0,
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
