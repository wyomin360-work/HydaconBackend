const approval = require("./payout-batch-approval.service");
const worker = require("./payout-batch-worker.service");

module.exports = { ...approval, ...worker };
