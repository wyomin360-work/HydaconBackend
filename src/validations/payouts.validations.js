const { CASHFREE_PAYOUT_EVENT } = require("../constants/payouts");
const { WITHDRAWAL_STATUS } = require("../constants/withdrawals");

const razorpayPayoutEntity = {
  type: "object",
  properties: {
    id: { type: "string" },
    entity: { type: "string" },
    fund_account_id: { type: "string" },
    amount: { type: "number" },
    currency: { type: "string" },
    fees: { type: "number" },
    tax: { type: "number" },
    status: { type: "string" },
    utr: { type: "string" },
    mode: { type: "string" },
    purpose: { type: "string" },
    reference_id: { type: "string" },
    narration: { type: "string" },
    batch_id: { type: ["string", "null"] },
    failure_reason: { type: ["string", "null"] },
    created_at: { type: "number" },
    account_number: { type: "string" },
    queue_if_low_balance: { type: "boolean" },
  },
  additionalProperties: false,
};

const razorpayxPayoutWebhookRequestType = {
  type: "object",
  required: ["event", "payload"],
  properties: {
    entity: { type: "string" },
    account_id: { type: "string" },
    contains: { type: "array", items: { type: "string" } },
    event: { type: "string", minLength: 1 },
    created_at: { type: "number" },
    payload: {
      type: "object",
      required: ["payout"],
      properties: {
        payout: {
          type: "object",
          required: ["entity"],
          properties: { entity: razorpayPayoutEntity },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const cashfreeBeneficiaryInstrumentDetails = {
  type: "object",
  properties: {
    bank_account_number: { type: "string" },
    bank_ifsc: { type: "string" },
    vpa: { type: "string" },
  },
  additionalProperties: false,
};

const cashfreeBeneficiaryDetails = {
  type: "object",
  properties: {
    beneficiary_id: { type: "string" },
    beneficiary_instrument_details: cashfreeBeneficiaryInstrumentDetails,
  },
  additionalProperties: false,
};

const cashfreeTransferWebhookData = {
  type: "object",
  properties: {
    transfer_id: { type: "string" },
    cf_transfer_id: { type: "string" },
    transfer_amount: { type: "number" },
    transfer_mode: { type: "string" },
    transfer_utr: { type: "string" },
    transfer_service_charge: { type: "number" },
    transfer_service_tax: { type: "number" },
    status: { type: "string" },
    status_code: { type: "string" },
    status_description: { type: "string" },
    fundsource_id: { type: "string" },
    added_on: { type: "string" },
    updated_on: { type: "string" },
    beneficiary_details: cashfreeBeneficiaryDetails,
    batch_transfer_id: { type: "string" },
    cf_batch_transfer_id: { type: "string" },
    current_balance: { type: ["string", "number"] },
    ledger_balance: { type: ["string", "number"] },
    amount: { type: ["string", "number"] },
    utr: { type: "string" },
    bene_entity: { type: "string" },
    id: { type: ["string", "number"] },
    mode: { type: "string" },
    started_at: { type: "string" },
    is_scheduled: { type: "boolean" },
    severity: { type: "string" },
    entity_name: { type: "string" },
    entity_code: { type: "string" },
    resolved_at: { type: "string" },
  },
  additionalProperties: false,
};

const cashfreePayoutWebhookRequestType = {
  type: "object",
  required: ["type", "data"],
  properties: {
    type: { type: "string", enum: Object.values(CASHFREE_PAYOUT_EVENT) },
    event_time: { type: "string" },
    data: cashfreeTransferWebhookData,
  },
  additionalProperties: false,
};

const listPayoutsRequestType = {
  type: "object",
  properties: {
    page: { type: "number", minimum: 1 },
    limit: { type: "number", minimum: 1, maximum: 100 },
    status: {
      type: "string",
      enum: Object.values(WITHDRAWAL_STATUS),
    },
    search: { type: "string", maxLength: 128 },
  },
  additionalProperties: false,
};

module.exports = {
  cashfreePayoutWebhookRequestType,
  listPayoutsRequestType,
  razorpayxPayoutWebhookRequestType,
};
