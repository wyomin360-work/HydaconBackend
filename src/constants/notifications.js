const APP_NOTIFICATIONS = {
  auth: {
    login: {
      title: "Welcome Back 👋",
      body: "You’re in! Let’s rack up some coins today 🚀",
    },
    logout: {
      title: "See You Soon!",
      body: "You’ve been logged out. Don’t stay away too long 😉",
    },
  },

  rewards: {
    qrScanSuccess: {
      title: "Nice Scan! 🎉",
      body: "Boom! {{coins}} coins added for scanning {{productName}} 💰",
    },
    qrScanFailed: {
      title: "Oops... Try Again 😓",
      body: "We couldn’t read that QR. Give it another shot!",
    },
    newReward: {
      title: "🔥 Hot New Reward!",
      body: "{{rewardName}} just dropped. Redeem it before it’s gone!",
    },
    newProduct: {
      title: "New Product, New Coins 🆕",
      body: "A shiny new product is ready to scan. Go get those coins!",
    },
    rewardRedeemed: {
      title: "Reward Claimed 🏆",
      body: "You just grabbed {{rewardName}}. Enjoy the win!",
    },
  },

  withdraw: {
    initiated: {
      title: "Hang Tight!",
      body: "Your withdrawal of ₹{{amount}} is on its way 💸",
    },
    success: {
      title: "💰 Grate News",
      body: "₹{{amount}} has successfully landed in your account!",
    },
    failed: {
      title: "Uh-oh! 😞",
      body: "Something went wrong with your withdrawal. check your transaction details for reason",
    },
    cancelled: {
      title: "Cancelled ⛔",
      body: "Your withdrawal request has been called off , check your transaction details for reason",
    },
    approved: {
      title: "Almost There ⏳",
      body: "Your withdrawal is approved and will be processed soon!",
    },
  },

  milestones: {
    enoughToWithdraw: {
      title: "You Did It! 🥳",
      body: "You’ve got enough coins to withdraw. Make it count!",
    },
    almostEnough: {
      title: "So Close! 👀",
      body: "Just {{remainingCoins}} coins to unlock your withdrawal 💪",
    },
  },

  general: {
    reminder: {
      title: "Hey You 👋",
      body: "Don’t forget to scan today — those coins won’t earn themselves!",
    },
    promo: {
      title: "🎁 Surprise Inside!",
      body: "New offers just dropped. Check them out and redeem away!",
    },
    systemUpdate: {
      title: "Level Up Your App! ⚙️",
      body: "We’ve added cool new stuff. Update now to experience it!",
    },
  },

  kyc: {
    approved: {
      title: "KYC Verified! 🎉",
      body: "Your identity verification is successful. All premium features are now unlocked!",
    },
    rejected: {
      title: "KYC Verification Failed ⚠️",
      body: "Your KYC submission was rejected. Reason: {{reason}}",
    },
  },

  loyalty: {
    tierUpgraded: {
      title: "Tier Upgraded! 🎉",
      body: "Awesome! You've been upgraded from {{oldTierName}} to {{newTierName}} tier! 🚀",
    },
    tierUpdated: {
      title: "Tier Updated",
      body: "Your loyalty tier has been adjusted from {{oldTierName}} to {{newTierName}}.",
    },
  },

  gifts: {
    voucherRedeemed: {
      title: "🎉 Your Voucher is Here!",
      body: "Your {{giftName}} voucher has been sent to your email. Tap to view!",
    },
    voucherFile: {
      title: "🎟️ Voucher Ready for Download!",
      body: "Your {{giftName}} voucher file is ready. Check your email to download it!",
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

module.exports = { APP_NOTIFICATIONS };
