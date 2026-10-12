const router = require('express').Router();
const proxy = require('../utils/proxy');
const authenticate = require('../middleware/authMiddleware');

// Public
router.post('/register', proxy('REGISTRATION_URL', { rewrite: () => '/register' }));
router.post('/login', proxy('AUTH_URL', { rewrite: () => '/login' }));
// Protected
router.get('/me', authenticate, proxy('AUTH_URL', { rewrite: () => '/me' }));

module.exports = router;
