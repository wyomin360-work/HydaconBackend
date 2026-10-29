const { PAYOUT_PROVIDER_ENVIRONMENT } = require("../../constants/payouts");

const runSandboxTest =
  process.env.RUN_CASHFREE_SANDBOX_TESTS === "true" &&
  process.env.CASHFREE_PAYOUT_ENV === PAYOUT_PROVIDER_ENVIRONMENT.SANDBOX;

(runSandboxTest ? describe : describe.skip)("Cashfree sandbox status check", () => {
  test("fetches the status of an existing sandbox transfer", async () => {
    const referenceId = process.env.CASHFREE_SANDBOX_TRANSFER_ID;
    if (!referenceId) {
      throw new Error(
        "Set CASHFREE_SANDBOX_TRANSFER_ID to an existing sandbox transfer reference.",
      );
    }

    const provider = require("../payouts/providers/cashfree");
    provider.validateConfig();
    const result = await provider.getTransferStatus({ referenceId });

    expect(result).not.toBeNull();
    expect(result.providerReferenceId).toBe(referenceId);
    expect(result.status).toEqual(expect.any(String));
  }, 30000);
});
