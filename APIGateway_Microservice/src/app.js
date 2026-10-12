require('dotenv').config();
require('express-async-errors');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const axios = require('axios');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const facilityRoutes = require('./routes/facilityRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const matchingRoutes = require('./routes/matchingRoutes');
const maintenanceRoutes = require('./routes/maintenanceRoutes');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: (process.env.CORS_ORIGIN || '*').split(',') }));
app.use(morgan('tiny'));
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (req, res) => res.json({ service: 'api-gateway', status: 'ok' }));

// Aggregated health of every downstream service
app.get('/health/services', async (req, res) => {
  const targets = {
    registration: 'REGISTRATION_URL', auth: 'AUTH_URL', facility: 'FACILITY_URL',
    reservation: 'RESERVATION_URL', matching: 'MATCHING_URL', maintenance: 'MAINTENANCE_URL',
  };
  const entries = await Promise.all(Object.entries(targets).map(async ([name, key]) => {
    try {
      const r = await axios.get(process.env[key] + '/health', { timeout: 2000, validateStatus: () => true });
      return [name, r.status === 200 ? 'up' : 'degraded'];
    } catch (e) { return [name, 'down']; }
  }));
  const services = Object.fromEntries(entries);
  res.status(Object.values(services).every((s) => s === 'up') ? 200 : 503).json({ gateway: 'up', services });
});

// Service-to-service endpoints are never reachable from outside.
app.use((req, res, next) => (/\/internal(\/|$)/i.test(req.path) ? res.status(404).json({ message: 'Route not found' }) : next()));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 50, message: { message: 'Too many attempts, slow down' } });
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/maintenance', maintenanceRoutes);

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });
  console.error(err);
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`api-gateway listening on ${PORT}`));

module.exports = app;
