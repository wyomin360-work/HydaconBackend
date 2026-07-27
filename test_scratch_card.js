const mongoose = require("mongoose");
const User = require("./src/schemas/user.schema");
const ScratchCard = require("./src/schemas/scratch-card.schema");
const GiftRedemption = require("./src/schemas/gift-redemption.schema");
const Redeem = require("./src/schemas/redeem.schema");
const Gift = require("./src/schemas/gift.schema");

mongoose
  .connect(
    "mongodb+srv://hydaconcom_db_user:S42xKUTly8GuA33y@cluster0.xb0jt4a.mongodb.net/hydacon?appName=Cluster0",
  )
  .then(async () => {
    const cards = await ScratchCard.find({ rewardType: "GIFT" })
      .populate("redeemId giftId")
      .limit(10)
      .lean();
    console.log("Total GIFT cards found:", cards.length);
    for (const card of cards) {
      console.log(
        `[${card.userId}] ScratchCard: ${card._id}, Gift: ${card.giftId?.name}, Claimed: ${card.redeemId?.scratchCardGiftClaimed}, RedemptionId: ${card.redeemId?.scratchCardGiftRedemptionId}`,
      );
    }
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
