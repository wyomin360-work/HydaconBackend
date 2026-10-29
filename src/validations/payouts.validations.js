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
  },
  additionalProperties: false,
};

const cashfreePayoutWebhookRequestType = {
  type: "object",
  required: ["type"],
  properties: {
    type: { type: "string", minLength: 1 },
    event_time: { type: "string" },
    data: cashfreeTransferWebhookData,
  },
  additionalProperties: false,
};

module.exports = {
  cashfreePayoutWebhookRequestType,
  razorpayxPayoutWebhookRequestType,
};
