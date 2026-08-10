// models/Transaction.js
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['buy', 'sell', 'withdraw', 'pending'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'IRR'
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['completed', 'pending', 'failed'],
    default: 'completed'
  },
  trackingCode: {
    type: String,
    default: () => Math.random().toString(36).substring(2, 10).toUpperCase()
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Transaction', transactionSchema);
