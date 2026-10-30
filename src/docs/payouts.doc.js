const { CASHFREE_PAYOUT_EVENT } = require("../constants/payouts");
const {
  WITHDRAWAL_POINT_ROUNDING_MODE,
  WITHDRAWAL_STATUS,
} = require("../constants/withdrawals");

module.exports = {
  "/payouts/admin/list": {
    post: {
      summary: "List approved payout records",
      description:
        "Returns payout documents created when a withdrawal is manually approved or automatically approved. Unapproved and pre-approval cancelled withdrawal requests are not payouts and are not included.",
      tags: ["Payouts"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                page: { type: "integer", minimum: 1, default: 1 },
                limit: {
                  type: "integer",
                  minimum: 1,
                  maximum: 100,
                  default: 10,
                },
                status: {
                  type: "string",
                  enum: Object.values(WITHDRAWAL_STATUS),
                },
                search: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: "Paginated payout records",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  payouts: { type: "array", items: { type: "object" } },
                  total: { type: "integer" },
                  page: { type: "integer" },
                  limit: { type: "integer" },
                  totalPages: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
  },
  "/payouts/admin/summary": {
    get: {
      summary: "Get payout counts by status",
      description:
        "Counts persisted payout records, excluding unapproved withdrawals.",
      tags: ["Payouts"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: "Payout counts keyed by global withdrawal status" },
      },
    },
  },
  "/payouts/admin/details/{id}": {
    get: {
      summary: "Get approved payout details",
      description:
        "Returns the linked withdrawal, payout amount and point conversion snapshot, beneficiary, provider references, execution audit, and status history.",
      tags: ["Payouts"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: "id",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        200: { description: "Payout details" },
        404: { description: "Payout record not found" },
      },
    },
  },
  "/payouts/admin/{id}/complete-manual": {
    post: {
      summary: "Complete a manual payout",
      description:
        "Records a manual settlement reference, completes the payout transactionally, writes ledger entries, and notifies the user.",
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["paymentReference"],
              properties: {
                paymentReference: {
                  type: "string",
                  minLength: 3,
                  maxLength: 128,
                },
                utr: { type: "string", maxLength: 64 },
                notes: { type: "string", maxLength: 500 },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: { description: "Manual payout completed" },
        409: {
          description: "Payout is no longer eligible for manual completion",
        },
      },
    },
  },
  "/payouts/admin/{id}/cancel-manual": {
    post: {
      summary: "Cancel a manual payout",
      description:
        "Cancels an unsettled manual payout and refunds the withdrawal points using the existing cancellation ledger flow.",
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["remarks"],
              properties: {
                remarks: { type: "string", minLength: 5, maxLength: 500 },
              },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: { description: "Manual payout cancelled and balance refunded" },
        409: { description: "Payout is no longer eligible for cancellation" },
      },
    },
  },
  "/payouts/admin/{id}/convert-to-provider": {
    post: {
      summary: "Convert a manual payout to provider execution",
      description:
        "Switches an unsettled manual payout to the configured provider and creates a durable outbox item.",
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: "path", name: "id", required: true, schema: { type: "string" } },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["confirmation"],
              properties: { confirmation: { type: "boolean", const: true } },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: { description: "Manual payout queued with provider" },
        409: { description: "Payout is no longer eligible for conversion" },
      },
    },
  },
  "/withdrawals/create": {
    post: {
      summary: "Create a withdrawal request",
      description:
        "Requires approved KYC, an active payout beneficiary with READY provider status, and all balance and configured withdrawal-limit validations. Users with enableAutoPayout set are queued immediately in the same database transaction; others remain pending admin approval.",
      tags: ["Withdrawals"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["cashAmount"],
              properties: { cashAmount: { type: "number", minimum: 1 } },
              additionalProperties: false,
            },
          },
        },
      },
      responses: {
        200: {
          description:
            "Withdrawal created and queued or awaiting admin approval. The response includes the requested cash amount, points debited, and the point conversion rate captured at request time.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  data: {
                    type: "object",
                    properties: {
                      cashAmount: {
                        type: "number",
                        description: "INR sent to the beneficiary",
                      },
                      pointsAmount: {
                        type: "number",
                        description: "Points debited for this withdrawal",
                      },
                      pointConversionSnapshot: {
                        type: "object",
                        properties: {
                          rateInrPerPoint: {
                            type: "number",
                            description:
                              "INR value of one point when this withdrawal was requested",
                          },
                          roundingMode: {
                            type: "string",
                            enum: Object.values(WITHDRAWAL_POINT_ROUNDING_MODE),
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
        403: { description: "KYC approval is required" },
        409: {
          description:
            "Payout beneficiary verification is pending or unsuccessful",
        },
      },
    },
  },
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
      summary: "Approve a withdrawal for manual or provider payout",
      description:
        "Select MANUAL to create a pending manual payout. Select PROVIDER to queue execution through the configured provider. If omitted, the system default payout method is used.",
      tags: ["Withdrawals"],
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "string" },
          description: "Withdrawal identifier",
        },
      ],
      requestBody: {
        required: false,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                payoutMethod: { type: "string", enum: ["MANUAL", "PROVIDER"] },
              },
              additionalProperties: false,
            },
          },
        },
      },
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
                          payoutMethod: {
                            type: "string",
                            enum: ["MANUAL", "PROVIDER"],
                          },
                          isManualPayout: { type: "boolean" },
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
