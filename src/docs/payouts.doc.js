const { CASHFREE_PAYOUT_EVENT } = require("../constants/payouts");

module.exports = {
  "/webhooks/payout": {
    post: {
      summary: "Receive payout events for the selected PAYOUT_PROVIDER",
      description:
        "Use this endpoint when one provider is configured for payout webhooks. Provider-specific endpoints are available for mixed-provider in-flight transfers.",
      tags: ["Payout Webhooks"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              oneOf: [
                {
                  type: "object",
                  required: ["event"],
                  properties: {
                    event: { type: "string" },
                    payload: { type: "object" },
                  },
                  additionalProperties: false,
                },
                {
                  type: "object",
                  required: ["type"],
                  properties: {
                    type: { type: "string" },
                    event_time: { type: "string" },
                    data: { type: "object" },
                  },
                  additionalProperties: false,
                },
              ],
            },
          },
        },
      },
      responses: {
        200: { description: "Signed event accepted or safely ignored" },
        401: { description: "Webhook signature is invalid" },
        500: {
          description: "Temporary processing failure; provider should retry",
        },
      },
    },
  },
  "/withdrawals/admin/approve-batch": {
    post: {
      summary: "Approve and queue a Cashfree payout batch",
      description:
        "Validates every selected pending withdrawal before atomically approving the whole set. Requires PAYOUT_PROVIDER=cashfree. The worker creates/resolves every beneficiary before submitting one Cashfree Batch Transfer V2 request.",
      tags: ["Withdrawals"],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["withdrawalIds"],
              properties: {
                withdrawalIds: {
                  type: "array",
                  minItems: 2,
                  maxItems: 5000,
                  uniqueItems: true,
                  items: {
                    type: "string",
                    pattern: "^[a-fA-F0-9]{24}$",
                  },
                },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: {
          description:
            "All withdrawals were approved and queued for batch execution",
        },
        400: { description: "Selection or withdrawal data is invalid" },
        401: { description: "Admin authentication is required" },
        409: {
          description:
            "A selected withdrawal is not pending or cannot use Cashfree",
        },
      },
    },
  },
  "/withdrawals/admin/approve/{id}": {
    post: {
      summary: "Approve a withdrawal and queue a provider payout",
      tags: ["Withdrawals"],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "Withdrawal identifier",
        },
      ],
      responses: {
        200: {
          description: "Withdrawal approved and payout queued",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: { type: "string", example: "success" },
                  data: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      data: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          status: { type: "string", enum: ["PROCESSING"] },
                          payoutProvider: {
                            type: "string",
                            enum: ["razorpayx", "cashfree"],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        400: { description: "Withdrawal is not eligible for approval" },
        401: { description: "Admin authentication is required" },
      },
    },
  },
  "/webhooks/razorpayx": {
    post: {
      summary: "Receive a RazorpayX payout event",
      tags: ["Payout Webhooks"],
      parameters: [
        {
          in: "header",
          name: "x-razorpay-signature",
          required: true,
          schema: { type: "string" },
        },
        {
          in: "header",
          name: "x-razorpay-event-id",
          required: false,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["event", "payload"],
              properties: {
                event: { type: "string", example: "payout.processed" },
                payload: {
                  type: "object",
                  description: "RazorpayX payout event payload",
                  properties: {
                    payout: {
                      type: "object",
                      properties: {
                        entity: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            reference_id: { type: "string" },
                            amount: { type: "number" },
                            currency: { type: "string" },
                            status: { type: "string" },
                            utr: { type: "string" },
                            failure_reason: { type: "string" },
                          },
                          additionalProperties: false,
                        },
                      },
                      additionalProperties: false,
                    },
                  },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: { description: "Signed event accepted or safely ignored" },
        401: { description: "Webhook signature is invalid" },
        500: {
          description: "Temporary processing failure; provider should retry",
        },
      },
    },
  },
  "/webhooks/cashfree": {
    post: {
      summary: "Receive Cashfree Payouts V2 webhook events",
      description:
        "Accepts transfer events and safely records beneficiary incident, credit confirmation, and low balance events. Non-transfer events do not change withdrawal status.",
      tags: ["Payout Webhooks"],
      parameters: [
        {
          in: "header",
          name: "x-webhook-signature",
          required: true,
          schema: { type: "string" },
        },
        {
          in: "header",
          name: "x-webhook-timestamp",
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["type", "data"],
              properties: {
                type: {
                  type: "string",
                  enum: Object.values(CASHFREE_PAYOUT_EVENT),
                  example: CASHFREE_PAYOUT_EVENT.TRANSFER_SUCCESS,
                },
                event_time: { type: "string", format: "date-time" },
                data: {
                  type: "object",
                  properties: {
                    transfer_id: { type: "string" },
                    cf_transfer_id: { type: "string" },
                    transfer_amount: { type: "number" },
                    transfer_mode: { type: "string" },
                    transfer_service_charge: { type: "number" },
                    transfer_service_tax: { type: "number" },
                    status: { type: "string" },
                    status_code: { type: "string" },
                    status_description: { type: "string" },
                    transfer_utr: { type: "string" },
                    fundsource_id: { type: "string" },
                    added_on: { type: "string" },
                    updated_on: { type: "string" },
                    beneficiary_details: {
                      type: "object",
                      properties: {
                        beneficiary_id: { type: "string" },
                        beneficiary_instrument_details: {
                          type: "object",
                          properties: {
                            bank_account_number: { type: "string" },
                            bank_ifsc: { type: "string" },
                            vpa: { type: "string" },
                          },
                          additionalProperties: false,
                        },
                      },
                      additionalProperties: false,
                    },
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
                },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: { description: "Signed event accepted or safely ignored" },
        401: { description: "Webhook signature is invalid" },
        500: {
          description: "Temporary processing failure; provider should retry",
        },
      },
    },
  },
};
