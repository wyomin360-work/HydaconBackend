const { default: mongoose } = require("mongoose");
const { hashData, calculateProfileCompletion } = require("../utils/heplers");
const {
  AuthTypes,
  KYC_STATUS,
  KYC_DOCUMENT_STATUS,
  KYC_DOCUMENT_TYPES,
} = require("../constants/user");
const { DEFAULT_PHONE_COUNTRY_CODE } = require("../constants/common");

const kycDocumentSchema = new mongoose.Schema(
  {
    originalUrl: { type: String, default: null },
    compressedUrl: { type: String, default: null },
    uploadedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: Object.values(KYC_DOCUMENT_STATUS),
      default: KYC_DOCUMENT_STATUS.PENDING,
    },
    rejectionReason: { type: String, default: null },
  },
  { _id: false },
);
const bankDetailsSchema = new mongoose.Schema(
  {
    accountNumber: { type: String },
    userName: { type: String },
    ifscCode: { type: String },
    bankName: { type: String },
    branchName: { type: String },
    accountIv: { type: String },
    ifscIv: { type: String },
  },
  { _id: false },
);

const kycDocumentsSchema = new mongoose.Schema(
  {
    aadhaar: { type: kycDocumentSchema, default: () => ({}) },
    pan: { type: kycDocumentSchema, default: () => ({}) },
    shopPhoto: { type: kycDocumentSchema, default: () => ({}) },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: { type: String, required: false, unique: true, lowercase: true },
    phone: { type: String, default: null },
    phoneCountryCode: { type: String, default: DEFAULT_PHONE_COUNTRY_CODE },
    password: { type: String, required: true },
    fcmTokens: { type: [String], default: [] },
    totalPoints: { type: Number, default: 0 },
    lifetimePoints: { type: Number, default: 0 },
    totalWithdraw: { type: Number, default: 0 },
    totalScans: { type: Number, default: 0 },
    hydaconCoins: { type: Number, default: 0 },
    lifetimeHydaconCoins: { type: Number, default: 0 },
    authKey: { type: String, required: false },
    agreedToTerms: { type: Boolean, default: true },
    enableNotification: { type: Boolean, default: true },
    avatarId: { type: String, required: false },
    dob: { type: Date, required: false, default: null },
    profilePhoto: { type: String, required: false, default: null },
    shopName: { type: String, required: false, default: null },
    experience: { type: Number, required: false, default: null },
    areaOfOperation: { type: String, required: false, default: null },
    profileCompletionPercentage: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isFlagged: { type: Boolean, default: false },
    flaggedReason: { type: String, default: null },
    authType: {
      type: String,
      enum: Object.values(AuthTypes),
      required: true,
      default: AuthTypes.EMAIL,
    },
    bankDetails: {
      type: bankDetailsSchema,
      default: () => ({}),
    },
    razorpayContactId: { type: String, default: null },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: false,
    },
    currentTierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tier",
      required: false,
      default: null,
    },
    kycStatus: {
      type: String,
      enum: Object.values(KYC_STATUS),
      default: KYC_STATUS.NOT_STARTED,
    },
    kycDocuments: {
      type: kycDocumentsSchema,
      default: () => ({}),
    },
    // Referral Tracking
    referralCode: { type: String, unique: true, sparse: true },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    referralsCount: { type: Number, default: 0 },
    successfulReferralsCount: { type: Number, default: 0 },

    // Streak Tracking
    currentStreak: { type: Number, default: 0 },
    lastScanDate: { type: Date, default: null },

    failedScanAttempts: { type: Number, default: 0 },
    scanBanUntil: { type: Date, default: null },

    // viewedPopups for tracking which popups have been shown in this login session
    viewedPopups: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Content", default: [] },
    ],
    language: { type: String, enum: ["en_US", "ml"], default: "en_US" },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (doc, ret) => {
        ret.id = doc._id;
        return ret;
      },
    },
  },
);

userSchema.methods.calculateCompletionPercentage = async function () {
  try {
    const Role = mongoose.model("Role");
    let roleName = "";
    if (this.roleId) {
      const role = await Role.findById(this.roleId);
      if (role) {
        roleName = role.name.toLowerCase();
      }
    }

    this.profileCompletionPercentage = calculateProfileCompletion(
      this,
      roleName,
    );
  } catch (err) {
    console.error("Error calculating profile completion percentage:", err);
  }
};

function generateReferralCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  let code = "HYD";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await hashData(this.password);
  }

  // Auto-generate referral code on first creation
  if (!this.referralCode) {
    let code;
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      code = generateReferralCode();
      const existing = await mongoose
        .model("User")
        .findOne({ referralCode: code });
      if (!existing) isUnique = true;
      attempts++;
    }
    this.referralCode = code;
  }

  await this.calculateCompletionPercentage();
  next();
});

const User = mongoose.model("User", userSchema);

// Export enums attached to User class/model
User.AuthTypes = AuthTypes;
User.KYC_STATUS = KYC_STATUS;
User.KYC_DOCUMENT_STATUS = KYC_DOCUMENT_STATUS;
User.KYC_DOCUMENT_TYPES = KYC_DOCUMENT_TYPES;

module.exports = User;
