const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');
const bcrypt = require('bcryptjs');

// ─── List team members ────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, email, role, created_at,
        (SELECT COUNT(*) FROM inspections WHERE inspector_id = users.id) as inspection_count
       FROM users WHERE company_id = $1 ORDER BY role, name`,
      [req.companyId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Invite / create team member ─────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { name, email, role, password } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

    // Check if email exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(400).json({ error: 'Email already in use' });

    const tempPassword = password || Math.random().toString(36).slice(-10) + 'A1!';
    const hash = await bcrypt.hash(tempPassword, 10);

    const result = await db.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, created_at`,
      [req.companyId, name, email, hash, role || 'tech']
    );

    res.status(201).json({ ...result.rows[0], temp_password: password ? undefined : tempPassword });
  } catch (err) {
    console.error('[team/invite]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Update member role ───────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { role } = req.body;
    await db.query(
      'UPDATE users SET role = $1 WHERE id = $2 AND company_id = $3',
      [role, req.params.id, req.companyId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Remove member ────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    if (req.params.id == req.user.id) return res.status(400).json({ error: "Can't remove yourself" });
    await db.query('DELETE FROM users WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Dashboard stats ──────────────────────────────────────────────────────────
router.get('/stats/dashboard', requireAuth, async (req, res) => {
  try {
    const [inspTotal, inspDraft, inspComplete, inspThisMonth, defTotal, defCritical, teamCount] = await Promise.all([
      db.query('SELECT COUNT(*) FROM inspections WHERE company_id = $1', [req.companyId]),
      db.query("SELECT COUNT(*) FROM inspections WHERE company_id = $1 AND status = 'draft'", [req.companyId]),
      db.query("SELECT COUNT(*) FROM inspections WHERE company_id = $1 AND status = 'complete'", [req.companyId]),
      db.query("SELECT COUNT(*) FROM inspections WHERE company_id = $1 AND created_at >= date_trunc('month', NOW())", [req.companyId]),
      db.query('SELECT COUNT(*) FROM inspection_deficiencies def JOIN inspections i ON def.inspection_id = i.id WHERE i.company_id = $1', [req.companyId]),
      db.query("SELECT COUNT(*) FROM inspection_deficiencies def JOIN inspections i ON def.inspection_id = i.id WHERE i.company_id = $1 AND def.severity = 'safety_critical'", [req.companyId]),
      db.query('SELECT COUNT(*) FROM users WHERE company_id = $1', [req.companyId]),
    ]);

    const recent = await db.query(
      `SELECT i.id, i.property_name, i.property_address, i.status, i.inspection_date, u.name as inspector_name,
        COUNT(def.id) as deficiency_count
       FROM inspections i
       LEFT JOIN users u ON i.inspector_id = u.id
       LEFT JOIN inspection_deficiencies def ON def.inspection_id = i.id
       WHERE i.company_id = $1
       GROUP BY i.id, u.name
       ORDER BY i.created_at DESC LIMIT 5`,
      [req.companyId]
    );

    res.json({
      total_inspections: parseInt(inspTotal.rows[0].count),
      draft_inspections: parseInt(inspDraft.rows[0].count),
      complete_inspections: parseInt(inspComplete.rows[0].count),
      inspections_this_month: parseInt(inspThisMonth.rows[0].count),
      total_deficiencies: parseInt(defTotal.rows[0].count),
      critical_deficiencies: parseInt(defCritical.rows[0].count),
      team_count: parseInt(teamCount.rows[0].count),
      recent_inspections: recent.rows
    });
  } catch (err) {
    console.error('[stats]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
