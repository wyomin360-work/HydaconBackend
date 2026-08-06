const APP_NOTIFICATIONS = {
  auth: {
    login: {
      en_US: {
        title: "Welcome Back 👋",
        body: "You’re in! Let’s rack up some coins today 🚀",
      },
      ml: {
        title: "വീണ്ടും സ്വാഗതം 👋",
        body: "നിങ്ങൾ പ്രവേശിച്ചു! നമുക്ക് ഇന്ന് കൂടുതൽ കോയിനുകൾ നേടാം 🚀",
      },
    },
    logout: {
      en_US: {
        title: "See You Soon!",
        body: "You’ve been logged out. Don’t stay away too long 😉",
      },
      ml: {
        title: "വീണ്ടും കാണാം!",
        body: "നിങ്ങൾ ലോഗ് ഔട്ട് ആയിരിക്കുന്നു. അധികം വൈകാതെ വീണ്ടും വരിക 😉",
      },
    },
  },

  rewards: {
    qrScanSuccess: {
      en_US: {
        title: "Nice Scan! 🎉",
        body: "Boom! {{coins}} coins added for scanning {{productName}} 💰",
      },
      ml: {
        title: "നല്ല സ്കാൻ! 🎉",
        body: "ഗംഭീരം! {{productName}} സ്കാൻ ചെയ്തതിന് {{coins}} കോയിനുകൾ നിങ്ങളുടെ അക്കൗണ്ടിൽ ചേർത്തു 💰",
      },
    },
    qrScanFailed: {
      en_US: {
        title: "Oops... Try Again 😓",
        body: "We couldn’t read that QR. Give it another shot!",
      },
      ml: {
        title: "അയ്യോ... വീണ്ടും ശ്രമിക്കുക 😓",
        body: "ഈ ക്യുആർ കോഡ് റീഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല. ഒന്നുകൂടി ശ്രമിക്കൂ!",
      },
    },
    newReward: {
      en_US: {
        title: "🔥 Hot New Reward!",
        body: "{{rewardName}} just dropped. Redeem it before it’s gone!",
      },
      ml: {
        title: "🔥 പുതിയ സമ്മാനം ദാ എത്തി!",
        body: "{{rewardName}} ഇപ്പോൾ ലഭ്യമാണ്. തീരുന്നതിന് മുൻപ് തന്നെ സ്വന്തമാക്കൂ!",
      },
    },
    newProduct: {
      en_US: {
        title: "New Product, New Coins 🆕",
        body: "A shiny new product is ready to scan. Go get those coins!",
      },
      ml: {
        title: "പുതിയ ഉൽപ്പന്നം, പുതിയ കോയിനുകൾ 🆕",
        body: "സ്കാൻ ചെയ്യാൻ പുതിയൊരു ഉൽപ്പന്നം സജ്ജമാണ്. പോയി ആ കോയിനുകൾ നേടൂ!",
      },
    },
    rewardRedeemed: {
      en_US: {
        title: "Reward Claimed 🏆",
        body: "You just grabbed {{rewardName}}. Enjoy the win!",
      },
      ml: {
        title: "സമ്മാനം സ്വന്തമാക്കി 🏆",
        body: "നിങ്ങൾ ഇപ്പോൾ {{rewardName}} സ്വന്തമാക്കി. ഈ വിജയം ആസ്വദിക്കൂ!",
      },
    },
  },

  withdraw: {
    initiated: {
      en_US: {
        title: "Hang Tight!",
        body: "Your withdrawal of ₹{{amount}} is on its way 💸",
      },
      ml: {
        title: "കാത്തിരിക്കൂ!",
        body: "നിങ്ങൾ പിൻവലിച്ച ₹{{amount}} പ്രോസസ്സിംഗിലാണ് 💸",
      },
    },
    success: {
      en_US: {
        title: "💰 Grate News",
        body: "₹{{amount}} has successfully landed in your account!",
      },
      ml: {
        title: "💰 മികച്ച വാർത്ത",
        body: "₹{{amount}} നിങ്ങളുടെ അക്കൗണ്ടിൽ വിജയകരമായി എത്തിയിരിക്കുന്നു!",
      },
    },
    failed: {
      en_US: {
        title: "Uh-oh! 😞",
        body: "Something went wrong with your withdrawal. check your transaction details for reason",
      },
      ml: {
        title: "അയ്യോ! 😞",
        body: "പണം പിൻവലിക്കുന്നതിൽ തടസ്സം നേരിട്ടു. കാരണം അറിയാൻ ഇടപാട് വിവരങ്ങൾ പരിശോധിക്കുക",
      },
    },
    cancelled: {
      en_US: {
        title: "Cancelled ⛔",
        body: "Your withdrawal request has been called off , check your transaction details for reason",
      },
      ml: {
        title: "റദ്ദാക്കി ⛔",
        body: "പണം പിൻവലിക്കാനുള്ള നിങ്ങളുടെ അഭ്യർത്ഥന റദ്ദാക്കിയിരിക്കുന്നു, കാരണം അറിയാൻ ഇടപാട് വിവരങ്ങൾ പരിശോധിക്കുക",
      },
    },
    reversed: {
      en_US: {
        title: "Reversed ↩️",
        body: "Your withdrawal of ₹{{amount}} was reversed by the bank. Coins have been credited back.",
      },
      ml: {
        title: "തിരിച്ചുനൽകി ↩️",
        body: "നിങ്ങൾ പിൻവലിച്ച ₹{{amount}} ബാങ്ക് തിരിച്ചയച്ചു. കോയിനുകൾ തിരികെ നൽകിയിട്ടുണ്ട്.",
      },
    },
    approved: {
      en_US: {
        title: "Almost There ⏳",
        body: "Your withdrawal is approved and will be processed soon!",
      },
      ml: {
        title: "ഏതാണ്ട് പൂർത്തിയായി ⏳",
        body: "പണം പിൻവലിക്കാനുള്ള നിങ്ങളുടെ അഭ്യർത്ഥന അംഗീകരിച്ചു, ഉടൻ തന്നെ പ്രോസസ്സ് ചെയ്യും!",
      },
    },
  },

  milestones: {
    enoughToWithdraw: {
      en_US: {
        title: "You Did It! 🥳",
        body: "You’ve got enough coins to withdraw. Make it count!",
      },
      ml: {
        title: "നിങ്ങൾ വിജയിച്ചു! 🥳",
        body: "പണം പിൻവലിക്കാൻ ആവശ്യമായ കോയിനുകൾ നിങ്ങളുടെ പക്കലുണ്ട്. ഇത് ശരിയായി ഉപയോഗിക്കൂ!",
      },
    },
    almostEnough: {
      en_US: {
        title: "So Close! 👀",
        body: "Just {{remainingCoins}} coins to unlock your withdrawal 💪",
      },
      ml: {
        title: "വളരെ അടുത്തെത്തി! 👀",
        body: "പണം പിൻവലിക്കാൻ ഇനി വെറും {{remainingCoins}} കോയിനുകൾ കൂടി വേണം 💪",
      },
    },
    referrerCompleted: {
      en_US: {
        title: "Referral Milestone Completed! 🥳",
        body: 'Your friend {{friendName}} completed: "{{milestoneName}}". You earned {{points}} points!',
      },
      ml: {
        title: "റഫറൽ നാഴികക്കല്ല് പൂർത്തിയായി! 🥳",
        body: 'നിങ്ങളുടെ സുഹൃത്ത് {{friendName}} "{{milestoneName}}" പൂർത്തിയാക്കി. നിങ്ങൾക്ക് {{points}} പോയിന്റുകൾ ലഭിച്ചു!',
      },
    },
    refereeCompleted: {
      en_US: {
        title: "Milestone Unlocked! 🎉",
        body: 'You successfully completed the milestone: "{{milestoneName}}"!',
      },
      ml: {
        title: "നാഴികക്കല്ല് അൺലോക്ക് ചെയ്തു! 🎉",
        body: 'നിങ്ങൾ "{{milestoneName}}" എന്ന നാഴികക്കല്ല് വിജയകരമായി പൂർത്തിയാക്കി!',
      },
    },
  },

  general: {
    reminder: {
      en_US: {
        title: "Hey You 👋",
        body: "Don’t forget to scan today — those coins won’t earn themselves!",
      },
      ml: {
        title: "ഹലോ സുഹൃത്തേ 👋",
        body: "ഇന്ന് സ്കാൻ ചെയ്യാൻ മറക്കരുത് — കോയിനുകൾ തനിയെ വരില്ലല്ലോ!",
      },
    },
    promo: {
      en_US: {
        title: "🎁 Surprise Inside!",
        body: "New offers just dropped. Check them out and redeem away!",
      },
      ml: {
        title: "🎁 ഉള്ളിലൊരു അത്ഭുതമുണ്ട്!",
        body: "പുതിയ ഓഫറുകൾ വന്നിട്ടുണ്ട്. അവ പരിശോധിച്ച് സമ്മാനങ്ങൾ നേടൂ!",
      },
    },
    systemUpdate: {
      en_US: {
        title: "Level Up Your App! ⚙️",
        body: "We’ve added cool new stuff. Update now to experience it!",
      },
      ml: {
        title: "ആപ്പ് അപ്ഡേറ്റ് ചെയ്യൂ! ⚙️",
        body: "ഞങ്ങൾ പുതിയ പല ഫീച്ചറുകളും ചേർത്തിട്ടുണ്ട്. പുതിയ അനുഭവം അറിയാൻ ഇപ്പോൾ തന്നെ അപ്ഡേറ്റ് ചെയ്യൂ!",
      },
    },
  },

  kyc: {
    approved: {
      en_US: {
        title: "KYC Verified! 🎉",
        body: "Your identity verification is successful. All premium features are now unlocked!",
      },
      ml: {
        title: "കെവൈസി സ്ഥിരീകരിച്ചു! 🎉",
        body: "നിങ്ങളുടെ ഐഡന്റിറ്റി സ്ഥിരീകരണം വിജയകരമായി പൂർത്തിയായി. എല്ലാ പ്രീമിയം ഫീച്ചറുകളും ഇപ്പോൾ ലഭ്യമാണ്!",
      },
    },
    rejected: {
      en_US: {
        title: "KYC Verification Failed ⚠️",
        body: "Your KYC submission was rejected. Reason: {{reason}}",
      },
      ml: {
        title: "കെവൈസി സ്ഥിരീകരണം പരാജയപ്പെട്ടു ⚠️",
        body: "നിങ്ങളുടെ കെവൈസി സമർപ്പണം നിരസിക്കപ്പെട്ടു. കാരണം: {{reason}}",
      },
    },
  },

  loyalty: {
    tierUpgraded: {
      en_US: {
        title: "Tier Upgraded! 🎉",
        body: "Awesome! You've been upgraded from {{oldTierName}} to {{newTierName}} tier! 🚀",
      },
      ml: {
        title: "ടയർ ഉയർത്തിയിരിക്കുന്നു! 🎉",
        body: "അടിപൊളി! നിങ്ങളെ {{oldTierName}}-ൽ നിന്ന് {{newTierName}} ടയറിലേക്ക് ഉയർത്തിയിരിക്കുന്നു! 🚀",
      },
    },
    tierUpdated: {
      en_US: {
        title: "Tier Updated",
        body: "Your loyalty tier has been adjusted from {{oldTierName}} to {{newTierName}}.",
      },
      ml: {
        title: "ടയർ പുതുക്കി",
        body: "നിങ്ങളുടെ ലോയൽറ്റി ടയർ {{oldTierName}}-ൽ നിന്ന് {{newTierName}} ആയി മാറ്റിയിരിക്കുന്നു.",
      },
    },
  },

  gifts: {
    voucherRedeemed: {
      en_US: {
        title: "🎉 Your Voucher is Here!",
        body: "Your {{giftName}} voucher has been sent to your email. Tap to view!",
      },
      ml: {
        title: "🎉 നിങ്ങളുടെ വൗച്ചർ ഇതാ എത്തി!",
        body: "നിങ്ങളുടെ {{giftName}} വൗച്ചർ ഇമെയിൽ വഴി അയച്ചിട്ടുണ്ട്. കാണാൻ ടാപ്പ് ചെയ്യുക!",
      },
    },
    voucherFile: {
      en_US: {
        title: "🎟️ Voucher Ready for Download!",
        body: "Your {{giftName}} voucher file is ready. Check your email to download it!",
      },
      ml: {
        title: "🎟️ വൗച്ചർ ഡൗൺലോഡ് ചെയ്യാൻ തയ്യാറാണ്!",
        body: "നിങ്ങളുടെ {{giftName}} വൗച്ചർ ഫയൽ തയ്യാറായിക്കഴിഞ്ഞു. ഡൗൺലോഡ് ചെയ്യാൻ ഇമെയിൽ പരിശോധിക്കൂ!",
      },
    },
  },

  events: {
    invitation: {
      title: "You're invited! 🎉",
      body: "You have received an invitation to {{eventTitle}}",
    },
    registrationConfirmed: {
      title: "Registration Confirmed! 🎟️",
      body: "You're registered for {{eventTitle}}",
    },
  },

  referral: {
    referrerMilestone: {
      title: "Referral Milestone Completed! 🥳",
      body: 'Your friend {{friendName}} completed: "{{milestoneName}}". You earned {{points}} points!',
    },
    refereeMilestone: {
      title: "Milestone Unlocked! 🎉",
      body: 'You successfully completed the milestone: "{{milestoneName}}"!',
    },
  },

  contests: {
    contestWon: {
      title: "Contest Result: {{contestName}}",
      body: "You won {{prizeText}} in {{contestName}}! 🏆",
    },
  },
};

/**
 * Safely resolves localized notification template, falling back to en_US.
 * @param {Object} notificationObj The notification constant object
 * @param {string} lang Preferred language ("en_US" or "ml")
 * @returns {Object} { title, body }
 */
function getNotification(notificationObj, lang = "en_US") {
  const language = ["en_US", "ml"].includes(lang) ? lang : "en_US";
  return (
    notificationObj[language] || notificationObj["en_US"] || notificationObj
  );
}

module.exports = { APP_NOTIFICATIONS, getNotification };
