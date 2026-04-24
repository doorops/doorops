const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/tenant');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { getTemplate } = require('../lib/templates');

// ─── LIST ─────────────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { q, status, limit = 100, offset = 0 } = req.query;

    let query = `
      SELECT i.*, u.name as inspector_name,
        COUNT(DISTINCT d.id) as door_count,
        COUNT(DISTINCT def.id) as deficiency_count,
        (SELECT COUNT(*) FROM door_checklist_items dci
           JOIN inspection_doors id2 ON id2.id = dci.door_id
           WHERE id2.inspection_id = i.id AND dci.rating IS NOT NULL AND dci.rating != 'na') as finding_done,
        (SELECT COUNT(*) FROM door_checklist_items dci
           JOIN inspection_doors id2 ON id2.id = dci.door_id
           WHERE id2.inspection_id = i.id AND dci.rating != 'na') as finding_total
      FROM inspections i
      LEFT JOIN users u ON i.inspector_id = u.id
      LEFT JOIN inspection_doors d ON d.inspection_id = i.id
      LEFT JOIN inspection_deficiencies def ON def.inspection_id = i.id
      WHERE i.company_id = $1
    `;
    const params = [req.companyId];
    let idx = 2;

    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      query += ` AND i.status = ANY($${idx++})`;
      params.push(statuses);
    }
    if (q) {
      query += ` AND to_tsvector('english', coalesce(i.property_address,'') || ' ' || coalesce(i.contact_name,'') || ' ' || coalesce(i.property_name,'')) @@ plainto_tsquery('english', $${idx++})`;
      params.push(q);
    }

    query += ` GROUP BY i.id, u.name ORDER BY i.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('[inspections/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SEARCH (full text, paginated) ───────────────────────────────────────────
router.get('/search', requireAuth, async (req, res) => {
  try {
    const { q = '', status, limit = 20, offset = 0 } = req.query;
    const params = [req.companyId];
    let idx = 2;
    let where = 'WHERE i.company_id = $1';

    if (q.trim()) {
      where += ` AND (i.property_address ILIKE $${idx} OR i.property_name ILIKE $${idx} OR i.contact_name ILIKE $${idx})`;
      params.push('%' + q.trim() + '%');
      idx++;
    }
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      where += ` AND i.status = ANY($${idx++})`;
      params.push(statuses);
    }

    const query = `
      SELECT i.id, i.property_name, i.property_address, i.contact_name, i.status,
             i.inspection_date, i.next_inspection_date, i.inspection_frequency,
             i.portal_token, i.published_at, i.created_at, i.updated_at,
             u.name as inspector_name,
             COUNT(DISTINCT d.id) as door_count,
             COUNT(DISTINCT def.id) as deficiency_count
      FROM inspections i
      LEFT JOIN users u ON i.inspector_id = u.id
      LEFT JOIN inspection_doors d ON d.inspection_id = i.id
      LEFT JOIN inspection_deficiencies def ON def.inspection_id = i.id
      ${where}
      GROUP BY i.id, u.name
      ORDER BY i.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);
    const countRes = await db.query(
      `SELECT COUNT(DISTINCT i.id) FROM inspections i ${where}`,
      params.slice(0, idx - 2)
    );
    res.json({ results: result.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err) {
    console.error('[inspections/search]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── UPCOMING (for dashboard) ─────────────────────────────────────────────────
router.get('/upcoming', requireAuth, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, property_name, property_address, contact_name, status,
             next_inspection_date, inspection_frequency, portal_token
      FROM inspections
      WHERE company_id = $1
        AND next_inspection_date IS NOT NULL
        AND next_inspection_date <= NOW() + INTERVAL '90 days'
        AND status NOT IN ('sent')
      ORDER BY next_inspection_date ASC
      LIMIT 20
    `, [req.companyId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET single (with embedded findings per door) ────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const insp = await db.query(
      `SELECT i.*, u.name as inspector_name,
              c.name as company_name, c.phone as company_phone, c.email as company_email
       FROM inspections i
       LEFT JOIN users u ON i.inspector_id = u.id
       LEFT JOIN companies c ON i.company_id = c.id
       WHERE i.id = $1 AND i.company_id = $2`,
      [req.params.id, req.companyId]
    );
    if (!insp.rows.length) return res.status(404).json({ error: 'Not found' });

    const doors = await db.query(
      'SELECT * FROM inspection_doors WHERE inspection_id = $1 ORDER BY door_number',
      [req.params.id]
    );

    const doorIds = doors.rows.map(d => d.id);

    let findings = [];
    let deficiencies = [];
    let photos = [];

    if (doorIds.length > 0) {
      const [fRes, dRes, pRes] = await Promise.all([
        db.query('SELECT * FROM door_checklist_items WHERE door_id = ANY($1) ORDER BY door_id, sort_order', [doorIds]),
        db.query('SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 ORDER BY created_at', [req.params.id]),
        db.query('SELECT * FROM inspection_photos WHERE door_id = ANY($1) AND company_id = $2 ORDER BY created_at', [doorIds, req.companyId]),
      ]);
      findings = fRes.rows;
      deficiencies = dRes.rows;
      photos = pRes.rows;
    } else {
      const dRes = await db.query('SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 ORDER BY created_at', [req.params.id]);
      deficiencies = dRes.rows;
    }

    // Index deficiencies by checklist_item_id for O(1) lookup
    const defByItem = {};
    for (const d of deficiencies) {
      if (d.checklist_item_id) defByItem[d.checklist_item_id] = d;
    }
    // Index photos by checklist_item_id
    const photosByItem = {};
    for (const p of photos) {
      const key = p.checklist_item_id;
      if (key) {
        if (!photosByItem[key]) photosByItem[key] = [];
        photosByItem[key].push(p);
      }
    }

    // Group findings by door
    const findingsByDoor = {};
    for (const f of findings) {
      if (!findingsByDoor[f.door_id]) findingsByDoor[f.door_id] = [];
      const def = defByItem[f.id] || null;
      findingsByDoor[f.door_id].push({
        ...f,
        template_category: f.category,
        template_label: f.item,
        label: f.item,
        notes: f.note || '',
        deficiency: def ? {
          id: def.id,
          title: def.title || def.description || '',
          description: def.description || '',
          severity: def.severity || 'advisory',
          include_in_quote: def.include_in_quote
        } : null,
        photos: photosByItem[f.id] || []
      });
    }

    const doorsWithFindings = doors.rows.map(d => ({
      ...d,
      location_label: d.location_label || d.location || ('Door ' + d.door_number),
      findings: findingsByDoor[d.id] || []
    }));

    res.json({
      ...insp.rows[0],
      doors: doorsWithFindings,
      deficiencies
    });
  } catch (err) {
    console.error('[inspections/get]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── CREATE ───────────────────────────────────────────────────────────────────
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

// ─── UPDATE ───────────────────────────────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { property_name, property_address, contact_name, contact_email, inspection_date, notes, status } = req.body;
    await db.query(
      `UPDATE inspections SET
        property_name    = COALESCE($1, property_name),
        property_address = COALESCE($2, property_address),
        contact_name     = COALESCE($3, contact_name),
        contact_email    = COALESCE($4, contact_email),
        inspection_date  = COALESCE($5, inspection_date),
        notes            = COALESCE($6, notes),
        status           = COALESCE($7, status),
        updated_at       = NOW()
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

// ─── STATUS update ────────────────────────────────────────────────────────────
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { status, signature_data } = req.body;
    const allowed = ['draft', 'in_progress', 'complete', 'published', 'sent'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const fields = ['status = $1'];
    const vals = [status];
    let idx = 2;

    if (signature_data !== undefined) { fields.push(`signature_data = $${idx++}`); vals.push(signature_data); }
    if (status === 'complete') { fields.push(`completed_at = NOW()`); }

    fields.push('updated_at = NOW()');
    vals.push(req.params.id, req.companyId);

    await db.query(
      `UPDATE inspections SET ${fields.join(', ')} WHERE id = $${idx++} AND company_id = $${idx}`,
      vals
    );
    const updated = await db.query('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[inspections/status]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SCHEDULE ─────────────────────────────────────────────────────────────────
router.patch('/:id/schedule', requireAuth, async (req, res) => {
  try {
    const { next_inspection_date, inspection_frequency } = req.body;
    await db.query(
      `UPDATE inspections SET
        next_inspection_date = $1,
        inspection_frequency = $2,
        updated_at = NOW()
       WHERE id = $3 AND company_id = $4`,
      [next_inspection_date || null, inspection_frequency || null, req.params.id, req.companyId]
    );
    const updated = await db.query('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('[inspections/schedule]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUBLISH ──────────────────────────────────────────────────────────────────
router.post('/:id/publish', requireAuth, async (req, res) => {
  try {
    const insp = await db.query('SELECT * FROM inspections WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    if (!insp.rows.length) return res.status(404).json({ error: 'Not found' });

    let token = crypto.randomBytes(32).toString('hex');
    // Ensure uniqueness
    let attempts = 0;
    while (attempts < 5) {
      const conflict = await db.query('SELECT id FROM inspections WHERE portal_token = $1', [token]);
      if (!conflict.rows.length) break;
      token = crypto.randomBytes(32).toString('hex');
      attempts++;
    }

    await db.query(
      `UPDATE inspections SET
        status = 'published',
        published_at = NOW(),
        portal_token = $1,
        updated_at = NOW()
       WHERE id = $2 AND company_id = $3`,
      [token, req.params.id, req.companyId]
    );
    const updated = await db.query('SELECT * FROM inspections WHERE id = $1', [req.params.id]);
    res.json({ ...updated.rows[0], portal_url: `${process.env.APP_URL || ''}/portal/${token}` });
  } catch (err) {
    console.error('[inspections/publish]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── DELETE ───────────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await db.query('DELETE FROM inspections WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── SEND REPORT ──────────────────────────────────────────────────────────────
router.post('/:id/send-report', requireAuth, async (req, res) => {
  try {
    const insp = await db.query(
      'SELECT i.*, u.name as inspector_name, c.name as company_name FROM inspections i LEFT JOIN users u ON i.inspector_id = u.id LEFT JOIN companies c ON i.company_id = c.id WHERE i.id = $1 AND i.company_id = $2',
      [req.params.id, req.companyId]
    );
    if (!insp.rows.length) return res.status(404).json({ error: 'Not found' });
    const i = insp.rows[0];

    const toEmail = req.body.email || i.contact_email;
    if (!toEmail) return res.status(400).json({ error: 'No recipient email' });

    const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    if (!smtpConfigured) {
      return res.json({ ok: true, simulated: true, message: 'Email simulated (SMTP not configured)', to: toEmail });
    }

    const doors = await db.query('SELECT * FROM inspection_doors WHERE inspection_id = $1 ORDER BY door_number', [req.params.id]);
    const defs = await db.query('SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 ORDER BY severity DESC, created_at', [req.params.id]);
    const pdfBuffer = await generatePdfBuffer(i, doors.rows, defs.rows);

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    const dateStr = i.inspection_date ? new Date(i.inspection_date).toLocaleDateString('en-CA') : new Date().toLocaleDateString('en-CA');
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: toEmail,
      subject: `Inspection Report - ${i.property_address} - ${dateStr}`,
      text: `Please find attached the inspection report for ${i.property_address}.\n\nInspected by: ${i.inspector_name || 'DoorOps'}\nDate: ${dateStr}\n\n${i.company_name || 'DoorOps'}`,
      attachments: [{ filename: `DoorOps-Report-${req.params.id}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }]
    });

    await db.query("UPDATE inspections SET status = 'sent', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ ok: true, to: toEmail });
  } catch (err) {
    console.error('[inspections/send-report]', err);
    res.status(500).json({ error: 'Failed to send report' });
  }
});

// ─── DOORS ────────────────────────────────────────────────────────────────────

// Add door + auto-seed checklist items from template
router.post('/:id/doors', requireAuth, async (req, res) => {
  try {
    const {
      door_type, door_number, location, location_label,
      door_size, overall_condition, notes, make, model, serial_number,
      install_year, opener_make, opener_model, opener_hp,
      door_width_ft, door_height_ft
    } = req.body;

    // Verify inspection belongs to company
    const insp = await db.query('SELECT id FROM inspections WHERE id = $1 AND company_id = $2', [req.params.id, req.companyId]);
    if (!insp.rows.length) return res.status(404).json({ error: 'Inspection not found' });

    // Auto-assign door number if not provided
    let doorNum = door_number;
    if (!doorNum) {
      const countRes = await db.query('SELECT COUNT(*) FROM inspection_doors WHERE inspection_id = $1', [req.params.id]);
      doorNum = parseInt(countRes.rows[0].count) + 1;
    }

    const loc = location_label || location || null;
    const result = await db.query(
      `INSERT INTO inspection_doors
         (inspection_id, door_number, door_type, door_size, location, location_label,
          overall_condition, notes, make, model, serial_number, install_year,
          opener_make, opener_model, opener_hp, door_width_ft, door_height_ft)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [req.params.id, doorNum, door_type || 'sectional', door_size || null, loc, loc,
       overall_condition || null, notes || null, make || null, model || null,
       serial_number || null, install_year || null, opener_make || null,
       opener_model || null, opener_hp || null, door_width_ft || null, door_height_ft || null]
    );
    const door = result.rows[0];

    // Auto-seed checklist items from template
    const template = getTemplate(door.door_type);
    for (let i = 0; i < template.length; i++) {
      const t = template[i];
      await db.query(
        `INSERT INTO door_checklist_items (door_id, category, item, critical, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [door.id, t.category, t.item, t.critical || false, i]
      );
    }

    res.status(201).json({ ...door, location_label: loc || ('Door ' + doorNum), findings: [] });
  } catch (err) {
    console.error('[inspections/doors/add]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update door
router.patch('/:id/doors/:doorId', requireAuth, async (req, res) => {
  try {
    const fields = ['door_type','door_number','location','location_label','door_size','overall_condition','notes',
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
    // Keep location and location_label in sync
    if (req.body.location && !req.body.location_label) {
      sets.push(`location_label = $${idx++}`);
      vals.push(req.body.location);
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

router.post('/:id/deficiencies', requireAuth, async (req, res) => {
  try {
    const { door_id, checklist_item_id, title, severity, description, recommendation, include_in_quote, estimated_cost } = req.body;
    const desc = description || title || '';
    if (!desc) return res.status(400).json({ error: 'Title or description required' });

    const result = await db.query(
      `INSERT INTO inspection_deficiencies
        (inspection_id, door_id, checklist_item_id, title, severity, description, recommendation, include_in_quote, estimated_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, door_id || null, checklist_item_id || null,
       title || desc, severity || 'advisory', desc,
       recommendation || null, include_in_quote !== false, estimated_cost || null]
    );
    const def = result.rows[0];

    // Link back to the checklist item
    if (checklist_item_id) {
      await db.query('UPDATE door_checklist_items SET deficiency_id = $1 WHERE id = $2', [def.id, checklist_item_id]);
    }

    res.status(201).json(def);
  } catch (err) {
    console.error('[inspections/deficiencies/add]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/deficiencies/:defId', requireAuth, async (req, res) => {
  try {
    const { title, severity, description, recommendation, include_in_quote, estimated_cost } = req.body;
    await db.query(
      `UPDATE inspection_deficiencies SET
        title            = COALESCE($1, title),
        description      = COALESCE($2, description),
        severity         = COALESCE($3, severity),
        recommendation   = COALESCE($4, recommendation),
        include_in_quote = COALESCE($5, include_in_quote),
        estimated_cost   = COALESCE($6, estimated_cost)
       WHERE id = $7 AND inspection_id = $8`,
      [title, description || title, severity, recommendation, include_in_quote, estimated_cost, req.params.defId, req.params.id]
    );
    const updated = await db.query('SELECT * FROM inspection_deficiencies WHERE id = $1', [req.params.defId]);
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id/deficiencies/:defId', requireAuth, async (req, res) => {
  try {
    // Unlink from checklist item first
    await db.query('UPDATE door_checklist_items SET deficiency_id = NULL WHERE deficiency_id = $1', [req.params.defId]);
    await db.query('DELETE FROM inspection_deficiencies WHERE id = $1 AND inspection_id = $2', [req.params.defId, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PDF GENERATION ───────────────────────────────────────────────────────────
async function generatePdfBuffer(i, doors, defs) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const GREEN = '#3d7a3a';
    const DARK = '#1e2832';
    const MUTED = '#6B7280';
    const DANGER = '#d63c3c';
    const WARN = '#d4a017';
    const pageW = doc.page.width - 100;

    doc.rect(0, 0, doc.page.width, 80).fill(DARK);
    doc.fill(GREEN).fontSize(22).font('Helvetica-Bold').text('DoorOps', 50, 22);
    doc.fill('#FFFFFF').fontSize(10).font('Helvetica').text('Inspection Report', 50, 48);
    const now = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.fill('#9CA3AF').fontSize(9).text(`Generated: ${now}`, 0, 56, { align: 'right', width: doc.page.width - 50 });
    doc.moveDown(3);

    doc.fill(GREEN).fontSize(11).font('Helvetica-Bold').text('PROPERTY', 50, 100);
    doc.moveTo(50, 115).lineTo(doc.page.width - 50, 115).strokeColor(GREEN).lineWidth(1).stroke();
    doc.fill(DARK).fontSize(18).font('Helvetica-Bold').text(i.property_name || i.property_address, 50, 122);
    if (i.property_name) doc.fill(MUTED).fontSize(11).font('Helvetica').text(i.property_address, 50, doc.y + 2);

    const infoY = doc.y + 10;
    const cols = [
      ['Date', i.inspection_date ? new Date(i.inspection_date).toLocaleDateString('en-CA') : 'N/A'],
      ['Inspector', i.inspector_name || 'N/A'],
      ['Contact', i.contact_name || 'N/A'],
      ['Status', (i.status || 'draft').toUpperCase()],
    ];
    cols.forEach((col, idx) => {
      const x = 50 + (idx * (pageW / 4));
      doc.fill(MUTED).fontSize(8).font('Helvetica').text(col[0].toUpperCase(), x, infoY);
      doc.fill(DARK).fontSize(10).font('Helvetica-Bold').text(col[1], x, infoY + 12, { width: pageW / 4 - 10 });
    });
    doc.moveDown(4);

    const safetyCritical = defs.filter(d => d.severity === 'safety_critical').length;
    const moderate = defs.filter(d => d.severity === 'moderate').length;
    const advisory = defs.filter(d => d.severity === 'advisory').length;

    doc.fill(MUTED).fontSize(9).font('Helvetica').text(
      `Doors: ${doors.length} | Safety Critical: ${safetyCritical} | Moderate: ${moderate} | Advisory: ${advisory}`,
      50, doc.y + 8
    );

    if (defs.length > 0) {
      doc.addPage();
      doc.fill(GREEN).fontSize(11).font('Helvetica-Bold').text('DEFICIENCIES', 50, 50);
      doc.moveTo(50, 65).lineTo(doc.page.width - 50, 65).strokeColor(GREEN).lineWidth(1).stroke();
      let y = 75;
      defs.forEach(def => {
        if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
        const sevColor = { advisory: GREEN, moderate: WARN, safety_critical: DANGER }[def.severity] || MUTED;
        const sevLabel = { advisory: 'ADVISORY', moderate: 'MODERATE', safety_critical: 'SAFETY CRITICAL' }[def.severity] || (def.severity || '').toUpperCase();
        const door = doors.find(d => d.id === def.door_id);
        doc.rect(50, y, 3, 36).fill(sevColor);
        doc.fill(sevColor).fontSize(7).font('Helvetica-Bold').text(sevLabel + (door ? ` · ${door.location || ('Door ' + door.door_number)}` : ''), 58, y + 2);
        const displayText = def.title || def.description || '';
        doc.fill(DARK).fontSize(9).font('Helvetica').text(displayText, 58, y + 12, { width: pageW - 12 });
        if (def.description && def.title && def.description !== def.title) {
          doc.fill(MUTED).fontSize(8).text(def.description, 58, doc.y + 2, { width: pageW - 12 });
        }
        y = doc.y + 8;
      });
    }

    doc.fill(MUTED).fontSize(8).font('Helvetica').text(
      `DoorOps · app.doorops.app · ${i.company_name || 'DoorOps Report'}`,
      50, doc.page.height - 40, { align: 'center', width: pageW }
    );

    doc.end();
  });
}

module.exports = router;
