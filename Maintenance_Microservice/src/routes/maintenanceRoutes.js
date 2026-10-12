const router = require('express').Router();
const c = require('../controllers/maintenanceController');
const { requireRole } = require('../middleware/gatewayTrust');

const staff = requireRole('admin');

// Internal (Reservation service) - declared before '/:id'
router.get('/facility/:facilityId/check', requireRole(), c.check); // 'system' only

router.post('/', staff, c.create);
router.get('/', staff, c.list);
router.get('/:id', staff, c.get);
router.put('/:id', staff, c.update);
router.patch('/:id/status', staff, c.updateStatus);

module.exports = router;
