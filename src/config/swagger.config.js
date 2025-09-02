const swaggerJsdoc = require("swagger-jsdoc");
const productsDoc = require("../docs/products.doc");
const adminDoc = require("../docs/admin.doc");
const userDoc = require("../docs/user.doc");
const rewardsDoc = require("../docs/rewards.doc");
const redeemsDoc = require("../docs/redeems.doc");
const transactionsDoc = require("../docs/transactions.doc");
const appDoc = require("../docs/app.doc");
const commonDoc = require("../docs/common.doc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Hydacon API",
      version: "1.0.0",
      description: "API documentation for my Hydacon app",
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
      ...appDoc
    }
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
