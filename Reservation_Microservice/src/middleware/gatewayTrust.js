const crypto = require('crypto');

// Only the API Gateway (or a sibling service) knows INTERNAL_API_KEY.
exports.internalOnly = (req, res, next) => {
  const given = Buffer.from(String(req.headers['x-internal-key'] || ''));
  const expected = Buffer.from(String(process.env.INTERNAL_API_KEY || ''));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(403).json({ message: 'Direct access forbidden. Use the API Gateway.' });
  }
  next();
};

// The gateway has already verified the JWT and forwards identity in headers.
exports.attachUser = (req, res, next) => {
  req.user = {
    id: req.headers['x-user-id'],
    name: decodeURIComponent(req.headers['x-user-name'] || ''),
    role: req.headers['x-user-role'],
  };
  next();
};

// 'system' = another trusted microservice calling internally.
exports.requireRole = (...roles) => (req, res, next) => {
  const role = req.user && req.user.role;
  if (role === 'system' || roles.includes(role)) return next();
  res.status(403).json({ message: 'You do not have permission to do this' });
};

exports.requireUser = (req, res, next) => {
  if (!req.user || !req.user.id) return res.status(401).json({ message: 'Authentication required' });
  next();
};
