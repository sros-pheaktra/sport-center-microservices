const axios = require('axios');
const jwt = require('jsonwebtoken');
const LoginAttempt = require('../models/LoginAttempt');

const MAX_FAILED = Number(process.env.MAX_FAILED_LOGINS || 5);
const WINDOW_MS = 15 * 60 * 1000;

// POST /login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'email and password are required' });
  const normalized = String(email).toLowerCase().trim();

  const failures = await LoginAttempt.countDocuments({
    email: normalized, success: false, createdAt: { $gte: new Date(Date.now() - WINDOW_MS) },
  });
  if (failures >= MAX_FAILED) {
    return res.status(429).json({ message: 'Too many failed attempts. Try again in 15 minutes.' });
  }

  let upstream;
  try {
    upstream = await axios.post(
      `${process.env.REGISTRATION_URL}/internal/verify`,
      { email: normalized, password },
      { headers: { 'x-internal-key': process.env.INTERNAL_API_KEY }, timeout: 5000, validateStatus: () => true }
    );
  } catch (err) {
    return res.status(503).json({ message: 'Registration service unavailable' });
  }

  if (upstream.status === 401) {
    await LoginAttempt.create({ email: normalized, success: false, ip: req.ip });
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (upstream.status !== 200) return res.status(502).json({ message: 'Could not verify credentials' });

  const { user } = upstream.data;
  await LoginAttempt.deleteMany({ email: normalized, success: false });
  await LoginAttempt.create({ email: normalized, success: true, ip: req.ip });

  const expiresIn = process.env.JWT_EXPIRES_IN || '1h';
  const token = jwt.sign({ sub: String(user.id), name: user.name, role: user.role }, process.env.JWT_SECRET, {
    algorithm: 'HS256', expiresIn,
  });
  res.json({ token, tokenType: 'Bearer', expiresIn, user });
};

// GET /me
exports.me = (req, res) => {
  const { sub, name, role, exp } = req.auth;
  res.json({ user: { id: sub, name, role }, expiresAt: new Date(exp * 1000) });
};

// POST /verify  -> lets other services validate a token if they ever need to
exports.verify = (req, res) => res.json({ valid: true, claims: req.auth });
