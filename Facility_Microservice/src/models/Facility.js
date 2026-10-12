const mongoose = require('mongoose');

const TYPES = ['basketball', 'football', 'badminton', 'tennis'];
const STATUSES = ['active', 'under_maintenance', 'inactive'];

const facilitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    type: { type: String, required: true, enum: TYPES },
    location: { type: String, trim: true, maxlength: 200 },
    capacity: { type: Number, required: true, min: 1 },   // max players
    pricePerHour: { type: Number, required: true, min: 0 },
    description: { type: String, maxlength: 1000 },
    status: { type: String, enum: STATUSES, default: 'active' },
  },
  { timestamps: true }
);
facilitySchema.index({ type: 1, status: 1 });

module.exports = mongoose.model('Facility', facilitySchema);
module.exports.TYPES = TYPES;
module.exports.STATUSES = STATUSES;
