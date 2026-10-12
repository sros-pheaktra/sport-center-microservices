const router = require('express').Router();
const c = require('../controllers/registrationController');

router.post('/register', c.register);
router.post('/internal/verify', c.verifyCredentials);
router.get('/internal/users/:id', c.getUser);

module.exports = router;
