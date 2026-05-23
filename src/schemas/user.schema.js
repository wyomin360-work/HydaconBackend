const { default: mongoose } = require("mongoose");
const { hashData } = require("../utils/heplers");
const {
  AuthTypes,
  KYC_STATUS,
  KYC_DOCUMENT_STATUS,
  KYC_DOCUMENT_TYPES,
} = require("../constants/user");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: { type: String, required: false, unique: true, lowercase: true },
    password: { type: String, required: true },
    fcmTokens: { type: [String], default: [] },
    totalPoints: { type: Number, default: 0 },
    totalWithdraw: { type: Number, default: 0 },
    authKey: { type: String, required: false },
    agreedToTerms: { type: Boolean, default: true },
    enableNotification: { type: Boolean, default: true },
    avatarId: { type: String, required: false },
    dob: { type: Date, required: false, default: null },
    profilePhoto: { type: String, required: false, default: null },
    mobileNumber: { type: String, required: false, default: null },
    shopName: { type: String, required: false, default: null },
    experience: { type: Number, required: false, default: null },
    areaOfOperation: { type: String, required: false, default: null },
    profileCompletionPercentage: { type: Number, default: 0 },
    isFlagged: { type: Boolean, default: false },
    flaggedReason: { type: String, default: null },
    authType: {
      type: String,
      enum: Object.values(AuthTypes),
      required: true,
      default: AuthTypes.EMAIL,
    },
    bankDetails: {
      accountNumber: { type: String },
      userName: { type: String },
      ifscCode: { type: String },
      bankName: { type: String },
      branchName: { type: String },
      accountIv: { type: String },
      ifscIv: { type: String },
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: false,
    },
    kycStatus: {
      type: String,
      enum: Object.values(KYC_STATUS),
      default: KYC_STATUS.NOT_STARTED,
    },
    kycDocuments: {
      aadhaar: {
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
      pan: {
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
      shopPhoto: {
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
    },
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

    let totalFields = 6;
    let filledFields = 0;

    if (this.name) filledFields++;
    if (this.dob) filledFields++;
    if (this.profilePhoto) filledFields++;
    if (this.experience !== undefined && this.experience !== null) filledFields++;
    if (this.areaOfOperation) filledFields++;
    if (this.kycStatus && this.kycStatus !== 'NOT_STARTED') filledFields++;

    if (roleName === 'retailer') {
      totalFields = 7;
      if (this.shopName) filledFields++;
    }

    this.profileCompletionPercentage = Math.round((filledFields / totalFields) * 100);
  } catch (err) {
    console.error("Error calculating profile completion percentage:", err);
  }
};

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await hashData(this.password);
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
