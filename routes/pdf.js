const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ─── Generate PDF Report ──────────────────────────────────────────────────────
router.get('/inspection/:id', requireAuth, async (req, res) => {
  try {
    // Load inspection
    const insp = await db.query(
      'SELECT i.*, u.name as inspector_name, c.name as company_name FROM inspections i LEFT JOIN users u ON i.inspector_id = u.id LEFT JOIN companies c ON i.company_id = c.id WHERE i.id = $1 AND i.company_id = $2',
      [req.params.id, req.companyId]
    );
    if (!insp.rows.length) return res.status(404).json({ error: 'Not found' });
    const i = insp.rows[0];

    const doors = await db.query('SELECT * FROM inspection_doors WHERE inspection_id = $1 ORDER BY door_number', [req.params.id]);
    const defs = await db.query('SELECT * FROM inspection_deficiencies WHERE inspection_id = $1 ORDER BY severity DESC, created_at', [req.params.id]);

    // Build PDF
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="DoorOps-Report-${req.params.id}.pdf"`);
    doc.pipe(res);

    const ORANGE = '#F59E0B';
    const DARK = '#111827';
    const MUTED = '#6B7280';
    const DANGER = '#EF4444';
    const WARN = '#F97316';
    const pageW = doc.page.width - 100; // usable width

    // ── HEADER ──
    doc.rect(0, 0, doc.page.width, 80).fill(DARK);
    doc.fill(ORANGE).fontSize(22).font('Helvetica-Bold').text('DoorOps', 50, 22);
    doc.fill('#FFFFFF').fontSize(10).font('Helvetica').text('Inspection Report', 50, 48);
    const now = new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.fill('#9CA3AF').fontSize(9).text(`Generated: ${now}`, 0, 56, { align: 'right', width: doc.page.width - 50 });
    doc.moveDown(3);

    // ── PROPERTY INFO ──
    doc.fill(ORANGE).fontSize(11).font('Helvetica-Bold').text('PROPERTY', 50, 100);
    doc.moveTo(50, 115).lineTo(doc.page.width - 50, 115).strokeColor(ORANGE).lineWidth(1).stroke();

    doc.fill(DARK).fontSize(18).font('Helvetica-Bold').text(i.property_name || i.property_address, 50, 122);
    if (i.property_name) {
      doc.fill(MUTED).fontSize(11).font('Helvetica').text(i.property_address, 50, doc.y + 2);
    }

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

    // ── SUMMARY BOXES ──
    const safetyCritical = defs.rows.filter(d => d.severity === 'safety_critical').length;
    const moderate = defs.rows.filter(d => d.severity === 'moderate').length;
    const advisory = defs.rows.filter(d => d.severity === 'advisory').length;
    const quotedCost = defs.rows.filter(d => d.include_in_quote).reduce((s, d) => s + (parseFloat(d.estimated_cost) || 0), 0);

    const summaryY = doc.y + 8;
    const boxW = (pageW - 30) / 4;
    const summaries = [
      { label: 'Doors Inspected', val: doors.rows.length, color: '#1F2937' },
      { label: 'Safety Critical', val: safetyCritical, color: safetyCritical > 0 ? DANGER : '#1F2937' },
      { label: 'Moderate', val: moderate, color: moderate > 0 ? WARN : '#1F2937' },
      { label: 'Advisory', val: advisory, color: '#1F2937' },
    ];
    summaries.forEach((s, idx) => {
      const x = 50 + idx * (boxW + 10);
      doc.roundedRect(x, summaryY, boxW, 52, 4).fill(s.color).stroke();
      doc.fill(idx === 0 ? ORANGE : '#FFFFFF').fontSize(22).font('Helvetica-Bold').text(String(s.val), x, summaryY + 8, { width: boxW, align: 'center' });
      doc.fill('#9CA3AF').fontSize(8).font('Helvetica').text(s.label, x, summaryY + 36, { width: boxW, align: 'center' });
    });

    if (quotedCost > 0) {
      doc.moveDown(4);
      doc.fill(MUTED).fontSize(9).font('Helvetica').text(`Estimated quoted repairs: `, 50, doc.y);
      doc.fill(ORANGE).fontSize(9).font('Helvetica-Bold').text(`$${quotedCost.toFixed(2)}`, { continued: false });
    }

    doc.moveDown(4);

    // ── DOORS ──
    if (doors.rows.length > 0) {
      doc.addPage();

      doc.fill(ORANGE).fontSize(11).font('Helvetica-Bold').text('DOORS INSPECTED', 50, 50);
      doc.moveTo(50, 65).lineTo(doc.page.width - 50, 65).strokeColor(ORANGE).lineWidth(1).stroke();

      let y = 75;

      doors.rows.forEach((door, idx) => {
        if (y > doc.page.height - 150) { doc.addPage(); y = 50; }

        const doorDefs = defs.rows.filter(d => d.door_id === door.id);
        const condColor = { good: '#22C55E', fair: WARN, poor: DANGER, critical: DANGER }[door.overall_condition] || MUTED;

        // Door header
        doc.rect(50, y, pageW, 28).fill('#1F2937');
        doc.fill(ORANGE).fontSize(11).font('Helvetica-Bold').text(`Door ${door.door_number}${door.location ? ' — ' + door.location : ''}`, 58, y + 8);
        const typeLabel = (door.door_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        doc.fill('#9CA3AF').fontSize(9).font('Helvetica').text(typeLabel, 0, y + 10, { align: 'right', width: doc.page.width - 60 });
        y += 32;

        // Door info grid
        const doorInfo = [
          ['Size', door.door_width_ft && door.door_height_ft ? `${door.door_width_ft}' × ${door.door_height_ft}'` : door.door_size],
          ['Condition', door.overall_condition ? door.overall_condition.toUpperCase() : null],
          ['Make', door.make],
          ['Model', door.model],
          ['Serial', door.serial_number],
          ['Install Year', door.install_year],
          ['Opener', [door.opener_make, door.opener_model, door.opener_hp ? door.opener_hp + 'hp' : null].filter(Boolean).join(' ')],
        ].filter(r => r[1]);

        if (doorInfo.length > 0) {
          const cols = 3;
          const colW = pageW / cols;
          doorInfo.forEach((info, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = 50 + col * colW;
            const iy = y + row * 28;
            doc.fill(MUTED).fontSize(7).font('Helvetica').text(info[0].toUpperCase(), x + 4, iy + 4);
            const color = info[0] === 'Condition' ? condColor : DARK;
            doc.fill(color).fontSize(9).font('Helvetica-Bold').text(String(info[1]), x + 4, iy + 14, { width: colW - 8 });
          });
          y += Math.ceil(doorInfo.length / 3) * 28 + 4;
        }

        if (door.notes) {
          doc.fill(MUTED).fontSize(8).font('Helvetica-Oblique').text('Notes: ' + door.notes, 54, y, { width: pageW - 8 });
          y += doc.currentLineHeight() + 6;
        }

        // Door deficiencies
        if (doorDefs.length > 0) {
          doorDefs.forEach(def => {
            if (y > doc.page.height - 80) { doc.addPage(); y = 50; }
            const sevColor = { advisory: ORANGE, moderate: WARN, safety_critical: DANGER }[def.severity] || MUTED;
            const sevLabel = { advisory: 'ADVISORY', moderate: 'MODERATE', safety_critical: 'SAFETY CRITICAL' }[def.severity] || def.severity.toUpperCase();
            doc.rect(50, y, 3, 36).fill(sevColor);
            doc.fill(sevColor).fontSize(7).font('Helvetica-Bold').text(sevLabel, 58, y + 2);
            doc.fill(DARK).fontSize(9).font('Helvetica').text(def.description, 58, y + 12, { width: pageW - 12 });
            if (def.recommendation) {
              doc.fill(MUTED).fontSize(8).font('Helvetica-Oblique').text('→ ' + def.recommendation, 58, doc.y + 1, { width: pageW - 12 });
            }
            y = doc.y + 8;
          });
        }

        y += 12;
        doc.moveTo(50, y - 6).lineTo(doc.page.width - 50, y - 6).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
      });
    }

    // ── DEFICIENCIES SUMMARY ──
    if (defs.rows.length > 0) {
      doc.addPage();
      doc.fill(ORANGE).fontSize(11).font('Helvetica-Bold').text('DEFICIENCIES SUMMARY', 50, 50);
      doc.moveTo(50, 65).lineTo(doc.page.width - 50, 65).strokeColor(ORANGE).lineWidth(1).stroke();

      let y = 75;
      ['safety_critical', 'moderate', 'advisory'].forEach(sev => {
        const sevDefs = defs.rows.filter(d => d.severity === sev);
        if (!sevDefs.length) return;

        const sevColor = { advisory: ORANGE, moderate: WARN, safety_critical: DANGER }[sev];
        const sevLabel = { advisory: 'Advisory', moderate: 'Moderate', safety_critical: 'Safety Critical' }[sev];

        if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
        doc.fill(sevColor).fontSize(10).font('Helvetica-Bold').text(sevLabel + ` (${sevDefs.length})`, 50, y);
        y += 18;

        sevDefs.forEach((def, idx) => {
          if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
          const door = doors.rows.find(d => d.id === def.door_id);
          doc.fill(MUTED).fontSize(8).font('Helvetica').text(`${idx + 1}. ${door ? 'Door ' + door.door_number + (door.location ? ' (' + door.location + ')' : '') + ' — ' : ''}${def.description}`, 54, y, { width: pageW - 8 });
          if (def.estimated_cost) {
            doc.fill(ORANGE).fontSize(8).text(`  Est. $${parseFloat(def.estimated_cost).toFixed(2)}`, { continued: false });
          }
          y = doc.y + 6;
        });
        y += 8;
      });
    }

    // ── FOOTER on last page ──
    doc.fill(MUTED).fontSize(8).font('Helvetica').text(
      `DoorOps · app.doorops.app · Generated ${now} · ${i.company_name || 'DoorOps Report'}`,
      50, doc.page.height - 40, { align: 'center', width: pageW }
    );

    doc.end();
  } catch (err) {
    console.error('[pdf/inspection]', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed' });
  }
});

module.exports = router;
