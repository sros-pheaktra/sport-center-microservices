const router = require('express').Router();

const c = require('../controllers/reservationController');
const { requireRole, requireUser } = require('../middleware/gatewayTrust');

// Internal service-to-service endpoints.
router.get('/internal/conflicts', requireRole('system'), c.conflicts);
router.post('/internal/cancel-conflicts', requireRole('system'), c.cancelConflicts);

router.get('/availability', requireUser, c.availability);
router.get('/my', requireUser, c.mine);

router.get('/', requireUser, requireRole('admin'), c.list);
router.post('/', requireUser, c.create);

router.get('/:id', (req, res, next) => {
  if (req.headers['x-user-role'] === 'system') {
    return c.get(req, res, next);
  }
  return requireUser(req, res, next);
});

router.patch('/:id/cancel', requireUser, c.cancel);
router.patch('/:id/matching', requireUser, c.setMatching);



module.exports = router;