const router = require('express').Router();
const c = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/login', c.login);
router.get('/me', authMiddleware, c.me);
router.post('/verify', authMiddleware, c.verify);

module.exports = router;
