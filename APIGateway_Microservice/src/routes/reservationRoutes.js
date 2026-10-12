const router = require('express').Router();
const proxy = require('../utils/proxy');
const authenticate = require('../middleware/authMiddleware');

// Ownership / staff rules are enforced inside the Reservation service.
router.use(authenticate);
router.all('*', proxy('RESERVATION_URL'));

module.exports = router;
