const { default: mongoose } = require("mongoose");
const { hashData } = require("../utils/heplers");
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

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: false },
    email: { type: String, required: false, unique: true, lowercase: true },
    phone: { type: String, default: null },
<<<<<<< HEAD
=======
    phoneCountryCode: { type: String, default: DEFAULT_PHONE_COUNTRY_CODE },
>>>>>>> 5c6138b5601ec21dd1926e514d5eb43ffebd87b2
    password: { type: String, required: true },
    fcmTokens: { type: [String], default: [] },
    totalPoints: { type: Number, default: 0 },
    totalWithdraw: { type: Number, default: 0 },
    authKey: { type: String, required: false },
    agreedToTerms: { type: Boolean, default: true },
    enableNotification: { type: Boolean, default: true },
    avatarId: { type: String, required: false },
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
      aadhaar: { type: kycDocumentSchema, default: () => ({}) },
      pan: { type: kycDocumentSchema, default: () => ({}) },
      shopPhoto: { type: kycDocumentSchema, default: () => ({}) },
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

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await hashData(this.password);
  }
  next();
});

const User = mongoose.model("User", userSchema);

// Export enums attached to User class/model
User.AuthTypes = AuthTypes;
User.KYC_STATUS = KYC_STATUS;
User.KYC_DOCUMENT_STATUS = KYC_DOCUMENT_STATUS;
User.KYC_DOCUMENT_TYPES = KYC_DOCUMENT_TYPES;

module.exports = User;
