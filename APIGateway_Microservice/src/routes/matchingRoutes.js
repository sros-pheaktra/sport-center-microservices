const router = require('express').Router();
const proxy = require('../utils/proxy');
const authenticate = require('../middleware/authMiddleware');

router.use(authenticate);
router.all('*', proxy('MATCHING_URL'));

module.exports = router;
