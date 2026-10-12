const Facility = require('../models/Facility');

const EDITABLE = ['name', 'type', 'location', 'capacity', 'pricePerHour', 'description', 'status'];
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

// GET /?type=&status=&q=&page=&limit=
exports.list = async (req, res) => {
  const { type, status, q } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const filter = {};
  if (type) filter.type = type;
  if (status) filter.status = status;
  if (q) filter.name = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  // Customers never see retired facilities.
  if (req.user.role === 'customer' && !status) filter.status = { $ne: 'inactive' };

  const [data, total] = await Promise.all([
    Facility.find(filter).sort({ type: 1, name: 1 }).skip((page - 1) * limit).limit(limit),
    Facility.countDocuments(filter),
  ]);
  res.json({ data, page, limit, total });
};

// GET /:id
exports.get = async (req, res) => {
  const facility = await Facility.findById(req.params.id);
  if (!facility) return res.status(404).json({ message: 'Facility not found' });
  res.json(facility);
};

// POST /
exports.create = async (req, res) => {
  const facility = await Facility.create(pick(req.body, EDITABLE));
  res.status(201).json(facility);
};

// PUT /:id
exports.update = async (req, res) => {
  const facility = await Facility.findByIdAndUpdate(req.params.id, pick(req.body, EDITABLE), {
    new: true, runValidators: true,
  });
  if (!facility) return res.status(404).json({ message: 'Facility not found' });
  res.json(facility);
};

// PATCH /:id/status (admin)
// body: { status, onlyIfCurrent? }  -> onlyIfCurrent makes the change conditional/idempotent
exports.updateStatus = async (req, res) => {
  const { status, onlyIfCurrent } = req.body;
  if (!Facility.STATUSES.includes(status)) {
    return res.status(400).json({ message: `status must be one of: ${Facility.STATUSES.join(', ')}` });
  }
  const facility = await Facility.findById(req.params.id);
  if (!facility) return res.status(404).json({ message: 'Facility not found' });
  if (onlyIfCurrent && facility.status !== onlyIfCurrent) return res.json({ facility, changed: false });
  facility.status = status;
  await facility.save();
  res.json({ facility, changed: true });
};

// DELETE /:id
exports.remove = async (req, res) => {
  const facility = await Facility.findByIdAndDelete(req.params.id);
  if (!facility) return res.status(404).json({ message: 'Facility not found' });
  res.json({ message: 'Facility deleted' });
};
