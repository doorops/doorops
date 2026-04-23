const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');

// ─── LIST inspections for company ────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, status } = req.query;
    let query = `
      SELECT i.*, u.name as inspector_name,
        COUNT(DISTINCT d.id) as door_count,
        COUNT(DISTINCT def.id) as deficiency_count
      FROM inspections i
      LEFT JOIN users u ON i.inspector_id = u.id
      LEFT JOIN inspection_doors d ON d.inspection_id = i.id
      LEFT JOIN inspection_deficiencies def ON def.inspection_id = i.id
      WHERE i.company_id = $1
    `;
    const params = [req.companyId];
    let idx = 2;

    if (status) { query += ` AND i.status = $${idx++}`; params.push(status); }
    if (q) { query += ` AND (i.property_name ILIKE $${idx} OR i.property_address ILIKE $${idx} OR i.contact_name ILIKE $${idx})`; params.push('%' + q + '%'); idx++; }

    query += ' GROUP BY i.id, u.name ORDER BY i.created_at DESC LIMIT 100';

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[inspections/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET single inspection ────────────────────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const insp = await db.query(
      'SELECT i.*, u.name as inspector_name FROM inspections i LEFT JOIN users u ON i.inspector_id = u.id WHERE i.id = $1 AND i.company_id = $2',
      [req.params.id, req.companyId]
    );
    if (!insp.rows.length) return res.status(404).json({ error: 'Not found' });

    const doors = await db.query(
      'SELECT * FROM inspection_doors WHERE inspection_id = $1 ORDER BY door_number',
      [req.params.id]
    );
    const deficiencies = await db.query(
      'SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 ORDER BY created_at',
      [req.params.id]
    );

    res.json({ ...insp.rows[0], doors: doors.rows, deficiencies: deficiencies.rows });
  } catch (err) {
    console.error('[inspections/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── CREATE inspection ────────────────────────────────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  try {
    const { property_name, property_address, contact_name, contact_email, inspection_date, notes } = req.body;
    if (!property_address) return res.status(400).json({ error: 'Property address required' });

    const result = await db.query(
      `INSERT INTO inspections (company_id, inspector_id, property_name, property_address, contact_name, contact_email, inspection_date, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') RETURNING *`,
      [req.companyId, req.user.id, property_name || null, property_address, contact_name || null, contact_email || null, inspection_date || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[inspections/create]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── UPDATE inspection ────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { property_name, property_address, contact_name, contact_email, inspection_date, notes, status } = req.body;
    await db.query(
      `UPDATE inspections SET
        property_name = COALESCE($1, property_name),
        property_address = COALESCE($2, property_address),
        contact_name = COALESCE($3, contact_name),
        contact_email = COALESCE($4, contact_email),
        inspection_date = COALESCE($5, inspection_date),
        notes = COALESCE($6, notes),
        status = COALESCE($7, status),
        updated_at = NOW()
       WHERE id = $8 AND company_id = $9`,
      [property_name, property_address, contact_name, contact_email, inspection_date, notes, status, req.params.id, req.companyId]
    );
    const updated = await db.query('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[inspections/update]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE inspection ────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM inspections WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DOORS ────────────────────────────────────────────────────────────────────

// Add door to inspection
router.post('/:id/doors', requireAuth, async (req, res) => {
  try {
    const { door_type, door_number, location, door_size, overall_condition, findings, notes,
            make, model, serial_number, install_year, opener_make, opener_model, opener_hp,
            door_width_ft, door_height_ft } = req.body;

    // Verify inspection belongs to company
    const insp = await db.query('SELECT id FROM inspections WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    if (!insp.rows.length) return res.status(404).json({ error: 'Inspection not found' });

    const result = await db.query(
      `INSERT INTO inspection_doors
        (inspection_id, door_type, door_number, location, door_size, overall_condition, findings, notes,
         make, model, serial_number, install_year, opener_make, opener_model, opener_hp,
         door_width_ft, door_height_ft)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [req.params.id, door_type || 'overhead', door_number || 1, location || null,
       door_size || null, overall_condition || null, JSON.stringify(findings || {}), notes || null,
       make || null, model || null, serial_number || null, install_year || null,
       opener_make || null, opener_model || null, opener_hp || null,
       door_width_ft || null, door_height_ft || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[inspections/doors/add]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update door
router.patch('/:id/doors/:doorId', requireAuth, async (req, res) => {
  try {
    const fields = ['door_type','door_number','location','door_size','overall_condition','notes',
                    'make','model','serial_number','install_year','opener_make','opener_model',
                    'opener_hp','door_width_ft','door_height_ft'];
    const sets = [];
    const vals = [];
    let idx = 1;

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        vals.push(req.body[f]);
      }
    });
    if (req.body.findings !== undefined) {
      sets.push(`findings = $${idx++}`);
      vals.push(JSON.stringify(req.body.findings));
    }

    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(req.params.doorId, req.params.id);
    await db.query(`UPDATE inspection_doors SET ${sets.join(', ')} WHERE id = $${idx++} AND inspection_id = $${idx}`, vals);

    const updated = await db.query('SELECT * FROM inspection_doors WHERE id = $1', [req.params.doorId]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[inspections/doors/update]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete door
router.delete('/:id/doors/:doorId', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM inspection_doors WHERE id = $1 AND inspection_id = $2', [req.params.doorId, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DEFICIENCIES ─────────────────────────────────────────────────────────────

// Add deficiency
router.post('/:id/deficiencies', requireAuth, async (req, res) => {
  try {
    const { door_id, severity, description, recommendation, include_in_quote, estimated_cost } = req.body;
    if (!description) return res.status(400).json({ error: 'Description required' });

    const result = await db.query(
      `INSERT INTO inspection_deficiencies
        (inspection_id, door_id, severity, description, recommendation, include_in_quote, estimated_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, door_id || null, severity || 'advisory', description,
       recommendation || null, include_in_quote || false, estimated_cost || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[inspections/deficiencies/add]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update deficiency
router.patch('/:id/deficiencies/:defId', requireAuth, async (req, res) => {
  try {
    const { severity, description, recommendation, include_in_quote, estimated_cost } = req.body;
    await db.query(
      `UPDATE inspection_deficiencies SET
        severity = COALESCE($1, severity),
        description = COALESCE($2, description),
        recommendation = COALESCE($3, recommendation),
        include_in_quote = COALESCE($4, include_in_quote),
        estimated_cost = COALESCE($5, estimated_cost)
       WHERE id = $6 AND inspection_id = $7`,
      [severity, description, recommendation, include_in_quote, estimated_cost, req.params.defId, req.params.id]
    );
    const updated = await db.query('SELECT * FROM inspection_deficiencies WHERE id = $1', [req.params.defId]);
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete deficiency
router.delete('/:id/deficiencies/:defId', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM inspection_deficiencies WHERE id = $1 AND inspection_id = $2', [req.params.defId, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
