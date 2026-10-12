const bcrypt = require('bcryptjs');
const User = require('../models/User');

// POST /register
exports.register = async (req, res) => {
  const { name, email, password, phone, role, staffCode } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'name, email and password are required' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  // Everyone is a customer unless they present the staff signup code.
  let finalRole = 'customer';
  if (role && role !== 'customer') {
    if (role !== 'admin') return res.status(400).json({ message: 'Invalid role' });
    if (!process.env.STAFF_SIGNUP_CODE || staffCode !== process.env.STAFF_SIGNUP_CODE) {
      return res.status(403).json({ message: 'Invalid staff signup code' });
    }
    finalRole = role;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name, email, phone, passwordHash, role: finalRole });
  res.status(201).json({ message: 'Registration successful', user: user.toSafe() });
};

// POST /internal/verify  (called by the Authentication service only)
exports.verifyCredentials = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'email and password are required' });
  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  const ok = user && (await bcrypt.compare(String(password), user.passwordHash));
  if (!ok || !user.isActive) return res.status(401).json({ message: 'Invalid credentials' });
  res.json({ user: user.toSafe() });
};

// GET /internal/users/:id
exports.getUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({ user: user.toSafe() });
};
