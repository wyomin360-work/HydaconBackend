const auditLogService = require("../../src/modules/audit-log/audit-log.service");
const AuditLog = require("../../src/schemas/audit-log.schema");
const LoyaltyConfigAuditLog = require("../../src/schemas/loyalty-config-audit.schema");
const { AUDIT_LOG_ACTIONS } = require("../../src/constants/audit-logs");

jest.mock("../../src/schemas/audit-log.schema");
jest.mock("../../src/schemas/loyalty-config-audit.schema");

describe("Shared Audit Log Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("logAudit", () => {
    it("should save user audit log for PHONE_NUMBER_CHANGE action", async () => {
      const mockSave = jest.fn().mockResolvedValue({ _id: "log123" });
      AuditLog.mockImplementation(() => ({
        save: mockSave,
      }));

      const data = {
        userId: "user123",
        oldNumber: "12345",
        newNumber: "67890",
        ipAddress: "127.0.0.1",
        deviceInfo: {
          userAgent: "Mozilla",
          deviceId: "device123",
        },
      };

      await auditLogService.logAudit(
        AUDIT_LOG_ACTIONS.PHONE_NUMBER_CHANGE,
        data,
      );

      expect(AuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user123",
          action: AUDIT_LOG_ACTIONS.PHONE_NUMBER_CHANGE,
          oldNumber: "12345",
          newNumber: "67890",
          ipAddress: "127.0.0.1",
          deviceInfo: expect.objectContaining({
            userAgent: "Mozilla",
            deviceId: "device123",
          }),
        }),
      );
      expect(mockSave).toHaveBeenCalled();
    });

    it("should save configuration audit log for SEASON_CREATED action", async () => {
      const mockSave = jest.fn().mockResolvedValue({ _id: "log456" });
      LoyaltyConfigAuditLog.mockImplementation(() => ({
        save: mockSave,
      }));

      const data = {
        changedBy: "admin123",
        seasonId: "season123",
        seasonName: "Season 1",
        changes: [{ field: "name", oldValue: null, newValue: "Season 1" }],
      };

      await auditLogService.logAudit(AUDIT_LOG_ACTIONS.SEASON_CREATED, data);

      expect(LoyaltyConfigAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_LOG_ACTIONS.SEASON_CREATED,
          changedBy: "admin123",
          seasonId: "season123",
          seasonName: "Season 1",
          changes: expect.arrayContaining([
            expect.objectContaining({ field: "name", newValue: "Season 1" }),
          ]),
        }),
      );
      expect(mockSave).toHaveBeenCalled();
    });
  });

  describe("buildChanges", () => {
    it("should build changes array correctly by comparing fields", () => {
      const oldData = { name: "Old Name", active: true, desc: "description" };
      const newData = { name: "New Name", active: true, desc: null };
      const fields = ["name", "active", "desc"];

      const changes = auditLogService.buildChanges(oldData, newData, fields);

      expect(changes).toEqual([
        { field: "name", oldValue: "Old Name", newValue: "New Name" },
        { field: "desc", oldValue: "description", newValue: null },
      ]);
    });
  });

  describe("clearAllAuditLogs", () => {
    it("should clear both collections", async () => {
      AuditLog.deleteMany.mockResolvedValue({});
      LoyaltyConfigAuditLog.deleteMany.mockResolvedValue({});

      await auditLogService.clearAllAuditLogs();

      expect(AuditLog.deleteMany).toHaveBeenCalledWith({});
      expect(LoyaltyConfigAuditLog.deleteMany).toHaveBeenCalledWith({});
    });
  });
});
