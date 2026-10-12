const axios = require('axios');

module.exports = {
  // Asks the Reservation service whether the underlying reservation is still valid.
  getReservation: async (id) => {
    try {
      return await axios.get(`${process.env.RESERVATION_URL}/${id}`, {
        timeout: 5000, validateStatus: () => true,
        headers: { 'x-internal-key': process.env.INTERNAL_API_KEY, 'x-user-role': 'system' },
      });
    } catch (err) {
      const e = new Error('Upstream service unavailable (reservation)');
      e.status = 503;
      throw e;
    }
  },
};
