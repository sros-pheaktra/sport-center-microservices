const axios = require('axios');

async function call(envKey, method, path, { params, data } = {}) {
  try {
    return await axios({
      method, url: process.env[envKey] + path, params, data, timeout: 5000, validateStatus: () => true,
      headers: { 'x-internal-key': process.env.INTERNAL_API_KEY, 'x-user-role': 'system' },
    });
  } catch (err) {
    const e = new Error(`Upstream service unavailable (${envKey.replace('_URL', '').toLowerCase()})`);
    e.status = 503;
    throw e;
  }
}

// Match snapshot sent to the Matching service
const toMatchPayload = (r) => ({
  reservationId: String(r._id), hostId: r.userId, hostName: r.userName,
  facilityId: r.facilityId, facilityName: r.facilityName, facilityType: r.facilityType,
  startTime: r.startTime, endTime: r.endTime, playersNeeded: r.playersNeeded, skillLevel: r.skillLevel,
});

module.exports = {
  getFacility: (id) => call('FACILITY_URL', 'get', `/${id}`),
  checkMaintenance: (facilityId, start, end) =>
    call('MAINTENANCE_URL', 'get', `/facility/${facilityId}/check`, {
      params: { start: start.toISOString(), end: end.toISOString() },
    }),
  // Matching is best-effort: a reservation must never fail because matching is down.
  openMatch: (reservation) =>
    call('MATCHING_URL', 'post', '/internal/matches', { data: toMatchPayload(reservation) }).catch((e) => console.warn(e.message)),
  closeMatch: (reservationId, reason) =>
    call('MATCHING_URL', 'post', `/internal/matches/reservation/${reservationId}/close`, { data: { reason } }).catch((e) => console.warn(e.message)),
};
