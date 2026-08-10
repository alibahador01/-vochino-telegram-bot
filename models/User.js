// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  language: {
    type: String,
    enum: ['fa', 'en', 'tr'],
    default: 'fa'
  },
  name: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    default: ''
  },
  cardNumber: {
    type: String,
    default: ''
  },
  balance: {
    type: Number,
    default: 0
  },
  bonusBalance: {
    type: Number,
    default: 0
  },
  verificationLevel: {
    type: String,
    enum: ['none', 'silver', 'gold'],
    default: 'none'
  },
  referralCode: {
    type: String,
    unique: true,
    required: true
  },
  invitedBy: {
    type: Number,
    default: null
  },
  inviteCount: {
    type: Number,
    default: 0
  },
  firstPurchaseDone: {
    type: Boolean,
    default: false
  },
  vpnActive: {
    type: Boolean,
    default: false
  },
  vpnData: {
    type: Object,
    default: {}
  },
  onboardingCompleted: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('User', userSchema);
