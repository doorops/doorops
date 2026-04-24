const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');

// ─── GET company settings ─────────────────────────────────────────────────────
router.get('/company', requireAuth, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, plan FROM companies WHERE id = $1', [req.companyId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Company not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── UPDATE company name ──────────────────────────────────────────────────────
router.put('/company', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });

    await db.query('UPDATE companies SET name = $1 WHERE id = $2', [name.trim(), req.companyId]);
    const updated = await db.query('SELECT id, name, plan FROM companies WHERE id = $1', [req.companyId]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[settings/company]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
