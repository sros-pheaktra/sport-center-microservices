const router = require('express').Router();

const c = require('../controllers/facilityController');
const { requireRole } = require('../middleware/gatewayTrust');

const admin = requireRole('admin');

router.get('/', c.list);
router.get('/:id', c.get);

router.post('/', admin, c.create);
router.put('/:id', admin, c.update);
router.patch('/:id/status', admin, c.updateStatus);
router.delete('/:id', admin, c.remove);

module.exports = router;