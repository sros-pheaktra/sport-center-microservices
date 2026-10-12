// End-to-end flow against the running stack:  docker compose up --build -d && node scripts/smoke-test.js
// Requires Node 18+. Override with GATEWAY_URL / STAFF_SIGNUP_CODE if you changed them.
const BASE = process.env.GATEWAY_URL || 'http://localhost:3000';
const STAFF_CODE = process.env.STAFF_SIGNUP_CODE || 'staff-secret-code';
const run = Date.now();
let failed = 0;

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}
function expect(label, cond, detail) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  -> ' + JSON.stringify(detail)}`);
  if (!cond) failed++;
}
const hoursFromNow = (h) => new Date(Date.now() + h * 3600e3).toISOString();

async function signup(name, extra = {}) {
  const email = `${name}.${run}@test.com`;
  const reg = await api('POST', '/api/auth/register', { body: { name, email, password: 'password123', ...extra } });
  const login = await api('POST', '/api/auth/login', { body: { email, password: 'password123' } });
  return { reg, token: login.data && login.data.token, login };
}

(async () => {
  const health = await api('GET', '/health/services');
  expect('all services healthy', health.status === 200, health.data);

  const admin = await signup('Admin', { role: 'admin', staffCode: STAFF_CODE });
  const alice = await signup('Alice');
  const bob = await signup('Bob');
  expect('admin / alice / bob can register + login', admin.token && alice.token && bob.token, [admin.reg.data, alice.reg.data]);
  expect('customer cannot self-register as admin', (await api('POST', '/api/auth/register', { body: { name: 'Evil', email: `evil.${run}@test.com`, password: 'password123', role: 'admin' } })).status === 403);
  expect('wrong password rejected', (await api('POST', '/api/auth/login', { body: { email: `alice.${run}@test.com`, password: 'nope-nope' } })).status === 401);

  // Facilities
  const court = await api('POST', '/api/facilities', { token: admin.token, body: { name: `Court A ${run}`, type: 'badminton', location: 'Hall 1', capacity: 4, pricePerHour: 12 } });
  expect('admin creates facility', court.status === 201, court.data);
  expect('customer cannot create facility', (await api('POST', '/api/facilities', { token: alice.token, body: { name: 'x', type: 'tennis', capacity: 2, pricePerHour: 1 } })).status === 403);
  const fid = court.data._id;

  // Reservations
  const slot = { startTime: hoursFromNow(48), endTime: hoursFromNow(50) };
  const r1 = await api('POST', '/api/reservations', { token: alice.token, body: { facilityId: fid, ...slot, isOpenForMatching: true, playersNeeded: 2, skillLevel: 'intermediate' } });
  expect('alice reserves, open for matching', r1.status === 201 && r1.data.totalPrice === 24, r1.data);
  const clash = await api('POST', '/api/reservations', { token: bob.token, body: { facilityId: fid, startTime: hoursFromNow(49), endTime: hoursFromNow(51) } });
  expect('overlapping booking rejected', clash.status === 409, clash.data);
  expect('past booking rejected', (await api('POST', '/api/reservations', { token: bob.token, body: { facilityId: fid, startTime: hoursFromNow(-3), endTime: hoursFromNow(-2) } })).status === 400);

  // Matching
  const open = await api('GET', '/api/matching/matches?type=badminton', { token: bob.token });
  const match = open.data && open.data.data && open.data.data.find((m) => m.reservationId === r1.data._id);
  expect('match appears in discovery', !!match && match.slotsLeft === 2, open.data);
  const join = await api('POST', `/api/matching/matches/${match._id}/join`, { token: bob.token, body: {} });
  expect('bob joins the match', join.status === 200 && join.data.filledCount === 1, join.data);
  expect('bob cannot join twice', (await api('POST', `/api/matching/matches/${match._id}/join`, { token: bob.token, body: {} })).status === 409);
  expect('host cannot join own match', (await api('POST', `/api/matching/matches/${match._id}/join`, { token: alice.token, body: {} })).status === 400);

  const group = await api('POST', '/api/matching/groups', { token: admin.token, body: { name: `Admin Squad ${run}` } });
  expect('group created', group.status === 201, group.data);
  const tooBig = await api('POST', `/api/matching/matches/${match._id}/join`, { token: admin.token, body: { groupId: group.data._id } });
  expect('group of 1 fills the last spot -> match full', tooBig.status === 200 && tooBig.data.status === 'full', tooBig.data);
  await api('POST', `/api/matching/matches/${match._id}/leave`, { token: bob.token });
  const afterLeave = await api('GET', `/api/matching/matches/${match._id}`, { token: bob.token });
  expect('leaving frees a spot and reopens match', afterLeave.data.status === 'open' && afterLeave.data.slotsLeft === 1, afterLeave.data);

  // Maintenance
  expect('customer cannot see maintenance', (await api('GET', '/api/maintenance', { token: alice.token })).status === 403);
  const m1 = await api('POST', '/api/maintenance', { token: admin.token, body: { facilityId: fid, title: 'Replace net', startTime: hoursFromNow(48), endTime: hoursFromNow(52) } });
  expect('maintenance over a booked slot -> 409 with conflicts', m1.status === 409 && m1.data.conflicts.length === 1, m1.data);
  const m2 = await api('POST', '/api/maintenance', { token: admin.token, body: { facilityId: fid, title: 'Replace net', startTime: hoursFromNow(48), endTime: hoursFromNow(52), force: true } });
  expect('force=true cancels reservation and creates ticket', m2.status === 201 && m2.data.cancelledReservations === 1, m2.data);
  const r1After = await api('GET', `/api/reservations/${r1.data._id}`, { token: alice.token });
  expect('alice reservation was cancelled', r1After.data.status === 'cancelled', r1After.data);
  const matchAfter = await api('GET', `/api/matching/matches/${match._id}`, { token: bob.token });
  expect('its match was cancelled too', matchAfter.data.status === 'cancelled', matchAfter.data);
  const blocked = await api('POST', '/api/reservations', { token: bob.token, body: { facilityId: fid, startTime: hoursFromNow(49), endTime: hoursFromNow(50) } });
  expect('booking inside maintenance window rejected', blocked.status === 409, blocked.data);

  // Immediate maintenance => facility goes under_maintenance, then back
  const m3 = await api('POST', '/api/maintenance', { token: admin.token, body: { facilityId: fid, title: 'Flood', priority: 'urgent', startTime: hoursFromNow(-1), endTime: hoursFromNow(2) } });
  expect('immediate ticket is in_progress', m3.status === 201 && m3.data.ticket.status === 'in_progress', m3.data);
  expect('facility is under_maintenance', (await api('GET', `/api/facilities/${fid}`, { token: alice.token })).data.status === 'under_maintenance');
  expect('cannot reserve unavailable facility', (await api('POST', '/api/reservations', { token: bob.token, body: { facilityId: fid, startTime: hoursFromNow(100), endTime: hoursFromNow(101) } })).status === 409);
  await api('PATCH', `/api/maintenance/${m3.data.ticket._id}/status`, { token: admin.token, body: { status: 'completed' } });
  expect('facility active again after completion', (await api('GET', `/api/facilities/${fid}`, { token: alice.token })).data.status === 'active');

  console.log(failed ? `\n${failed} check(s) failed` : '\nAll smoke checks passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
