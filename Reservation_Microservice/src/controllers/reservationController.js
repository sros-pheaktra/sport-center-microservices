const Reservation = require('../models/Reservation');
const clients = require('../utils/serviceClient');

const MAX_HOURS = Number(process.env.MAX_BOOKING_HOURS || 4);
const MIN_MINUTES = 30;
const isStaff = (u) => ['admin', 'system'].includes(u.role);
const httpError = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });

const overlapQuery = (facilityId, start, end) => ({
  facilityId, status: 'confirmed', startTime: { $lt: end }, endTime: { $gt: start },
});

function parseRange(startTime, endTime) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start) || isNaN(end)) throw httpError(400, 'startTime and endTime must be valid ISO dates');
  if (end <= start) throw httpError(400, 'endTime must be after startTime');
  return { start, end };
}

// POST /   body: { facilityId, startTime, endTime, notes?, isOpenForMatching?, playersNeeded?, skillLevel? }
exports.create = async (req, res) => {
  const { facilityId, startTime, endTime, notes, isOpenForMatching = false, playersNeeded, skillLevel = 'any' } = req.body;
  if (!facilityId || !startTime || !endTime) throw httpError(400, 'facilityId, startTime and endTime are required');

  const { start, end } = parseRange(startTime, endTime);
  const minutes = (end - start) / 60000;
  if (start <= new Date()) throw httpError(400, 'Reservations must start in the future');
  if (minutes < MIN_MINUTES) throw httpError(400, `Minimum booking is ${MIN_MINUTES} minutes`);
  if (minutes > MAX_HOURS * 60) throw httpError(400, `Maximum booking is ${MAX_HOURS} hours`);

  // 1. Facility must exist and be active (Facility service)
  const fRes = await clients.getFacility(facilityId);
  if (fRes.status === 404 || fRes.status === 400) throw httpError(404, 'Facility not found');
  if (fRes.status !== 200) throw httpError(502, 'Could not load facility');
  const facility = fRes.data;
  if (facility.status !== 'active') throw httpError(409, `Facility is not available (${facility.status})`);

  // 2. Matching options
  if (isOpenForMatching) {
    if (!Number.isInteger(playersNeeded) || playersNeeded < 1 || playersNeeded > facility.capacity) {
      throw httpError(400, `playersNeeded must be an integer between 1 and ${facility.capacity} when open for matching`);
    }
  }

  // 3. Maintenance window? (Maintenance service)
  const mRes = await clients.checkMaintenance(facilityId, start, end);
  if (mRes.status !== 200) throw httpError(502, 'Could not verify maintenance schedule');
  if (mRes.data.blocked) {
    throw httpError(409, 'Facility is scheduled for maintenance during this time', { maintenance: mRes.data.conflicts });
  }

  // 4. Double-booking check
  if (await Reservation.exists(overlapQuery(facilityId, start, end))) {
    throw httpError(409, 'That time slot is already booked');
  }

  const reservation = await Reservation.create({
    userId: req.user.id, userName: req.user.name,
    facilityId, facilityName: facility.name, facilityType: facility.type,
    startTime: start, endTime: end,
    totalPrice: Math.round(facility.pricePerHour * (minutes / 60) * 100) / 100,
    notes, isOpenForMatching: !!isOpenForMatching,
    playersNeeded: isOpenForMatching ? playersNeeded : undefined, skillLevel,
  });

  // 5. Race-condition guard: two requests can pass step 4 at the same moment.
  //    After inserting, re-check; if anything else overlaps, back off (both callers may retry).
  const clash = await Reservation.exists({ ...overlapQuery(facilityId, start, end), _id: { $ne: reservation._id } });
  if (clash) {
    await Reservation.deleteOne({ _id: reservation._id });
    throw httpError(409, 'That time slot was just booked by someone else. Please try again.');
  }

  if (reservation.isOpenForMatching) await clients.openMatch(reservation);
  res.status(201).json(reservation);
};

// GET /my?status=
exports.mine = async (req, res) => {
  const filter = { userId: req.user.id };
  if (req.query.status) filter.status = req.query.status;
  res.json(await Reservation.find(filter).sort({ startTime: -1 }).limit(100));
};

// GET /?facilityId=&userId=&status=&from=&to=&page=&limit=   (staff)
exports.list = async (req, res) => {
  const filter = {};
  for (const k of ['facilityId', 'userId', 'status']) if (req.query[k]) filter[k] = req.query[k];
  if (req.query.from || req.query.to) {
    filter.startTime = {};
    if (req.query.from) filter.startTime.$gte = new Date(req.query.from);
    if (req.query.to) filter.startTime.$lte = new Date(req.query.to);
  }
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const [data, total] = await Promise.all([
    Reservation.find(filter).sort({ startTime: -1 }).skip((page - 1) * limit).limit(limit),
    Reservation.countDocuments(filter),
  ]);
  res.json({ data, page, limit, total });
};

// GET /availability?facilityId=&date=YYYY-MM-DD   -> booked + maintenance windows for that (UTC) day
exports.availability = async (req, res) => {
  const { facilityId, date } = req.query;
  if (!facilityId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    throw httpError(400, 'facilityId and date (YYYY-MM-DD) are required');
  }
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
  const [booked, mRes] = await Promise.all([
    Reservation.find(overlapQuery(facilityId, dayStart, dayEnd)).select('startTime endTime isOpenForMatching').sort({ startTime: 1 }),
    clients.checkMaintenance(facilityId, dayStart, dayEnd),
  ]);
  res.json({ facilityId, date, booked, maintenance: mRes.status === 200 ? mRes.data.conflicts : [] });
};

// GET /:id   (owner, staff, or internal service)

exports.get = async (req, res) => {
  const r = await Reservation.findById(req.params.id);
  if (!r) throw httpError(404, 'Reservation not found');

  // Trusted internal services may read reservations without a user ID.
  if (req.user?.role !== 'system') {
    if (!req.user?.id) throw httpError(401, 'Authentication required');
    if (!isStaff(req.user) && String(r.userId) !== String(req.user.id)) {
      throw httpError(403, 'Not your reservation');
    }
  }

  res.json(r);
};


// PATCH /:id/cancel   body: { reason? }
exports.cancel = async (req, res) => {
  const r = await Reservation.findById(req.params.id);
  if (!r) throw httpError(404, 'Reservation not found');
  if (!isStaff(req.user) && r.userId !== req.user.id) throw httpError(403, 'Not your reservation');
  if (r.status !== 'confirmed') throw httpError(409, `Reservation is already ${r.status}`);
  if (r.startTime <= new Date() && !isStaff(req.user)) throw httpError(409, 'Cannot cancel a reservation that has already started');

  r.status = 'cancelled';
  r.cancelledAt = new Date();
  r.cancelReason = req.body.reason || 'Cancelled by user';
  await r.save();
  if (r.isOpenForMatching) await clients.closeMatch(r._id, 'Host cancelled the reservation');
  res.json(r);
};

// PATCH /:id/matching   body: { isOpenForMatching, playersNeeded?, skillLevel? }
exports.setMatching = async (req, res) => {
  const r = await Reservation.findById(req.params.id);
  if (!r) throw httpError(404, 'Reservation not found');
  if (r.userId !== req.user.id) throw httpError(403, 'Only the reservation owner can change matching');
  if (r.status !== 'confirmed' || r.startTime <= new Date()) throw httpError(409, 'Only upcoming confirmed reservations can be opened for matching');

  const { isOpenForMatching, playersNeeded, skillLevel } = req.body;
  if (typeof isOpenForMatching !== 'boolean') throw httpError(400, 'isOpenForMatching (boolean) is required');

  if (isOpenForMatching) {
    const fRes = await clients.getFacility(r.facilityId);
    const cap = fRes.status === 200 ? fRes.data.capacity : null;
    const needed = playersNeeded ?? r.playersNeeded;
    if (!Number.isInteger(needed) || needed < 1 || (cap && needed > cap)) {
      throw httpError(400, `playersNeeded must be an integer between 1 and ${cap || 'capacity'}`);
    }
    r.playersNeeded = needed;
    if (skillLevel) r.skillLevel = skillLevel;
    r.isOpenForMatching = true;
    await r.save();
    await clients.openMatch(r);
  } else {
    r.isOpenForMatching = false;
    await r.save();
    await clients.closeMatch(r._id, 'Host closed matching');
  }
  res.json(r);
};

// ---- Internal endpoints (Maintenance service) ----

// GET /internal/conflicts?facilityId=&start=&end=
exports.conflicts = async (req, res) => {
  const { start, end } = parseRange(req.query.start, req.query.end);
  const conflicts = await Reservation.find(overlapQuery(req.query.facilityId, start, end))
    .select('userId userName startTime endTime');
  res.json({ conflicts });
};

// POST /internal/cancel-conflicts   body: { facilityId, start, end, reason }
exports.cancelConflicts = async (req, res) => {
  const { start, end } = parseRange(req.body.start, req.body.end);
  const affected = await Reservation.find(overlapQuery(req.body.facilityId, start, end));
  await Reservation.updateMany(
    { _id: { $in: affected.map((r) => r._id) } },
    { status: 'cancelled', cancelledAt: new Date(), cancelReason: req.body.reason || 'Cancelled by facility' }
  );
  await Promise.all(affected.filter((r) => r.isOpenForMatching).map((r) => clients.closeMatch(r._id, req.body.reason)));
  res.json({ cancelled: affected.length });
};
