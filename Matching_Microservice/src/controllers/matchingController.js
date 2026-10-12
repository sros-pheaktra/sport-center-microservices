const Match = require('../models/Match');
const Group = require('../models/Group');
const clients = require('../utils/serviceClient');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const withSlots = (m) => ({ ...m.toObject(), slotsLeft: Math.max(0, m.playersNeeded - m.filledCount) });

// ======================= INTERNAL (Reservation service) =======================

// POST /internal/matches   -> create or refresh the match for a reservation
exports.upsertFromReservation = async (req, res) => {
  const r = req.body;
  if (!r.reservationId || !r.hostId || !r.startTime || !r.endTime || !r.playersNeeded) {
    throw httpError(400, 'reservationId, hostId, startTime, endTime and playersNeeded are required');
  }
  let match = await Match.findOne({ reservationId: r.reservationId });
  if (!match) match = new Match({ reservationId: r.reservationId, hostId: r.hostId, participants: [], filledCount: 0 });
  Object.assign(match, {
    hostName: r.hostName, facilityId: r.facilityId, facilityName: r.facilityName, facilityType: r.facilityType,
    startTime: r.startTime, endTime: r.endTime, playersNeeded: r.playersNeeded, skillLevel: r.skillLevel || 'any',
    cancelReason: undefined,
  });
  match.status = match.filledCount >= match.playersNeeded ? 'full' : 'open';
  await match.save();
  res.status(200).json(withSlots(match));
};

// POST /internal/matches/reservation/:reservationId/close
exports.closeByReservation = async (req, res) => {
  const match = await Match.findOneAndUpdate(
    { reservationId: req.params.reservationId, status: { $in: ['open', 'full'] } },
    { status: 'cancelled', cancelReason: req.body.reason || 'Reservation no longer open for matching' },
    { new: true }
  );
  res.json({ closed: !!match });
};

// ======================= MATCHES =======================

// GET /matches?type=&skillLevel=&from=&to=&page=&limit=   -> upcoming open matches
exports.listOpen = async (req, res) => {
  const { type, skillLevel, from, to } = req.query;
  const filter = { status: 'open', startTime: { $gt: new Date() } };
  if (from) filter.startTime.$gte = new Date(from);
  if (to) filter.startTime.$lte = new Date(to);
  if (type) filter.facilityType = type;
  if (skillLevel) filter.skillLevel = { $in: [skillLevel, 'any'] };
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
  const [rows, total] = await Promise.all([
    Match.find(filter).sort({ startTime: 1 }).skip((page - 1) * limit).limit(limit),
    Match.countDocuments(filter),
  ]);
  res.json({ data: rows.map(withSlots), page, limit, total });
};

// GET /matches/mine   -> matches I host or have joined
exports.mine = async (req, res) => {
  const rows = await Match.find({ $or: [{ hostId: req.user.id }, { 'participants.userId': req.user.id }] })
    .sort({ startTime: -1 }).limit(100);
  res.json(rows.map(withSlots));
};

// GET /matches/:id
exports.getMatch = async (req, res) => {
  const match = await Match.findById(req.params.id);
  if (!match) throw httpError(404, 'Match not found');
  res.json(withSlots(match));
};

// POST /matches/:id/join   body: { groupId? }  -> join alone, or bring a group you belong to
exports.join = async (req, res) => {
  const uid = req.user.id;
  const match = await Match.findById(req.params.id);
  if (!match) throw httpError(404, 'Match not found');
  if (match.startTime <= new Date()) throw httpError(409, 'This session has already started');
  if (match.hostId === uid) throw httpError(400, 'You are the host of this session');

  let count = 1;
  let group = null;
  if (req.body.groupId) {
    group = await Group.findById(req.body.groupId);
    if (!group) throw httpError(404, 'Group not found');
    if (group.ownerId !== uid) throw httpError(403, 'Only the group owner can enter the group into a match');
    count = group.members.length;
  }

  // Ask the Reservation service if the booking is still valid and still open.
  const rRes = await clients.getReservation(match.reservationId);
  const valid = rRes.status === 200 && rRes.data.status === 'confirmed' && rRes.data.isOpenForMatching;
  if (!valid) {
    await Match.updateOne({ _id: match._id }, { status: 'cancelled', cancelReason: 'Reservation is no longer open' });
    throw httpError(409, 'This session is no longer available');
  }

  // Atomic: only succeeds if there is room, the match is open and the user has not joined yet.
  const joined = await Match.findOneAndUpdate(
    {
      _id: match._id, status: 'open', hostId: { $ne: uid }, 'participants.userId': { $ne: uid },
      $expr: { $lte: [{ $add: ['$filledCount', count] }, '$playersNeeded'] },
    },
    {
      $push: { participants: { userId: uid, name: req.user.name, groupId: group && String(group._id), groupName: group && group.name, count } },
      $inc: { filledCount: count },
    },
    { new: true }
  );

  if (!joined) {
    const fresh = await Match.findById(match._id);
    if (fresh.participants.some((p) => p.userId === uid)) throw httpError(409, 'You already joined this session');
    if (fresh.status !== 'open') throw httpError(409, `Session is ${fresh.status}`);
    throw httpError(409, `Not enough room: ${fresh.playersNeeded - fresh.filledCount} spot(s) left, you need ${count}`);
  }

  await Match.updateOne({ _id: joined._id, status: 'open', $expr: { $gte: ['$filledCount', '$playersNeeded'] } }, { status: 'full' });
  res.json(withSlots(await Match.findById(joined._id)));
};

// POST /matches/:id/leave
exports.leave = async (req, res) => {
  const uid = req.user.id;
  const match = await Match.findById(req.params.id);
  if (!match) throw httpError(404, 'Match not found');
  const entry = match.participants.find((p) => p.userId === uid);
  if (!entry) throw httpError(409, 'You are not part of this session');
  if (match.startTime <= new Date()) throw httpError(409, 'This session has already started');

  await Match.updateOne(
    { _id: match._id, 'participants.userId': uid },
    { $pull: { participants: { userId: uid } }, $inc: { filledCount: -entry.count } }
  );
  await Match.updateOne({ _id: match._id, status: 'full', $expr: { $lt: ['$filledCount', '$playersNeeded'] } }, { status: 'open' });
  res.json(withSlots(await Match.findById(match._id)));
};

// ======================= GROUPS =======================

// POST /groups   body: { name, description?, skillLevel?, isPublic?, maxMembers? }
exports.createGroup = async (req, res) => {
  const { name, description, skillLevel, isPublic, maxMembers } = req.body;
  const group = await Group.create({
    name, description, skillLevel, isPublic, maxMembers,
    ownerId: req.user.id, members: [{ userId: req.user.id, name: req.user.name }],
  });
  res.status(201).json(group);
};

// GET /groups?scope=mine|public
exports.listGroups = async (req, res) => {
  const filter = req.query.scope === 'public' ? { isPublic: true } : { 'members.userId': req.user.id };
  res.json(await Group.find(filter).sort({ createdAt: -1 }).limit(100));
};

// GET /groups/:id
exports.getGroup = async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw httpError(404, 'Group not found');
  const isMember = group.members.some((m) => m.userId === req.user.id);
  if (!group.isPublic && !isMember) throw httpError(403, 'This group is private');
  res.json(group);
};

// POST /groups/:id/join
exports.joinGroup = async (req, res) => {
  const uid = req.user.id;
  const group = await Group.findOneAndUpdate(
    {
      _id: req.params.id, isPublic: true, 'members.userId': { $ne: uid },
      $expr: { $lt: [{ $size: '$members' }, '$maxMembers'] },
    },
    { $push: { members: { userId: uid, name: req.user.name } } },
    { new: true }
  );
  if (!group) {
    const g = await Group.findById(req.params.id);
    if (!g) throw httpError(404, 'Group not found');
    if (g.members.some((m) => m.userId === uid)) throw httpError(409, 'You are already a member');
    if (!g.isPublic) throw httpError(403, 'This group is private');
    throw httpError(409, 'Group is full');
  }
  res.json(group);
};

// POST /groups/:id/leave
exports.leaveGroup = async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw httpError(404, 'Group not found');
  if (group.ownerId === req.user.id) throw httpError(400, 'The owner cannot leave. Delete the group instead.');
  if (!group.members.some((m) => m.userId === req.user.id)) throw httpError(409, 'You are not a member');
  group.members = group.members.filter((m) => m.userId !== req.user.id);
  await group.save();
  res.json(group);
};

// DELETE /groups/:id
exports.deleteGroup = async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) throw httpError(404, 'Group not found');
  if (group.ownerId !== req.user.id && req.user.role !== 'admin') {
  throw httpError(403, 'Only the owner or an admin can delete this group');}
  await group.deleteOne();
  res.json({ message: 'Group deleted' });
};
