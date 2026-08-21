const swaggerJsdoc = require("swagger-jsdoc");
const productsDoc = require("../docs/products.doc");
const adminDoc = require("../docs/admin.doc");
const userDoc = require("../docs/user.doc");
const rewardsDoc = require("../docs/rewards.doc");
const redeemsDoc = require("../docs/redeems.doc");
const transactionsDoc = require("../docs/transactions.doc");
const appDoc = require("../docs/app.doc");
const commonDoc = require("../docs/common.doc");
const rolesDoc = require("../docs/roles.doc");
const ruleSetDoc = require("../docs/rule-set.doc");
const videoDoc = require("../docs/video.doc");
const eventsDoc = require("../docs/events.doc");
const contestsDoc = require("../docs/contests.doc");
const scratchCardsDoc = require("../docs/scratch-cards.doc");
const loyaltyDoc = require("../docs/loyalty.doc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Hydacon API",
      version: "1.0.0",
      description: "API documentation for [Hydacon App & Dashboard]",
    },
    // servers: [
    //   { url: "http://localhost:5000" }
    // ],
    paths: {
      ...adminDoc,
      ...userDoc,
      ...productsDoc,
      ...rewardsDoc,
      ...redeemsDoc,
      ...transactionsDoc,
      ...commonDoc,
      ...appDoc,
      ...rolesDoc,
      ...ruleSetDoc,
      ...videoDoc,
      ...eventsDoc,
      ...contestsDoc,
      ...scratchCardsDoc,
      ...loyaltyDoc,
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
