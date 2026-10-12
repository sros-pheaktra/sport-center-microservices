const router = require('express').Router();
const proxy = require('../utils/proxy');
const authenticate = require('../middleware/authMiddleware');
const authorize = require('../middleware/roleMiddleware');

const forward = proxy('FACILITY_URL');

router.use(authenticate);

// Any authenticated user can browse.
router.get('*', forward);

// Only admins can modify facilities.
router.all('*', authorize('admin'), forward);

module.exports = router;