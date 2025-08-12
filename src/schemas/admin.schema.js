const mongoose = require("mongoose");
const { hashData } = require("../utils/heplers")

const adminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
}, { timestamps: true })

adminSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await hashData(this.password);
  }
  next();
});


const Admin = mongoose.model('Admin', adminSchema)
module.exports = Admin