const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    description: { type: String, maxlength: 300 },
    skillLevel: { type: String, enum: ['any', 'beginner', 'intermediate', 'advanced'], default: 'any' },
    ownerId: { type: String, required: true, index: true },
    isPublic: { type: Boolean, default: true },
    maxMembers: { type: Number, default: 12, min: 2, max: 50 },
    members: [
      new mongoose.Schema({ userId: String, name: String, joinedAt: { type: Date, default: Date.now } }, { _id: false }),
    ],
  },
  { timestamps: true }
);
groupSchema.index({ 'members.userId': 1 });

module.exports = mongoose.model('Group', groupSchema);
