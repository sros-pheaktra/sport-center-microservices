const mongoose = require('mongoose');

// Audit trail + brute-force lockout. Documents expire after 24h.
const schema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  success: { type: Boolean, required: true },
  ip: String,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

module.exports = mongoose.model('LoginAttempt', schema);
