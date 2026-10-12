const router = require('express').Router();
const c = require('../controllers/matchingController');
const { requireRole, requireUser } = require('../middleware/gatewayTrust');

// Internal (Reservation service)
router.post('/internal/matches', requireRole('system'), c.upsertFromReservation);

router.post(
  '/internal/matches/reservation/:reservationId/close',
  requireRole('system'),
  c.closeByReservation
);

router.use(requireUser);

// Matches
router.get('/matches', c.listOpen);
router.get('/matches/mine', c.mine);
router.get('/matches/:id', c.getMatch);
router.post('/matches/:id/join', c.join);
router.post('/matches/:id/leave', c.leave);

// Groups
router.post('/groups', c.createGroup);
router.get('/groups', c.listGroups);
router.get('/groups/:id', c.getGroup);
router.post('/groups/:id/join', c.joinGroup);
router.post('/groups/:id/leave', c.leaveGroup);
router.delete('/groups/:id', c.deleteGroup);

module.exports = router;
