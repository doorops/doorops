const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── Storage config ───────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, String(req.companyId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per photo
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  }
});

// ─── Upload photo ──────────────────────────────────────────────────────────────
router.post('/', requireAuth, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { inspection_id, door_id, deficiency_id, checklist_item_id, caption } = req.body;
    const url = `/uploads/${req.companyId}/${req.file.filename}`;

    const result = await db.query(
      `INSERT INTO inspection_photos (company_id, inspection_id, door_id, deficiency_id, checklist_item_id, url, filename, caption, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.companyId, inspection_id || null, door_id || null, deficiency_id || null,
       checklist_item_id || null, url, req.file.filename, caption || null, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[photos/upload]', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── Get photos for an inspection ─────────────────────────────────────────────
router.get('/inspection/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM inspection_photos WHERE inspection_id = $1 AND company_id = $2 ORDER BY created_at',
      [req.params.id, req.companyId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Get photos for a door ────────────────────────────────────────────────────
router.get('/door/:id', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM inspection_photos WHERE door_id = $1 AND company_id = $2 ORDER BY created_at',
      [req.params.id, req.companyId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── Delete photo ──────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const photo = await db.query(
      'SELECT * FROM inspection_photos WHERE id = $1 AND company_id = $2',
      [req.params.id, req.companyId]
    );
    if (!photo.rows.length) return res.status(404).json({ error: 'Not found' });

    // Delete file from disk
    const filePath = path.join(UPLOAD_DIR, String(req.companyId), photo.rows[0].filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.query('DELETE FROM inspection_photos WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
