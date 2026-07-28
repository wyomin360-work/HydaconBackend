require("dotenv").config();
const mongoose = require("mongoose");
const Gift = require("./src/schemas/gift.schema");
const User = require("./src/schemas/user.schema");
const giftService = require("./src/modules/gift/gift.service");

async function run() {
  await mongoose.connect(process.env.MONGODB_URL);

  // Try Bosch Tool Kit giftId and the user 6a0fddac6b304d5ac015b2dc
  const giftId = "6a64dfa6459280986a705078"; // This was the ScratchCard ID, wait, I need the actual gift ID.
  const userId = "6a0fddac6b304d5ac015b2dc"; // User ID

  // Let's just find the gift that has this user in rewardedUsers
  const gifts = await Gift.find({ "rewardedUsers.userId": userId });
  console.log(
    "Found gifts with user in rewardedUsers:",
    gifts.map((g) => g.name),
  );

  for (const gift of gifts) {
    console.log(`\nTesting Gift: ${gift.name}`);
    const details = await giftService.getGiftDetails(userId, gift._id);
    console.log(
      "getGiftDetails isFreeClaimable:",
      details.data.isFreeClaimable,
    );

    const eligibility = await giftService.getGiftEligibility(userId, gift._id);
    console.log(
      "getGiftEligibility isRewardedUser:",
      eligibility.data.isRewardedUser,
    );
  }

  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
