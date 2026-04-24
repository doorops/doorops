const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// POST /api/auth/signup — create company + owner account
router.post('/signup', async (req, res) => {
  const { company_name, name, email, password } = req.body;
  if (!company_name || !name || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    // Generate unique slug
    const slug = company_name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 40)
      + '-' + Math.random().toString(36).slice(2, 6);

    // Create company
    const companyResult = await db.query(
      'INSERT INTO companies (name, slug, email) VALUES ($1, $2, $3) RETURNING *',
      [company_name, slug, email]
    );
    const company = companyResult.rows[0];

    // Create owner user
    const hash = await bcrypt.hash(password, 12);
    const userResult = await db.query(
      'INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [company.id, name, email, hash, 'owner']
    );
    const user = userResult.rows[0];

    const token = jwt.sign({ userId: user.id, companyId: company.id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role }, company: { id: company.id, name: company.name, slug: company.slug, plan: company.plan } });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already registered' });
    console.error('[auth/signup]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const result = await db.query(
      'SELECT u.*, c.name as company_name, c.slug as company_slug, c.plan, c.active as company_active FROM users u JOIN companies c ON u.company_id = c.id WHERE u.email = $1 AND u.active = true',
      [email.toLowerCase().trim()]
    );

    if (!result.rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    
    const user = result.rows[0];
    if (!user.company_active) return res.status(403).json({ error: 'Account suspended — contact support' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const token = jwt.sign({ userId: user.id, companyId: user.company_id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role }, company: { id: user.company_id, name: user.company_name, slug: user.company_slug, plan: user.plan } });
  } catch (err) {
    console.error('[auth/login]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await db.query(
      'SELECT u.id, u.name, u.email, u.role, c.id as company_id, c.name as company_name, c.slug, c.plan, c.trial_ends_at FROM users u JOIN companies c ON u.company_id = c.id WHERE u.id = $1',
      [decoded.userId]
    );
    if (!result.rows.length) return res.status(401).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Change password
router.post('/change-password', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const { current_password, new_password } = req.body;
    if (!current_password || !new_password || new_password.length < 8)
      return res.status(400).json({ error: 'New password must be 8+ characters' });

    const user = await db.query('SELECT password_hash FROM users WHERE id = $1', [decoded.userId]);
    if (!user.rows.length) return res.status(404).json({ error: 'User not found' });

    const match = await bcrypt.compare(current_password, user.rows[0].password_hash);
    if (!match) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, decoded.userId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[change-password]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
