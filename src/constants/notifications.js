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
};

module.exports = { APP_NOTIFICATIONS };
