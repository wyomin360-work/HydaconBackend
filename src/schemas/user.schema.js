const { default: mongoose } = require("mongoose");
const { hashData } = require("../utils/heplers");
const { AuthTypes } = require("../constants/user");


const userSchema = new mongoose.Schema({
  name: { type: String, required: false },
  email: { type: String, required: false, unique: true, lowercase: true },
  password: { type: String, required: true },
  fcmTokens:  { type: [String], default: [] },
  totalPoints: { type: Number, default: 0 },
  totalWithdraw: { type: Number, default: 0 },
  authKey: { type: String, required: false },
  agreedToTerms: { type: Boolean, default:true },
  enableNotification: { type: Boolean, default:true },
  avatarId:{ type: String, required: false },
  authType: {
    type: String,
    enum: Object.values(AuthTypes),
    required: true,
    default: AuthTypes.EMAIL
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
    enum: ['NOT_STARTED', 'PENDING', 'APPROVED', 'REJECTED'],
    default: 'NOT_STARTED'
  },
  kycDocuments: {
    aadhaar: {
      originalUrl: { type: String, default: null },
      compressedUrl: { type: String, default: null },
      uploadedAt: { type: Date, default: null },
      status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
      rejectionReason: { type: String, default: null }
    },
    pan: {
      originalUrl: { type: String, default: null },
      compressedUrl: { type: String, default: null },
      uploadedAt: { type: Date, default: null },
      status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
      rejectionReason: { type: String, default: null }
    },
    shopPhoto: {
      originalUrl: { type: String, default: null },
      compressedUrl: { type: String, default: null },
      uploadedAt: { type: Date, default: null },
      status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
      rejectionReason: { type: String, default: null }
    }
  }
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (doc, ret) => {
      ret.id = doc._id
      return ret
    }
  }
})

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await hashData(this.password);
  }
  next();
});

const User = mongoose.model('User', userSchema)
module.exports = User