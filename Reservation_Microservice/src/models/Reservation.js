const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    userName: String,
    facilityId: { type: String, required: true },
    facilityName: String,
    facilityType: String,
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    status: { type: String, enum: ['confirmed', 'cancelled', 'completed'], default: 'confirmed' },
    totalPrice: { type: Number, min: 0 },
    notes: { type: String, maxlength: 500 },

    // Player matching
    isOpenForMatching: { type: Boolean, default: false },
    playersNeeded: { type: Number, min: 1 },
    skillLevel: { type: String, enum: ['any', 'beginner', 'intermediate', 'advanced'], default: 'any' },

    cancelledAt: Date,
    cancelReason: String,
  },
  { timestamps: true }
);
// Fast overlap lookups per facility
schema.index({ facilityId: 1, status: 1, startTime: 1, endTime: 1 });
schema.index({ userId: 1, startTime: -1 });

module.exports = mongoose.model('Reservation', schema);
