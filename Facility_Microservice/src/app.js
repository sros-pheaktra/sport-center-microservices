require('dotenv').config();
require('express-async-errors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const { internalOnly, attachUser } = require('./middleware/gatewayTrust');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes/facilityRoutes');

const app = express();
app.use(helmet());
app.use(express.json({ limit: '100kb' }));
app.use(morgan('tiny'));

// Liveness/readiness: used by Docker and orchestrators. Not behind the internal key.
app.get('/health', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? 200 : 503).json({ service: 'facility-service', status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' });
});

app.use(internalOnly, attachUser);
app.use('/', routes);
app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
app.use(errorHandler);

const PORT = process.env.PORT || 3003;
if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => console.log('facility-service listening on ' + PORT));
  });
  process.on('SIGTERM', () => mongoose.disconnect().finally(() => process.exit(0)));
}

module.exports = app;
