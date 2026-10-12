const router = require('express').Router();

const c = require('../controllers/reservationController');
const { requireRole, requireUser } = require('../middleware/gatewayTrust');

// Internal service-to-service endpoints.
router.get('/internal/conflicts', requireRole('system'), c.conflicts);
router.post('/internal/cancel-conflicts', requireRole('system'), c.cancelConflicts);

router.use(requireUser);

router.get('/availability', c.availability);
router.get('/my', c.mine);

router.get('/', requireRole('admin'), c.list);

router.post('/', c.create);

router.get('/:id', c.get);
router.patch('/:id/cancel', c.cancel);
router.patch('/:id/matching', c.setMatching);

module.exports = router;