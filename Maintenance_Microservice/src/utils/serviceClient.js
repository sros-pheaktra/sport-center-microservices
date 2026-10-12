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

module.exports = {
  getFacility: (id) => call('FACILITY_URL', 'get', `/${id}`),
  setFacilityStatus: (id, status, onlyIfCurrent) =>
    call('FACILITY_URL', 'patch', `/${id}/status`, { data: { status, onlyIfCurrent } }),
  findReservationConflicts: (facilityId, start, end) =>
    call('RESERVATION_URL', 'get', '/internal/conflicts', {
      params: { facilityId, start: start.toISOString(), end: end.toISOString() },
    }),
  cancelReservationConflicts: (facilityId, start, end, reason) =>
    call('RESERVATION_URL', 'post', '/internal/cancel-conflicts', {
      data: { facilityId, start: start.toISOString(), end: end.toISOString(), reason },
    }),
};
