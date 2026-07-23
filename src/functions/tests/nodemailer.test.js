const mockSendMail = jest
  .fn()
  .mockResolvedValue({ messageId: "123", response: "200 OK" });

jest.mock("nodemailer", () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: mockSendMail,
  }),
}));

const { sendTemplateEmail } = require("../nodemailer");

describe("nodemailer sendTemplateEmail helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully send an approved KYC template email", async () => {
    const result = await sendTemplateEmail(
      "recipient@example.com",
      "users/kycApproved",
      "KYC Verified Successfully 🎉",
      { userName: "Alice" },
    );

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "recipient@example.com",
        subject: "KYC Verified Successfully 🎉",
        text: expect.stringContaining("Hello Alice"),
        html: expect.stringContaining("Hello Alice"),
      }),
    );
  });

  it("should successfully send a rejected KYC template email", async () => {
    const result = await sendTemplateEmail(
      "recipient@example.com",
      "users/kycRejected",
      "KYC Documents Rejected ⚠️",
      { userName: "Bob", rejectionReason: "Blurry selfie" },
    );

    expect(result).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "recipient@example.com",
        subject: "KYC Documents Rejected ⚠️",
        text: expect.stringContaining("Reason for rejection: Blurry selfie"),
        html: expect.stringContaining("Blurry selfie"),
      }),
    );
  });

  it("should return false and log error if template is not found", async () => {
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await sendTemplateEmail(
      "recipient@example.com",
      "users/nonExistentTemplate",
      "Some Subject",
      { userName: "Charlie" },
    );

    expect(result).toBe(false);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
