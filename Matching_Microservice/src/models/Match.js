const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    name: String,
    groupId: String,
    groupName: String,
    count: { type: Number, default: 1, min: 1 }, // 1 for an individual, group size for a group
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// A "match" is the public, joinable side of a reservation that was opened for matching.
const matchSchema = new mongoose.Schema(
  {
    reservationId: { type: String, required: true, unique: true },
    hostId: { type: String, required: true, index: true },
    hostName: String,
    facilityId: String,
    facilityName: String,
    facilityType: String,
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    playersNeeded: { type: Number, required: true, min: 1 },
    skillLevel: { type: String, enum: ['any', 'beginner', 'intermediate', 'advanced'], default: 'any' },
    filledCount: { type: Number, default: 0, min: 0 },
    participants: [participantSchema],
    status: { type: String, enum: ['open', 'full', 'cancelled'], default: 'open' },
    cancelReason: String,
  },
  { timestamps: true }
);
matchSchema.index({ status: 1, startTime: 1 });
matchSchema.index({ 'participants.userId': 1 });

module.exports = mongoose.model('Match', matchSchema);
