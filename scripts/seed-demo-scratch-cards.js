const mongoose = require("mongoose");
const Database = require("../src/config/mongodb.config");
const ScratchCardRule = require("../src/schemas/scratch-card-rule.schema");
const Gift = require("../src/schemas/gift.schema");

const sampleScratchCardsDefinition = [
  {
    name: "Hydacon Monsoon Gold & Coin Jackpot 2026",
    description:
      "Scan Hydacon products during the monsoon season to unlock instant Scratch Cards! Win Gold Coins, Bosch Tool Kits, Bonus Loyalty Coins, and mega points.",
    startDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
    endDate: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000), // in 25 days
    active: true,
    totalScratchLimit: 2500,
    perUserScratchLimit: 5,
    rewardsRaw: [
      {
        rewardType: "GIFT",
        giftName: "iPhone 15 Pro (256 GB)",
        stockLimit: 3,
        probability: 5,
      },
      {
        rewardType: "GIFT",
        giftName: "24K 10g Gold Coin",
        stockLimit: 5,
        probability: 10,
      },
      {
        rewardType: "GIFT",
        giftName: "Bosch Heavy Duty Power Tool Kit",
        stockLimit: 15,
        probability: 15,
      },
      {
        rewardType: "COIN",
        minCoins: 500,
        maxCoins: 2000,
        stockLimit: 500,
        probability: 35,
      },
      {
        rewardType: "BONUS_POINTS",
        minPoints: 200,
        maxPoints: 1000,
        stockLimit: 1000,
        probability: 35,
      },
    ],
  },
  {
    name: "Kochi Builders Instant Prize Scratch",
    description:
      "Instant reward scratch cards for registered contractors and plumbers in Kochi. Scratch to win iPad Air, Smart TVs, or instant Hydacon coins.",
    startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // in 15 days
    active: true,
    totalScratchLimit: 1000,
    perUserScratchLimit: 3,
    rewardsRaw: [
      {
        rewardType: "GIFT",
        giftName: "iPad Air 128GB",
        stockLimit: 5,
        probability: 10,
      },
      {
        rewardType: "GIFT",
        giftName: "Smart TV 55-inch 4K",
        stockLimit: 8,
        probability: 15,
      },
      {
        rewardType: "COIN",
        minCoins: 250,
        maxCoins: 1000,
        stockLimit: 300,
        probability: 45,
      },
      {
        rewardType: "BONUS_POINTS",
        minPoints: 150,
        maxPoints: 500,
        stockLimit: 500,
        probability: 30,
      },
    ],
  },
  {
    name: "Onam Mega Festival Scratch Bonanza",
    description:
      "Grand festive Onam scratch card event across Kerala! Every scan guarantees a reward including 1 Sovereign Gold Coins, Honda Activa Scooters, and 5,000 Bonus Coins.",
    startDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), // in 12 days
    endDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // in 45 days
    active: true,
    totalScratchLimit: 5000,
    perUserScratchLimit: 10,
    rewardsRaw: [
      {
        rewardType: "GIFT",
        giftName: "Honda Activa 6G Scooter",
        stockLimit: 2,
        probability: 5,
      },
      {
        rewardType: "GIFT",
        giftName: "1 Sovereign (8g) Gold Coin",
        stockLimit: 10,
        probability: 15,
      },
      {
        rewardType: "COIN",
        minCoins: 1000,
        maxCoins: 5000,
        stockLimit: 1000,
        probability: 40,
      },
      {
        rewardType: "BONUS_POINTS",
        minPoints: 500,
        maxPoints: 2500,
        stockLimit: 2000,
        probability: 40,
      },
    ],
  },
  {
    name: "Diwali Tech & Laptop Scratch Carnival",
    description:
      "Festival of lights special. Win MacBook Air M3, HP Core i5 Laptops, Sony OLED TVs, or instant high-value coin bundles.",
    startDate: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000), // in 35 days
    endDate: new Date(Date.now() + 65 * 24 * 60 * 60 * 1000), // in 65 days
    active: true,
    totalScratchLimit: 3000,
    perUserScratchLimit: 5,
    rewardsRaw: [
      {
        rewardType: "GIFT",
        giftName: "MacBook Air M3 15-inch",
        stockLimit: 3,
        probability: 5,
      },
      {
        rewardType: "GIFT",
        giftName: "HP Laptop Core i5",
        stockLimit: 10,
        probability: 15,
      },
      {
        rewardType: "GIFT",
        giftName: "Sony 65-inch Bravia OLED TV",
        stockLimit: 5,
        probability: 10,
      },
      {
        rewardType: "COIN",
        minCoins: 500,
        maxCoins: 3000,
        stockLimit: 800,
        probability: 40,
      },
      {
        rewardType: "BONUS_POINTS",
        minPoints: 300,
        maxPoints: 1500,
        stockLimit: 1200,
        probability: 30,
      },
    ],
  },
  {
    name: "Hydacon Summer Trade Plumber League (Expired)",
    description:
      "Concluded summer campaign rewarding trade partners with home appliances, washing machines, and microwave ovens.",
    startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
    endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago
    active: false,
    totalScratchLimit: 1500,
    perUserScratchLimit: 4,
    rewardsRaw: [
      {
        rewardType: "GIFT",
        giftName: "Double Door Refrigerator",
        stockLimit: 4,
        probability: 10,
      },
      {
        rewardType: "GIFT",
        giftName: "Front Load Washing Machine",
        stockLimit: 6,
        probability: 15,
      },
      {
        rewardType: "GIFT",
        giftName: "Microwave Oven",
        stockLimit: 12,
        probability: 25,
      },
      {
        rewardType: "COIN",
        minCoins: 200,
        maxCoins: 800,
        stockLimit: 400,
        probability: 50,
      },
    ],
  },
  {
    name: "Weekend Flash Coin Blast (Paused)",
    description:
      "Temporarily paused flash weekend card offering double coin multipliers and instant tool set prizes.",
    startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // in 10 days
    active: false,
    totalScratchLimit: 500,
    perUserScratchLimit: 2,
    rewardsRaw: [
      {
        rewardType: "GIFT",
        giftName: "Bosch Heavy Duty Power Tool Kit",
        stockLimit: 5,
        probability: 20,
      },
      {
        rewardType: "COIN",
        minCoins: 300,
        maxCoins: 1200,
        stockLimit: 200,
        probability: 50,
      },
      {
        rewardType: "BONUS_POINTS",
        minPoints: 100,
        maxPoints: 500,
        stockLimit: 300,
        probability: 30,
      },
    ],
  },
];

async function seedDemoScratchCards() {
  const db = new Database();
  try {
    await db.connectDb();
    console.log(
      "🌱 Seeding realistic production-level demo contents for Scratch Card Campaigns...",
    );

    // Fetch all existing gifts to map giftName -> giftId
    const gifts = await Gift.find().lean();
    const giftMap = {};
    gifts.forEach((g) => {
      giftMap[g.name] = g._id;
    });

    // Clear existing scratch cards with matching names
    const names = sampleScratchCardsDefinition.map((s) => s.name);
    await ScratchCardRule.deleteMany({ name: { $in: names } });

    const scratchCardsToInsert = sampleScratchCardsDefinition.map((scDef) => {
      const rewards = scDef.rewardsRaw.map((rRaw) => {
        if (rRaw.rewardType === "GIFT") {
          return {
            rewardType: "GIFT",
            giftId: giftMap[rRaw.giftName] || null,
            stockLimit: rRaw.stockLimit || 1,
            probability: rRaw.probability,
          };
        } else if (rRaw.rewardType === "COIN") {
          return {
            rewardType: "COIN",
            minCoins: rRaw.minCoins || 0,
            maxCoins: rRaw.maxCoins || 0,
            stockLimit: rRaw.stockLimit || 100,
            probability: rRaw.probability,
          };
        } else {
          return {
            rewardType: "BONUS_POINTS",
            minPoints: rRaw.minPoints || 0,
            maxPoints: rRaw.maxPoints || 0,
            stockLimit: rRaw.stockLimit || 100,
            probability: rRaw.probability,
          };
        }
      });

      return {
        name: scDef.name,
        description: scDef.description,
        startDate: scDef.startDate,
        endDate: scDef.endDate,
        active: scDef.active,
        totalScratchLimit: scDef.totalScratchLimit,
        perUserScratchLimit: scDef.perUserScratchLimit,
        rewards,
      };
    });

    const createdCards = await ScratchCardRule.insertMany(scratchCardsToInsert);
    console.log(
      `✅ Successfully created ${createdCards.length} realistic Scratch Card campaigns with prize pools!`,
    );

    createdCards.forEach((c) => {
      const isUpcoming = c.startDate > new Date();
      const isExpired = c.endDate < new Date();
      let stateLabel = "ACTIVE";
      if (!c.active) {
        stateLabel = isExpired ? "EXPIRED" : "PAUSED/INACTIVE";
      } else if (isUpcoming) {
        stateLabel = "UPCOMING";
      }
      console.log(
        `  - [${stateLabel}] ${c.name} (${c.rewards.length} prize pool rewards)`,
      );
    });
  } catch (error) {
    console.error("❌ Error seeding demo scratch cards:", error);
  } finally {
    await db.disconnectDb();
    process.exit(0);
  }
}

seedDemoScratchCards();
