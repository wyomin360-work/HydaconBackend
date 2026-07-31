const express = require("express");

// -- Middleware & Helpers --
const verification = require("../middlewares/jwtVerification");
const { handleError } = require("../utils/heplers");

// -- App & Common --
const appRoutes = require("../modules/app/app.routes");
const appPaths = require("../modules/app/app.paths");
const commonRoutes = require("../modules/common/common.routes");
const commonPaths = require("../modules/common/common.paths");

// -- Users & Admins --
const userRoutes = require("../modules/user/user.routes");
const userPaths = require("../modules/user/user.paths");
const adminRoutes = require("../modules/admin/admin.routes");
const adminPaths = require("../modules/admin/admin.paths");
const roleRoutes = require("../modules/roles/role.routes");
const rolePaths = require("../modules/roles/role.paths");
const kycRoutes = require("../modules/kyc/kyc.routes");
const kycPaths = require("../modules/kyc/kyc.paths");

// -- Products --
const productRoutes = require("../modules/products/product.routes");
const productPaths = require("../modules/products/product.paths");
const productController = require("../modules/products/product.controller");

// -- Rewards & Redeems --
const rewardRoutes = require("../modules/rewards/rewards.routes");
const rewardsPath = require("../modules/rewards/rewards.path");
const redeemRoutes = require("../modules/redeems/redeems.routes");
const redeemsPath = require("../modules/redeems/redeems.path");
const scratchCardsRoutes = require("../modules/scratch-cards/scratch-cards.routes");
const scratchCardsPaths = require("../modules/scratch-cards/scratch-cards.paths");

// -- Transactions --
const transactionRoutes = require("../modules/transactions/transactions.routes");
const transactionsPath = require("../modules/transactions/transactions.path");

// -- Loyalty & Campaigns --
const loyaltyRoutes = require("../modules/loyalty/loyalty.routes");
const loyaltyPaths = require("../modules/loyalty/loyalty.paths");
const campaignsRoutes = require("../modules/campaigns/campaigns.routes");
const campaignsPaths = require("../modules/campaigns/campaigns.paths");
const contestsPaths = require("../modules/contests/contests.paths");
const contestsRoutes = require("../modules/contests/contests.routes");
const eventsPaths = require("../modules/events/events.paths");
const eventsRoutes = require("../modules/events/events.routes");

// -- Gifts --
const giftRoutes = require("../modules/gift/gift.routes");
const giftPaths = require("../modules/gift/gift.paths");

// -- Documents & Files --
const documentRoutes = require("../modules/document/document.routes");
const documentPaths = require("../modules/document/document.paths");
const filesRoutes = require("../modules/files/files.routes");
const filesPaths = require("../modules/files/files.paths");

// -- Rule Set --
const ruleSetRoutes = require("../modules/rule-set/rule-set.routes");
const ruleSetPaths = require("../modules/rule-set/rule-set.paths");

// -- Videos --
const videoRoutes = require("../modules/videos/video.routes");
const videoPaths = require("../modules/videos/video.paths");

// -- Referral --
const referralRoutes = require("../modules/referral/referral.routes");
const referralPaths = require("../modules/referral/referral.paths");

// -- Content --
const contentPaths = require("../modules/content/content.paths");
const contentRoutes = require("../modules/content/content.routes");

const globalRoutes = express.Router();

// App & Common
globalRoutes.use(appPaths.root, appRoutes);
globalRoutes.use(commonPaths.root, commonRoutes);

// Users & Admins
globalRoutes.use(userPaths.root, userRoutes);
globalRoutes.use(adminPaths.root, adminRoutes);
globalRoutes.use(rolePaths.root, roleRoutes);
globalRoutes.use(kycPaths.root, kycRoutes);

// Products & Calculator (Public)
globalRoutes.post(
  `${productPaths.root}${productPaths.calculateCoverage}`,
  handleError(productController.calculateCoverage),
);
globalRoutes.use(productPaths.root, productRoutes);

// Rewards & Redeems
globalRoutes.use(rewardsPath.root, verification.verifyAdmin, rewardRoutes);
globalRoutes.use(redeemsPath.root, redeemRoutes);
globalRoutes.use(scratchCardsPaths.root, scratchCardsRoutes);

// Transactions
globalRoutes.use(transactionsPath.root, transactionRoutes);

// Loyalty & Campaigns
globalRoutes.use(loyaltyPaths.root, loyaltyRoutes);
globalRoutes.use(campaignsPaths.root, campaignsRoutes);
globalRoutes.use(giftPaths.root, giftRoutes);
globalRoutes.use(contestsPaths.root, contestsRoutes);
globalRoutes.use(eventsPaths.root, eventsRoutes);

// Gifts
globalRoutes.use(giftPaths.root, giftRoutes);

// Documents & Files
globalRoutes.use(documentPaths.root, documentRoutes);
globalRoutes.use(filesPaths.root, filesRoutes);

// Rule Set
globalRoutes.use(ruleSetPaths.root, ruleSetRoutes);

// Videos
globalRoutes.use(videoPaths.root, videoRoutes);

// Referral
globalRoutes.use(referralPaths.root, referralRoutes);

// Content
globalRoutes.use(contentPaths.root, contentRoutes);

module.exports = globalRoutes;
