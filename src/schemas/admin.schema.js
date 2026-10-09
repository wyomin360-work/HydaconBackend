const mongoose = require("mongoose");
const { hashData } = require("../utils/heplers");

const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, default: "ADMIN" },
    active: { type: Number, default: 1 },
    status: { type: String, default: "active" },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
    tokenVersion: { type: Number, default: 0 },
    accessTokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

adminSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    this.password = await hashData(this.password);
  }
  next();
});

const Admin = mongoose.model("Admin", adminSchema);
module.exports = Admin;
