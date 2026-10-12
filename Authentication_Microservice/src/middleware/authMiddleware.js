const jwt = require('jsonwebtoken');

// Verifies the Bearer token (forwarded by the gateway) and sets req.auth.
module.exports = (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ message: 'Missing bearer token' });
  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
