const express = require("express");
const userRoutes = require("../modules/user/user.routes");
const adminRoutes = require("../modules/admin/admin.routes");
const productRoutes = require("../modules/products/product.routes");
const rewardRoutes = require("../modules/rewards/rewards.routes");
const redeemRoutes = require("../modules/redeems/redeems.routes");
const userPaths = require("../modules/user/user.paths");
const adminPaths = require("../modules/admin/admin.paths");
const productPaths = require("../modules/products/product.paths");
const rewardsPath = require("../modules/rewards/rewards.path");
const redeemsPath = require("../modules/redeems/redeems.path");
const verification = require('../middlewares/jwtVerification');


const globalRoutes = express.Router()

globalRoutes.use(userPaths.root, userRoutes)
globalRoutes.use(adminPaths.root, adminRoutes)
globalRoutes.use(productPaths.root, verification.verifyAdmin, productRoutes)
globalRoutes.use(rewardsPath.root, verification.verifyAdmin, rewardRoutes)
globalRoutes.use(redeemsPath.root, redeemRoutes)

module.exports = globalRoutes 
