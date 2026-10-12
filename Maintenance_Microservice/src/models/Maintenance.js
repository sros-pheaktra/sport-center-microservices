const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    facilityId: { type: String, required: true, index: true },
    facilityName: String,
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, maxlength: 2000 },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    status: { type: String, enum: ['scheduled', 'in_progress', 'completed', 'cancelled'], default: 'scheduled' },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    actualStart: Date,
    actualEnd: Date,
    reportedBy: { id: String, name: String },
  },
  { timestamps: true }
);
schema.index({ facilityId: 1, status: 1, startTime: 1 });

module.exports = mongoose.model('Maintenance', schema);
