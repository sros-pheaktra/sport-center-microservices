const Maintenance = require('../models/Maintenance');
const clients = require('../utils/serviceClient');

const TRANSITIONS = { scheduled: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'] };

async function markFacilityUnderMaintenance(facilityId) {
  return clients.setFacilityStatus(facilityId, 'under_maintenance', 'active');
}

// POST /   body: { facilityId, title, description?, priority?, startTime, endTime, force? }
exports.create = async (req, res) => {
  const { facilityId, title, description, priority, startTime, endTime, force } = req.body;
  if (!facilityId || !title || !startTime || !endTime) {
    return res.status(400).json({ message: 'facilityId, title, startTime and endTime are required' });
  }
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start) || isNaN(end) || end <= start) {
    return res.status(400).json({ message: 'Invalid time range: endTime must be after startTime' });
  }

  const facility = await clients.getFacility(facilityId);
  if (facility.status === 404 || facility.status === 400) return res.status(404).json({ message: 'Facility not found' });
  if (facility.status !== 200) return res.status(502).json({ message: 'Could not load facility' });

  // Existing customer reservations inside the maintenance window?
  const conflictRes = await clients.findReservationConflicts(facilityId, start, end);
  const conflicts = conflictRes.status === 200 ? conflictRes.data.conflicts : [];
  if (conflicts.length && !force) {
    return res.status(409).json({
      message: `${conflicts.length} reservation(s) overlap this window. Resend with "force": true to cancel them.`,
      conflicts,
    });
  }
  if (conflicts.length && force) {
    await clients.cancelReservationConflicts(facilityId, start, end, 'Cancelled due to facility maintenance');
  }

  const startsNow = start <= new Date();
  const ticket = await Maintenance.create({
    facilityId, facilityName: facility.data.name, title, description, priority,
    startTime: start, endTime: end,
    status: startsNow ? 'in_progress' : 'scheduled',
    actualStart: startsNow ? new Date() : undefined,
    reportedBy: { id: req.user.id, name: req.user.name },
  });

  let warning;
  if (startsNow) {
    try { await markFacilityUnderMaintenance(facilityId); }
    catch (e) { warning = 'Ticket saved but facility status will sync shortly'; }
  }
  res.status(201).json({ ticket, cancelledReservations: force ? conflicts.length : 0, warning });
};

// GET /?status=&facilityId=
exports.list = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.facilityId) filter.facilityId = req.query.facilityId;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const [data, total] = await Promise.all([
    Maintenance.find(filter).sort({ startTime: -1 }).skip((page - 1) * limit).limit(limit),
    Maintenance.countDocuments(filter),
  ]);
  res.json({ data, page, limit, total });
};

// GET /:id
exports.get = async (req, res) => {
  const ticket = await Maintenance.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Maintenance ticket not found' });
  res.json(ticket);
};

// PUT /:id   (edit details of a ticket that has not finished)
exports.update = async (req, res) => {
  const ticket = await Maintenance.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Maintenance ticket not found' });
  if (['completed', 'cancelled'].includes(ticket.status)) {
    return res.status(409).json({ message: `Cannot edit a ${ticket.status} ticket` });
  }
  for (const k of ['title', 'description', 'priority', 'startTime', 'endTime']) {
    if (req.body[k] !== undefined) ticket[k] = req.body[k];
  }
  if (ticket.endTime <= ticket.startTime) return res.status(400).json({ message: 'endTime must be after startTime' });
  await ticket.save();
  res.json(ticket);
};

// PATCH /:id/status   body: { status }
exports.updateStatus = async (req, res) => {
  const { status } = req.body;
  const ticket = await Maintenance.findById(req.params.id);
  if (!ticket) return res.status(404).json({ message: 'Maintenance ticket not found' });

  const allowed = TRANSITIONS[ticket.status] || [];
  if (!allowed.includes(status)) {
    return res.status(409).json({ message: `Cannot move from ${ticket.status} to ${status}. Allowed: ${allowed.join(', ') || 'none'}` });
  }
  const wasInProgress = ticket.status === 'in_progress';
  ticket.status = status;
  if (status === 'in_progress') ticket.actualStart = new Date();
  if (status === 'completed' || status === 'cancelled') ticket.actualEnd = new Date();
  await ticket.save();

  let warning;
  try {
    if (status === 'in_progress') {
      await markFacilityUnderMaintenance(ticket.facilityId);
    } else if (wasInProgress) {
      // Reopen the facility only if no other ticket is still in progress for it.
      const others = await Maintenance.countDocuments({ facilityId: ticket.facilityId, status: 'in_progress', _id: { $ne: ticket._id } });
      if (others === 0) await clients.setFacilityStatus(ticket.facilityId, 'active', 'under_maintenance');
    }
  } catch (e) {
    warning = 'Ticket updated but facility status will sync shortly';
  }
  res.json({ ticket, warning });
};

// GET /facility/:facilityId/check?start=&end=   (called by the Reservation service)
exports.check = async (req, res) => {
  const start = new Date(req.query.start);
  const end = new Date(req.query.end);
  if (isNaN(start) || isNaN(end)) return res.status(400).json({ message: 'start and end are required ISO dates' });
  const conflicts = await Maintenance.find({
    facilityId: req.params.facilityId,
    $or: [
      { status: 'scheduled', startTime: { $lt: end }, endTime: { $gt: start } },
      { status: 'in_progress', startTime: { $lt: end } }, // still open => blocks until completed
    ],
  }).select('title status startTime endTime');
  res.json({ blocked: conflicts.length > 0, conflicts });
};

// Background job: start due tickets and heal facility status if a previous call failed.
exports.syncStatuses = async () => {
  try {
    const now = new Date();
    await Maintenance.updateMany(
      { status: 'scheduled', startTime: { $lte: now } },
      { status: 'in_progress', actualStart: now }
    );
    const active = await Maintenance.distinct('facilityId', { status: 'in_progress' });
    for (const id of active) await markFacilityUnderMaintenance(id);
  } catch (err) {
    console.error('Maintenance sync failed:', err.message);
  }
};
