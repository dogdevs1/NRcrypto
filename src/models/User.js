const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    balanceUnits: { type: Number, default: 0 } // how many NR Silver units
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
