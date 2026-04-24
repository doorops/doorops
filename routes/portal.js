const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const PDFDocument = require('pdfkit');

// ─── Helper: load published inspection by portal_token ────────────────────────
async function getPublishedInspection(token) {
  const result = await db.query(
    `SELECT i.*, c.name as company_name, c.phone as company_phone, c.email as company_email, c.logo_url as company_logo,
            u.name as inspector_name
     FROM inspections i
     LEFT JOIN companies c ON i.company_id = c.id
     LEFT JOIN users u ON i.inspector_id = u.id
     WHERE i.portal_token = $1 AND i.status IN ('published', 'sent', 'complete')`,
    [token]
  );
  return result.rows[0] || null;
}

// ─── Serve the portal SPA for /portal/:token ──────────────────────────────────
// This is handled by Express static + catch-all below (portal.html served directly).
// API routes below are used by the portal frontend.

// ─── GET /api/portal/:token — client portal entry ─────────────────────────────
// Returns published inspections for the same contact email
router.get('/:token', async (req, res) => {
  try {
    const insp = await getPublishedInspection(req.params.token);
    if (!insp) return res.status(404).json({ error: 'Report not found or not published' });

    // Load all published inspections for this contact email at this company
    let relatedInspections = [];
    if (insp.contact_email) {
      const related = await db.query(
        `SELECT i.id, i.property_name, i.property_address, i.contact_name, i.status,
                i.inspection_date, i.next_inspection_date, i.portal_token, i.published_at,
                COUNT(DISTINCT d.id) as door_count,
                COUNT(DISTINCT def.id) as deficiency_count
         FROM inspections i
         LEFT JOIN inspection_doors d ON d.inspection_id = i.id
         LEFT JOIN inspection_deficiencies def ON def.inspection_id = i.id
         WHERE i.company_id = $1
           AND i.contact_email = $2
           AND i.status IN ('published', 'sent')
           AND i.portal_token IS NOT NULL
         GROUP BY i.id
         ORDER BY i.inspection_date DESC NULLS LAST, i.created_at DESC
         LIMIT 50`,
        [insp.company_id, insp.contact_email]
      );
      relatedInspections = related.rows;
    } else {
      relatedInspections = [{
        id: insp.id, property_name: insp.property_name, property_address: insp.property_address,
        contact_name: insp.contact_name, status: insp.status, inspection_date: insp.inspection_date,
        next_inspection_date: insp.next_inspection_date, portal_token: insp.portal_token,
        published_at: insp.published_at
      }];
    }

    // Update last_accessed (fire and forget)
    db.query('UPDATE inspections SET updated_at = updated_at WHERE portal_token = $1', [req.params.token]).catch(() => {});

    res.json({
      company: {
        name: insp.company_name,
        phone: insp.company_phone,
        email: insp.company_email,
        logo_url: insp.company_logo
      },
      contact_name: insp.contact_name,
      contact_email: insp.contact_email,
      inspections: relatedInspections,
      current_token: req.params.token
    });
  } catch (err) {
    console.error('[portal/list]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/portal/inspection/:portal_token — detail ───────────────────────
router.get('/inspection/:token', async (req, res) => {
  try {
    const insp = await getPublishedInspection(req.params.token);
    if (!insp) return res.status(404).json({ error: 'Report not found or not published' });

    const doors = await db.query(
      'SELECT * FROM inspection_doors WHERE inspection_id = $1 ORDER BY door_number',
      [insp.id]
    );
    const doorIds = doors.rows.map(d => d.id);

    let deficiencies = [];
    let findings = [];
    if (doorIds.length > 0) {
      const [fRes, dRes] = await Promise.all([
        db.query('SELECT * FROM door_checklist_items WHERE door_id = ANY($1) ORDER BY door_id, sort_order', [doorIds]),
        db.query('SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 ORDER BY severity DESC, created_at', [insp.id])
      ]);
      findings = fRes.rows;
      deficiencies = dRes.rows;
    } else {
      const dRes = await db.query('SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 ORDER BY severity DESC, created_at', [insp.id]);
      deficiencies = dRes.rows;
    }

    // Group findings per door for stats
    const defByItem = {};
    for (const d of deficiencies) {
      if (d.checklist_item_id) defByItem[d.checklist_item_id] = d;
    }

    const findingsByDoor = {};
    for (const f of findings) {
      if (!findingsByDoor[f.door_id]) findingsByDoor[f.door_id] = [];
      findingsByDoor[f.door_id].push({
        ...f,
        template_category: f.category,
        template_label: f.item,
        notes: f.note || '',
        deficiency: defByItem[f.id] || null
      });
    }

    const doorsWithFindings = doors.rows.map(d => ({
      ...d,
      location_label: d.location_label || d.location || ('Door ' + d.door_number),
      findings: findingsByDoor[d.id] || []
    }));

    res.json({
      inspection: {
        id: insp.id,
        property_name: insp.property_name,
        property_address: insp.property_address,
        contact_name: insp.contact_name,
        contact_email: insp.contact_email,
        inspection_date: insp.inspection_date,
        next_inspection_date: insp.next_inspection_date,
        inspection_frequency: insp.inspection_frequency,
        status: insp.status,
        published_at: insp.published_at,
        completed_at: insp.completed_at,
        notes: insp.notes
      },
      company: {
        name: insp.company_name,
        phone: insp.company_phone,
        email: insp.company_email,
        logo_url: insp.company_logo
      },
      inspector_name: insp.inspector_name,
      doors: doorsWithFindings,
      deficiencies
    });
  } catch (err) {
    console.error('[portal/inspection]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/portal/pdf/:portal_token — download PDF ────────────────────────
router.get('/pdf/:token', async (req, res) => {
  try {
    const insp = await getPublishedInspection(req.params.token);
    if (!insp) return res.status(404).json({ error: 'Report not found or not published' });

    const doors = await db.query('SELECT * FROM inspection_doors WHERE inspection_id = $1 ORDER BY door_number', [insp.id]);
    const defs = await db.query('SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 ORDER BY severity DESC, created_at', [insp.id]);

    const pdfBuffer = await generatePortalPdf(insp, doors.rows, defs.rows);

    const filename = `DoorOps-Report-${insp.property_address.replace(/[^a-z0-9]/gi, '-').substring(0, 40)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('[portal/pdf]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

async function generatePortalPdf(i, doors, defs) {
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

    // Header
    doc.rect(0, 0, doc.page.width, 80).fill(DARK);
    doc.fill(GREEN).fontSize(22).font('Helvetica-Bold').text('DoorOps', 50, 22);
    doc.fill('#FFFFFF').fontSize(10).font('Helvetica').text('Inspection Report', 50, 48);
    const now = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.fill('#9CA3AF').fontSize(9).text(`Generated: ${now}`, 0, 56, { align: 'right', width: doc.page.width - 50 });

    // Property section
    doc.fill(GREEN).fontSize(11).font('Helvetica-Bold').text('PROPERTY', 50, 100);
    doc.moveTo(50, 115).lineTo(doc.page.width - 50, 115).strokeColor(GREEN).lineWidth(1).stroke();
    doc.fill(DARK).fontSize(18).font('Helvetica-Bold').text(i.property_name || i.property_address, 50, 122);
    if (i.property_name) doc.fill(MUTED).fontSize(11).font('Helvetica').text(i.property_address, 50, doc.y + 2);

    const infoY = doc.y + 10;
    const cols = [
      ['Date', i.inspection_date ? new Date(i.inspection_date).toLocaleDateString('en-CA') : 'N/A'],
      ['Inspector', i.inspector_name || 'N/A'],
      ['Contact', i.contact_name || 'N/A'],
      ['Company', i.company_name || 'DoorOps'],
    ];
    cols.forEach((col, idx) => {
      const x = 50 + (idx * (pageW / 4));
      doc.fill(MUTED).fontSize(8).font('Helvetica').text(col[0].toUpperCase(), x, infoY);
      doc.fill(DARK).fontSize(10).font('Helvetica-Bold').text(col[1], x, infoY + 12, { width: pageW / 4 - 10 });
    });
    doc.moveDown(4);

    // Next inspection info
    if (i.next_inspection_date) {
      const nextDate = new Date(i.next_inspection_date).toLocaleDateString('en-CA');
      doc.fill(WARN).fontSize(9).font('Helvetica').text(`Next Recommended Inspection: ${nextDate}${i.inspection_frequency ? ' (' + i.inspection_frequency + ')' : ''}`, 50, doc.y + 4);
      doc.moveDown(1);
    }

    // Summary
    const safetyCritical = defs.filter(d => d.severity === 'safety_critical').length;
    const moderate = defs.filter(d => d.severity === 'moderate').length;
    const advisory = defs.filter(d => d.severity === 'advisory').length;

    doc.fill(MUTED).fontSize(9).font('Helvetica').text(
      `Doors Inspected: ${doors.length} | Safety Critical: ${safetyCritical} | Moderate: ${moderate} | Advisory: ${advisory}`,
      50, doc.y + 8
    );

    // Deficiencies
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
        doc.rect(50, y, 3, 40).fill(sevColor);
        doc.fill(sevColor).fontSize(7).font('Helvetica-Bold').text(sevLabel + (door ? ` · ${door.location || ('Door ' + door.door_number)}` : ''), 58, y + 2);
        const title = def.title || def.description || '';
        doc.fill(DARK).fontSize(10).font('Helvetica-Bold').text(title, 58, y + 12, { width: pageW - 12 });
        if (def.description && def.title && def.description !== def.title) {
          doc.fill(MUTED).fontSize(8).font('Helvetica').text(def.description, 58, doc.y + 2, { width: pageW - 12 });
        }
        y = doc.y + 10;
      });
    }

    // Footer
    doc.fill(MUTED).fontSize(8).font('Helvetica').text(
      `DoorOps · app.doorops.app · ${i.company_name || 'DoorOps Report'}`,
      50, doc.page.height - 40, { align: 'center', width: pageW }
    );

    doc.end();
  });
}

module.exports = router;
