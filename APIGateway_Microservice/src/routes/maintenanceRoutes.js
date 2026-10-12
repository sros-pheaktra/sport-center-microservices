const router = require('express').Router();
const proxy = require('../utils/proxy');
const authenticate = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');

router.use(authenticate, authorize('admin'));
router.all('*', proxy('MAINTENANCE_URL'));

module.exports = router;
