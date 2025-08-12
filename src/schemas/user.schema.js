const { default: mongoose } = require("mongoose");
const { hashData } = require("../utils/heplers");


const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    totalPoints: { type: Number, default: 0 },
    totalWithdraw: { type: Number, default: 0 },
}, { timestamps: true })

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await hashData(this.password);
  }
  next();
});

const User = mongoose.model('User', userSchema)
module.exports = User