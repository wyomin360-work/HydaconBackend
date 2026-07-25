const mongoose = require("mongoose");
const Database = require("../src/config/mongodb.config");
const { Contest } = require("../src/schemas/contest.schema");
const {
  ContestEntry,
  ENTRY_REWARD_STATUS,
} = require("../src/schemas/contest-entry.schema");
const User = require("../src/schemas/user.schema");
const Gift = require("../src/schemas/gift.schema");
const GiftCategory = require("../src/schemas/gift-category.schema");
const GiftRedemption = require("../src/schemas/gift-redemption.schema");
const {
  GIFT_REDEMPTION_STATUS,
  REWARD_CAUSE,
} = require("../src/constants/gift");
const {
  CONTEST_STATUS,
  REWARD_TYPE,
  PRODUCT_SCOPE,
  TIER_SCOPE,
} = require("../src/constants/contests");
const { hashData } = require("../src/utils/heplers");

const sampleCategories = [
  {
    name: "Electronics & Gadgets",
    description: "Smartphones, TVs, Laptops & Accessories",
  },
  {
    name: "Gold & Vehicles",
    description: "Gold coins, vouchers for bikes & scooters",
  },
  {
    name: "Hardware & Tools",
    description: "Power tools and professional equipment",
  },
];

const sampleGiftsData = [
  {
    name: "iPhone 15 Pro (256 GB)",
    description: "Apple iPhone 15 Pro 256GB Natural Titanium",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 50000,
    stockQuantity: 10,
    image: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=500",
  },
  {
    name: "Smart TV 55-inch 4K",
    description: "Samsung 55-inch Crystal 4K UHD Smart TV",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 25000,
    stockQuantity: 15,
    image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500",
  },
  {
    name: "Bosch Heavy Duty Power Tool Kit",
    description:
      "Professional cordless drill, grinder, and impact driver combo kit",
    giftType: "physical",
    categoryName: "Hardware & Tools",
    priceInCoins: 15000,
    stockQuantity: 25,
    image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=500",
  },
  {
    name: "24K 10g Gold Coin",
    description: "Certified 999.9 Purity 10 Gram 24 Karat Gold Coin",
    giftType: "physical",
    categoryName: "Gold & Vehicles",
    priceInCoins: 40000,
    stockQuantity: 20,
    image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=500",
  },
  {
    name: "Yamaha RayZR Scooter Voucher",
    description: "Official vehicle purchase voucher for Yamaha RayZR 125 Fi",
    giftType: "voucher",
    categoryName: "Gold & Vehicles",
    voucherRedemptionType: "code",
    voucherCode: "YAMAHA-RAYZR-2026",
    priceInCoins: 60000,
    stockQuantity: 5,
    image: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?w=500",
  },
  {
    name: "iPad Air 128GB",
    description: "Apple iPad Air M2 11-inch Wi-Fi 128GB",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 30000,
    stockQuantity: 10,
    image: "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=500",
  },
  {
    name: "Honda Activa 6G Scooter",
    description: "Honda Activa 6G Standard Edition Scooter Voucher",
    giftType: "voucher",
    categoryName: "Gold & Vehicles",
    voucherRedemptionType: "code",
    voucherCode: "ACTIVA-6G-MALABAR",
    priceInCoins: 65000,
    stockQuantity: 5,
    image: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?w=500",
  },
  {
    name: "HP Laptop Core i5",
    description: "HP Pavilion 15.6-inch Intel Core i5 16GB RAM 512GB SSD",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 35000,
    stockQuantity: 12,
    image: "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=500",
  },
  {
    name: "Samsung Galaxy Tab S9",
    description: "Samsung Galaxy Tab S9 11-inch 128GB Wi-Fi Tablet",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 28000,
    stockQuantity: 15,
    image: "https://images.unsplash.com/photo-1561154464-82e9adf32764?w=500",
  },
  {
    name: "1 Sovereign (8g) Gold Coin",
    description: "999 Purity 8 Gram (1 Pavan) Gold Coin",
    giftType: "physical",
    categoryName: "Gold & Vehicles",
    priceInCoins: 35000,
    stockQuantity: 30,
    image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=500",
  },
  {
    name: "0.5 Sovereign (4g) Gold Coin",
    description: "999 Purity 4 Gram Gold Coin",
    giftType: "physical",
    categoryName: "Gold & Vehicles",
    priceInCoins: 18000,
    stockQuantity: 40,
    image: "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=500",
  },
  {
    name: "MacBook Air M3 15-inch",
    description: "Apple MacBook Air 15-inch M3 Chip 16GB RAM 512GB SSD",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 75000,
    stockQuantity: 8,
    image: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500",
  },
  {
    name: "Sony 65-inch Bravia OLED TV",
    description: "Sony Bravia XR 65-inch 4K Ultra HD Smart OLED TV",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 70000,
    stockQuantity: 5,
    image: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500",
  },
  {
    name: "Double Door Refrigerator",
    description: "LG 343L 3 Star Frost-Free Double Door Refrigerator",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 22000,
    stockQuantity: 10,
    image: "https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=500",
  },
  {
    name: "Front Load Washing Machine",
    description: "Bosch 8 kg 5 Star Fully Automatic Front Load Washing Machine",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 20000,
    stockQuantity: 10,
    image: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=500",
  },
  {
    name: "Microwave Oven",
    description: "IFB 30L Convection Microwave Oven",
    giftType: "physical",
    categoryName: "Electronics & Gadgets",
    priceInCoins: 8000,
    stockQuantity: 20,
    image: "https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?w=500",
  },
];

const sampleUsersData = [
  {
    name: "Anil Kumar",
    email: "anil.kumar@example.com",
    phone: "9847012345",
    profileImage:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150",
    totalPoints: 14500,
    lifetimePoints: 18200,
    totalScans: 142,
    isActive: true,
  },
  {
    name: "Rahim Panicker",
    email: "rahim.p@example.com",
    phone: "9847023456",
    profileImage:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150",
    totalPoints: 12800,
    lifetimePoints: 15400,
    totalScans: 118,
    isActive: true,
  },
  {
    name: "Suresh Nair",
    email: "suresh.nair@example.com",
    phone: "9847034567",
    profileImage:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150",
    totalPoints: 9600,
    lifetimePoints: 11000,
    totalScans: 89,
    isActive: true,
  },
  {
    name: "Vipin Das",
    email: "vipin.das@example.com",
    phone: "9847045678",
    profileImage:
      "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150",
    totalPoints: 8100,
    lifetimePoints: 9500,
    totalScans: 74,
    isActive: true,
  },
  {
    name: "Mathew George",
    email: "mathew.g@example.com",
    phone: "9847056789",
    profileImage:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
    totalPoints: 6400,
    lifetimePoints: 7200,
    totalScans: 56,
    isActive: true,
  },
];

// Raw definition of contests with clean distinction between GIFT vs POINTS rewards
const rawContestsDefinition = [
  {
    name: "Hydacon Monsoon Plumbers Championship 2026",
    description:
      "A premier monsoon scan contest for registered plumbers and contractors across Kerala. Scan Hydacon CPVC and PVC piping products to collect qualification points and win high-value rewards!",
    bannerImage:
      "https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?w=1200",
    rewardSummary: "Top 3 rankers win iPhone 15 Pro, Smart TV & Bosch Tool Kit",
    startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
    endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000), // in 20 days
    region: "Kerala",
    status: CONTEST_STATUS.ACTIVE,
    productScope: PRODUCT_SCOPE.EVERY_PRODUCT,
    tierScope: TIER_SCOPE.ALL_TIERS,
    prizesRaw: [
      {
        rank: 1,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "iPhone 15 Pro (256 GB)",
      },
      {
        rank: 2,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "Smart TV 55-inch 4K",
      },
      {
        rank: 3,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "Bosch Heavy Duty Power Tool Kit",
      },
      { rank: 4, rewardType: REWARD_TYPE.POINTS, points: 2500 },
      { rank: 5, rewardType: REWARD_TYPE.POINTS, points: 1000 },
    ],
    active: true,
  },
  {
    name: "Kochi Builders Mega Scan Sprint",
    description:
      "Exclusive high-intensity scanning competition for contractors and plumbers in the Kochi metropolitan area. Scan Hydacon Water Storage Tanks and Drainage Systems to dominate the leaderboard.",
    bannerImage:
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=1200",
    rewardSummary:
      "Grand prize of 24K Gold Coin, Yamaha RayZR Scooter & iPad Air",
    startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // in 15 days
    region: "Kochi",
    status: CONTEST_STATUS.ACTIVE,
    productScope: PRODUCT_SCOPE.EVERY_PRODUCT,
    tierScope: TIER_SCOPE.ALL_TIERS,
    prizesRaw: [
      { rank: 1, rewardType: REWARD_TYPE.GIFT, giftName: "24K 10g Gold Coin" },
      {
        rank: 2,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "Yamaha RayZR Scooter Voucher",
      },
      { rank: 3, rewardType: REWARD_TYPE.GIFT, giftName: "iPad Air 128GB" },
      { rank: 4, rewardType: REWARD_TYPE.POINTS, points: 2000 },
    ],
    active: true,
  },
  {
    name: "Malabar CPVC Master Scan Contest",
    description:
      "Regional scanning challenge tailored for CPVC fitting installations in Kozhikode, Kannur, and Malappuram districts. Accumulate maximum points to qualify for high-tier rewards.",
    bannerImage:
      "https://images.unsplash.com/photo-1581094794329-c8112a89af12?w=1200",
    rewardSummary: "Top scanners win Honda Activa 6G Scooter and HP Laptop",
    startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    endDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // in 25 days
    region: "Malabar",
    status: CONTEST_STATUS.ACTIVE,
    productScope: PRODUCT_SCOPE.EVERY_PRODUCT,
    tierScope: TIER_SCOPE.ALL_TIERS,
    prizesRaw: [
      {
        rank: 1,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "Honda Activa 6G Scooter",
      },
      { rank: 2, rewardType: REWARD_TYPE.GIFT, giftName: "HP Laptop Core i5" },
      {
        rank: 3,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "Samsung Galaxy Tab S9",
      },
      { rank: 4, rewardType: REWARD_TYPE.POINTS, points: 3000 },
    ],
    active: true,
  },
  {
    name: "Onam Gold Harvest Contest 2026",
    description:
      "Celebrate the festival of Onam with Hydacon! Scan any Hydacon product line during the festive season to win Sovereign Gold Coins and Mega Bonus Loyalty Points.",
    bannerImage:
      "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200",
    rewardSummary:
      "Grand prize of Sovereign Gold Coins & Bonus Points for Top 5 Scanners",
    startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // in 10 days
    endDate: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000), // in 40 days
    region: "Kerala",
    status: CONTEST_STATUS.UPCOMING,
    productScope: PRODUCT_SCOPE.EVERY_PRODUCT,
    tierScope: TIER_SCOPE.ALL_TIERS,
    prizesRaw: [
      {
        rank: 1,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "1 Sovereign (8g) Gold Coin",
      },
      {
        rank: 2,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "1 Sovereign (8g) Gold Coin",
      },
      {
        rank: 3,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "0.5 Sovereign (4g) Gold Coin",
      },
      { rank: 4, rewardType: REWARD_TYPE.POINTS, points: 5000 },
      { rank: 5, rewardType: REWARD_TYPE.POINTS, points: 2500 },
    ],
    active: true,
  },
  {
    name: "Diwali Festival Scan Bonanza 2026",
    description:
      "Nationwide festive scan extravaganza. All verified users earning double points will automatically enter this grand contest leaderboard.",
    bannerImage:
      "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=1200",
    rewardSummary: "Win Apple MacBook Air M3, Sony OLED TVs & Instant Coins",
    startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // in 30 days
    endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // in 60 days
    region: "Global",
    status: CONTEST_STATUS.UPCOMING,
    productScope: PRODUCT_SCOPE.EVERY_PRODUCT,
    tierScope: TIER_SCOPE.ALL_TIERS,
    prizesRaw: [
      {
        rank: 1,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "MacBook Air M3 15-inch",
      },
      {
        rank: 2,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "Sony 65-inch Bravia OLED TV",
      },
      { rank: 3, rewardType: REWARD_TYPE.POINTS, points: 10000 },
    ],
    active: true,
  },
  {
    name: "Hydacon Summer Plumber Super League 2026",
    description:
      "The concluded annual summer scan leaderboard challenge. Over 50 active trade partners and plumbers participated across South India.",
    bannerImage:
      "https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1200",
    rewardSummary:
      "Over 50 winners awarded bonus points and electronic appliances",
    startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
    endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
    region: "Global",
    status: CONTEST_STATUS.COMPLETED,
    productScope: PRODUCT_SCOPE.EVERY_PRODUCT,
    tierScope: TIER_SCOPE.ALL_TIERS,
    prizesRaw: [
      {
        rank: 1,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "Double Door Refrigerator",
      },
      {
        rank: 2,
        rewardType: REWARD_TYPE.GIFT,
        giftName: "Front Load Washing Machine",
      },
      { rank: 3, rewardType: REWARD_TYPE.GIFT, giftName: "Microwave Oven" },
      { rank: 4, rewardType: REWARD_TYPE.POINTS, points: 3000 },
      { rank: 5, rewardType: REWARD_TYPE.POINTS, points: 1500 },
    ],
    active: true,
  },
];

async function seedDemoContests() {
  const db = new Database();
  try {
    await db.connectDb();
    console.log(
      "🌱 Seeding production-level realistic demo contents for GiftCategories, Gifts, Users & Contests...",
    );

    // 0. Ensure Gift Categories exist
    const categoryMap = {};
    for (const catData of sampleCategories) {
      let cat = await GiftCategory.findOne({ name: catData.name });
      if (!cat) {
        cat = await GiftCategory.create(catData);
        console.log(`  + Created GiftCategory: ${cat.name}`);
      } else {
        console.log(`  ~ Found GiftCategory: ${cat.name}`);
      }
      categoryMap[cat.name] = cat;
    }

    // 1. Create/Ensure Sample Gifts exist
    const giftMap = {};
    for (const gData of sampleGiftsData) {
      let gift = await Gift.findOne({ name: gData.name });
      const cat = categoryMap[gData.categoryName];
      if (!gift) {
        gift = await Gift.create({
          name: gData.name,
          description: gData.description,
          giftType: gData.giftType,
          categoryId: gData.giftType === "physical" ? cat?._id : undefined,
          priceInCoins: gData.priceInCoins,
          stockQuantity: gData.stockQuantity,
          image: gData.image,
          voucherRedemptionType: gData.voucherRedemptionType,
          voucherCode: gData.voucherCode,
        });
        console.log(`  + Created Gift document: ${gift.name}`);
      } else {
        console.log(`  ~ Found existing Gift document: ${gift.name}`);
      }
      giftMap[gift.name] = gift;
    }

    // 2. Ensure sample users exist
    const defaultPassword = await hashData("Password@123");
    const users = [];
    for (const uData of sampleUsersData) {
      let user = await User.findOne({ email: uData.email });
      if (!user) {
        user = await User.create({
          ...uData,
          password: defaultPassword,
        });
        console.log(`  + Created demo user: ${user.name}`);
      } else {
        console.log(`  ~ Found existing demo user: ${user.name}`);
      }
      users.push(user);
    }

    // 3. Remove previous seeded contests with matching names to avoid duplicates
    const contestNames = rawContestsDefinition.map((c) => c.name);
    await Contest.deleteMany({ name: { $in: contestNames } });

    // 4. Construct contests with properly structured prizes (giftId/giftName ONLY for gift rewardType, points ONLY for points rewardType)
    const contestsToInsert = rawContestsDefinition.map((cDef) => {
      const prizes = cDef.prizesRaw.map((p) => {
        if (p.rewardType === REWARD_TYPE.GIFT) {
          const linkedGift = giftMap[p.giftName];
          return {
            rank: p.rank,
            rewardType: REWARD_TYPE.GIFT,
            giftName: p.giftName,
            giftId: linkedGift ? linkedGift._id : undefined,
            points: 0,
          };
        } else {
          return {
            rank: p.rank,
            rewardType: REWARD_TYPE.POINTS,
            points: p.points || 0,
          };
        }
      });

      return {
        name: cDef.name,
        description: cDef.description,
        bannerImage: cDef.bannerImage,
        rewardSummary: cDef.rewardSummary,
        startDate: cDef.startDate,
        endDate: cDef.endDate,
        region: cDef.region,
        status: cDef.status,
        productScope: cDef.productScope,
        tierScope: cDef.tierScope,
        prizes,
        active: cDef.active,
      };
    });

    const createdContests = await Contest.insertMany(contestsToInsert);
    console.log(
      `✅ Successfully created ${createdContests.length} realistic demo contests!`,
    );

    // 5. Create Contest Entries for active & completed contests
    let entryCount = 0;
    const scores = [1850, 1420, 1150, 890, 620];

    for (const contest of createdContests) {
      if (contest.status === CONTEST_STATUS.UPCOMING) continue;

      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        const qualificationPoints =
          scores[i % scores.length] + Math.floor(Math.random() * 50);
        const rank = i + 1;
        const matchingPrize = contest.prizes.find((p) => p.rank === rank);

        let giftRedemptionId = undefined;
        if (
          matchingPrize &&
          matchingPrize.rewardType === REWARD_TYPE.GIFT &&
          matchingPrize.giftId &&
          contest.status === CONTEST_STATUS.COMPLETED
        ) {
          const gift = await Gift.findById(matchingPrize.giftId);
          if (gift) {
            const isVoucher = gift.giftType === "voucher";
            const giftRedemption = await GiftRedemption.create({
              userId: user._id,
              giftId: gift._id,
              coinsUsed: 0,
              giftType: gift.giftType,
              status: isVoucher
                ? GIFT_REDEMPTION_STATUS.DELIVERED
                : GIFT_REDEMPTION_STATUS.PROCESSING,
              isReward: true,
              rewardCause: REWARD_CAUSE.CONTEST,
              rewardCauseId: contest._id,
              rewardCauseTitle: `Contest Win: ${contest.name} (Rank #${rank})`,
              ...(isVoucher && {
                voucherCode: gift.voucherCode || undefined,
                voucherFileUrl: gift.voucherFileUrl || undefined,
                voucherSent: true,
              }),
            });
            giftRedemptionId = giftRedemption._id;
          }
        }

        await ContestEntry.create({
          contestId: contest._id,
          userId: user._id,
          qualificationPoints,
          rank: contest.status === CONTEST_STATUS.COMPLETED ? rank : undefined,
          rewardType: matchingPrize ? matchingPrize.rewardType : null,
          giftRedemptionId,
          bonusPointsAwarded:
            matchingPrize && matchingPrize.rewardType === REWARD_TYPE.POINTS
              ? matchingPrize.points
              : 0,
          rewardStatus:
            contest.status === CONTEST_STATUS.COMPLETED
              ? ENTRY_REWARD_STATUS.CREDITED
              : ENTRY_REWARD_STATUS.PENDING,
        });
        entryCount++;
      }
    }
    console.log(
      `✅ Created ${entryCount} contest entry records for leaderboards and details views!`,
    );

    createdContests.forEach((c) => {
      console.log(`  - [${c.status.toUpperCase()}] [${c.region}] ${c.name}`);
    });
  } catch (error) {
    console.error("❌ Error seeding demo contests:", error);
  } finally {
    await db.disconnectDb();
    process.exit(0);
  }
}

seedDemoContests();
