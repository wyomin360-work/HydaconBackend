const {
  APP_NOTIFICATIONS,
  getNotification,
} = require("../../src/constants/notifications");
const { formatNotification } = require("../../src/utils/heplers");

describe("Notification Localization and Formatting", () => {
  describe("getNotification helper function", () => {
    it("should retrieve English notifications by default when language is not specified", () => {
      const notif = getNotification(APP_NOTIFICATIONS.auth.login);
      expect(notif.title).toBe("Welcome Back 👋");
      expect(notif.body).toBe("You’re in! Let’s rack up some coins today 🚀");
    });

    it("should retrieve English notifications when language is en_US", () => {
      const notif = getNotification(APP_NOTIFICATIONS.auth.login, "en_US");
      expect(notif.title).toBe("Welcome Back 👋");
      expect(notif.body).toBe("You’re in! Let’s rack up some coins today 🚀");
    });

    it("should retrieve Malayalam notifications when language is ml", () => {
      const notif = getNotification(APP_NOTIFICATIONS.auth.login, "ml");
      expect(notif.title).toBe("വീണ്ടും സ്വാഗതം 👋");
      expect(notif.body).toBe(
        "നിങ്ങൾ പ്രവേശിച്ചു! നമുക്ക് ഇന്ന് കൂടുതൽ കോയിനുകൾ നേടാം 🚀",
      );
    });

    it("should fallback to English when language is unsupported", () => {
      const notif = getNotification(APP_NOTIFICATIONS.auth.login, "fr");
      expect(notif.title).toBe("Welcome Back 👋");
      expect(notif.body).toBe("You’re in! Let’s rack up some coins today 🚀");
    });
  });

  describe("Formatting localized notifications", () => {
    it("should correctly format variables in localized Malayalam messages", () => {
      const notifTemplate = getNotification(
        APP_NOTIFICATIONS.rewards.qrScanSuccess,
        "ml",
      );
      const formattedBody = formatNotification(notifTemplate.body, {
        coins: 50,
        productName: "Cement Super",
      });
      expect(formattedBody).toBe(
        "ഗംഭീരം! Cement Super സ്കാൻ ചെയ്തതിന് 50 കോയിനുകൾ നിങ്ങളുടെ അക്കൗണ്ടിൽ ചേർത്തു 💰",
      );
    });

    it("should correctly format variables in localized English messages", () => {
      const notifTemplate = getNotification(
        APP_NOTIFICATIONS.rewards.qrScanSuccess,
        "en_US",
      );
      const formattedBody = formatNotification(notifTemplate.body, {
        coins: 50,
        productName: "Cement Super",
      });
      expect(formattedBody).toBe(
        "Boom! 50 coins added for scanning Cement Super 💰",
      );
    });
  });
});
