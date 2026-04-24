const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');
const { getTemplate } = require('../lib/templates');

// ─── GET template for a door type ─────────────────────────────────────────────
router.get('/template/:door_type', requireAuth, (req, res) => {
  res.json(getTemplate(req.params.door_type));
});

// ─── GET checklist items for a door (with deficiency + photos) ────────────────
router.get('/door/:door_id', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM door_checklist_items WHERE door_id = $1 ORDER BY sort_order',
      [req.params.door_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SAVE/REPLACE all checklist items for a door ──────────────────────────────
router.post('/door/:door_id', requireAuth, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

    await db.query('DELETE FROM door_checklist_items WHERE door_id = $1', [req.params.door_id]);

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      await db.query(
        `INSERT INTO door_checklist_items (door_id, category, item, critical, result, rating, note, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [req.params.door_id, item.category, item.item || item.template_label || item.label,
         item.critical || false,
         item.result || null,
         item.rating || null,
         item.note || item.notes || null, idx]
      );
    }

    const saved = await db.query('SELECT * FROM door_checklist_items WHERE door_id = $1 ORDER BY sort_order', [req.params.door_id]);
    res.json(saved.rows);
  } catch (err) {
    console.error('[checklist/save]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── UPDATE single item (optimistic rating sync) ──────────────────────────────
router.patch('/item/:item_id', requireAuth, async (req, res) => {
  try {
    const { result, note, rating } = req.body;
    const sets = [];
    const vals = [];
    let idx = 1;

    if (rating !== undefined) { sets.push(`rating = $${idx++}`); vals.push(rating); }
    if (result !== undefined) { sets.push(`result = $${idx++}`); vals.push(result); }
    if (note !== undefined)   { sets.push(`note = $${idx++}`);   vals.push(note); }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(req.params.item_id);
    await db.query(`UPDATE door_checklist_items SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

    const updated = await db.query('SELECT * FROM door_checklist_items WHERE id = $1', [req.params.item_id]);
    res.json(updated.rows[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SEED checklist items for a door from template ────────────────────────────
// Called automatically when a door is added; can also be called manually to reset
router.post('/door/:door_id/seed', requireAuth, async (req, res) => {
  try {
    const { door_type } = req.body;
    if (!door_type) return res.status(400).json({ error: 'door_type required' });

    const existing = await db.query('SELECT COUNT(*) FROM door_checklist_items WHERE door_id = $1', [req.params.door_id]);
    if (parseInt(existing.rows[0].count) > 0 && !req.body.force) {
      return res.status(409).json({ error: 'Items already exist. Pass force:true to reset.' });
    }

    await db.query('DELETE FROM door_checklist_items WHERE door_id = $1', [req.params.door_id]);
    const template = getTemplate(door_type);
    for (let i = 0; i < template.length; i++) {
      const t = template[i];
      await db.query(
        'INSERT INTO door_checklist_items (door_id, category, item, critical, sort_order) VALUES ($1,$2,$3,$4,$5)',
        [req.params.door_id, t.category, t.item, t.critical || false, i]
      );
    }

    const items = await db.query('SELECT * FROM door_checklist_items WHERE door_id = $1 ORDER BY sort_order', [req.params.door_id]);
    res.json(items.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
