const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

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

// ─── STATUS update ───────────────────────────────────────────────────────────
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { status, signature_data } = req.body;
    const allowed = ['draft', 'in_progress', 'complete', 'sent'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const fields = ['status = $1'];
    const vals = [status];
    let idx = 2;

    if (signature_data !== undefined) {
      fields.push(`signature_data = $${idx++}`);
      vals.push(signature_data);
    }

    fields.push(`updated_at = NOW()`);
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

// ─── SEND REPORT via email ────────────────────────────────────────────────────
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

    // Check SMTP config
    const smtpConfigured = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    if (!smtpConfigured) {
      return res.json({ ok: true, simulated: true, message: 'Email simulated (SMTP not configured)', to: toEmail });
    }

    // Generate PDF buffer
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
      attachments: [{
        filename: `DoorOps-Report-${req.params.id}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });

    // Mark as sent
    await db.query("UPDATE inspections SET status = 'sent', updated_at = NOW() WHERE id = $1", [req.params.id]);

    res.json({ ok: true, to: toEmail });
  } catch (err) {
    console.error('[inspections/send-report]', err);
    res.status(500).json({ error: 'Failed to send report' });
  }
});

async function generatePdfBuffer(i, doors, defs) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ORANGE = '#6a8f50';
    const DARK = '#1e2832';
    const MUTED = '#6B7280';
    const DANGER = '#d63c3c';
    const WARN = '#d4a017';
    const pageW = doc.page.width - 100;

    doc.rect(0, 0, doc.page.width, 80).fill(DARK);
    doc.fill(ORANGE).fontSize(22).font('Helvetica-Bold').text('DoorOps', 50, 22);
    doc.fill('#FFFFFF').fontSize(10).font('Helvetica').text('Inspection Report', 50, 48);
    const now = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.fill('#9CA3AF').fontSize(9).text(`Generated: ${now}`, 0, 56, { align: 'right', width: doc.page.width - 50 });
    doc.moveDown(3);

    doc.fill(ORANGE).fontSize(11).font('Helvetica-Bold').text('PROPERTY', 50, 100);
    doc.moveTo(50, 115).lineTo(doc.page.width - 50, 115).strokeColor(ORANGE).lineWidth(1).stroke();
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
    const quotedCost = defs.filter(d => d.include_in_quote).reduce((s, d) => s + (parseFloat(d.estimated_cost) || 0), 0);

    doc.fill(MUTED).fontSize(9).font('Helvetica').text(
      `Doors: ${doors.length} | Safety Critical: ${safetyCritical} | Moderate: ${moderate} | Advisory: ${advisory}${quotedCost > 0 ? ` | Est. Repairs: $${quotedCost.toFixed(2)}` : ''}`,
      50, doc.y + 8
    );

    if (defs.length > 0) {
      doc.addPage();
      doc.fill(ORANGE).fontSize(11).font('Helvetica-Bold').text('DEFICIENCIES', 50, 50);
      doc.moveTo(50, 65).lineTo(doc.page.width - 50, 65).strokeColor(ORANGE).lineWidth(1).stroke();
      let y = 75;
      defs.forEach(def => {
        if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
        const sevColor = { advisory: ORANGE, moderate: WARN, safety_critical: DANGER }[def.severity] || MUTED;
        const sevLabel = { advisory: 'ADVISORY', moderate: 'MODERATE', safety_critical: 'SAFETY CRITICAL' }[def.severity] || def.severity.toUpperCase();
        const door = doors.find(d => d.id === def.door_id);
        doc.rect(50, y, 3, 36).fill(sevColor);
        doc.fill(sevColor).fontSize(7).font('Helvetica-Bold').text(sevLabel + (door ? ` · Door ${door.door_number}` : ''), 58, y + 2);
        doc.fill(DARK).fontSize(9).font('Helvetica').text(def.description, 58, y + 12, { width: pageW - 12 });
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
