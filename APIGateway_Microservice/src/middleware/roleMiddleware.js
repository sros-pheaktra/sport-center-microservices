// Usage: authorize('admin', 'manager')
module.exports = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have permission to access this resource' });
  }
  next();
};
