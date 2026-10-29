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
      summary: "Receive a Cashfree Payouts V2 transfer event",
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
              required: ["type"],
              properties: {
                type: { type: "string", example: "TRANSFER_SUCCESS" },
                event_time: { type: "string", format: "date-time" },
                data: {
                  type: "object",
                  properties: {
                    transfer_id: { type: "string" },
                    cf_transfer_id: { type: "string" },
                    transfer_amount: { type: "number" },
                    status: { type: "string" },
                    status_code: { type: "string" },
                    transfer_utr: { type: "string" },
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
