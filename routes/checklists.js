const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/tenant');

// ─── DEFAULT CHECKLIST TEMPLATES ─────────────────────────────────────────────
// These are seeded into the DB on first use; companies can add custom ones.

const DEFAULT_TEMPLATES = {
  sectional: [
    { category: 'Springs', item: 'Torsion spring(s) intact and properly tensioned', critical: true },
    { category: 'Springs', item: 'Spring anchor plate secure', critical: false },
    { category: 'Springs', item: 'Spring cones not cracked or damaged', critical: true },
    { category: 'Cables', item: 'Lift cables intact, no broken strands', critical: true },
    { category: 'Cables', item: 'Cables properly seated in drums', critical: true },
    { category: 'Cables', item: 'Cable drum not cracked', critical: false },
    { category: 'Tracks', item: 'Vertical tracks plumb and secure', critical: false },
    { category: 'Tracks', item: 'Horizontal tracks level and properly pitched', critical: false },
    { category: 'Tracks', item: 'Track brackets tight, no loose bolts', critical: false },
    { category: 'Tracks', item: 'No bends, dents, or damage in tracks', critical: false },
    { category: 'Panels', item: 'All panels in good condition, no cracks or damage', critical: false },
    { category: 'Panels', item: 'Panel hinges secure and lubricated', critical: false },
    { category: 'Panels', item: 'Rollers in good condition (not worn or noisy)', critical: false },
    { category: 'Seals', item: 'Bottom weather seal intact and sealing', critical: false },
    { category: 'Seals', item: 'Side seals present and sealing', critical: false },
    { category: 'Seals', item: 'Top seal intact', critical: false },
    { category: 'Opener', item: 'Opener operates smoothly', critical: false },
    { category: 'Opener', item: 'Safety reversal functions correctly', critical: true },
    { category: 'Opener', item: 'Photo eye sensors aligned and functional', critical: true },
    { category: 'Opener', item: 'Manual release functional', critical: false },
    { category: 'Opener', item: 'Opener chain/belt/screw properly tensioned', critical: false },
    { category: 'Safety', item: 'Door balanced (should hold position when partially open)', critical: true },
    { category: 'Safety', item: 'No pinch points or entrapment hazards', critical: true },
    { category: 'Safety', item: 'Emergency release cord accessible', critical: false },
  ],
  rolling_steel: [
    { category: 'Curtain', item: 'Curtain slats intact, no cracks or damage', critical: false },
    { category: 'Curtain', item: 'End locks present on bottom bar', critical: true },
    { category: 'Curtain', item: 'Bottom bar in good condition', critical: false },
    { category: 'Springs', item: 'Spring(s) intact and properly tensioned', critical: true },
    { category: 'Springs', item: 'Spring shaft not bent or cracked', critical: true },
    { category: 'Guides', item: 'Guides properly aligned, no damage', critical: false },
    { category: 'Guides', item: 'Guide brackets secure', critical: false },
    { category: 'Guides', item: 'Windbar(s) present if required', critical: false },
    { category: 'Seals', item: 'Bottom weather seal intact', critical: false },
    { category: 'Seals', item: 'Side seals intact', critical: false },
    { category: 'Operator', item: 'Operator functions correctly', critical: false },
    { category: 'Operator', item: 'Safety edge functional', critical: true },
    { category: 'Operator', item: 'Reversing mechanism functional', critical: true },
    { category: 'Safety', item: 'Hood in good condition, no sharp edges', critical: false },
    { category: 'Safety', item: 'Hood supports adequate', critical: false },
  ],
  high_speed: [
    { category: 'Curtain', item: 'Curtain material intact, no tears or holes', critical: true },
    { category: 'Curtain', item: 'Curtain guides properly aligned', critical: false },
    { category: 'Curtain', item: 'Auto-reinsert (rollback) functional', critical: true },
    { category: 'Drive', item: 'Drive system operational', critical: false },
    { category: 'Drive', item: 'Motor/gearbox no unusual noise or heat', critical: false },
    { category: 'Drive', item: 'Belt/chain drive intact', critical: false },
    { category: 'Safety', item: 'Safety edge functional', critical: true },
    { category: 'Safety', item: 'Photo eyes aligned and functional', critical: true },
    { category: 'Safety', item: 'Loop detector (vehicle sensor) operational', critical: false },
    { category: 'Controls', item: 'Control panel operational, no fault codes', critical: false },
    { category: 'Controls', item: 'Emergency stop functional', critical: true },
    { category: 'Seals', item: 'Side seals intact', critical: false },
    { category: 'Seals', item: 'Bottom seal intact', critical: false },
  ],
  fire_door: [
    { category: 'Compliance', item: 'UL label present and legible', critical: true },
    { category: 'Compliance', item: 'Fusible link(s) intact and correct rating', critical: true },
    { category: 'Compliance', item: 'Last inspection tag present', critical: false },
    { category: 'Curtain', item: 'Curtain slats intact, no damage', critical: true },
    { category: 'Curtain', item: 'Bottom bar in good condition', critical: true },
    { category: 'Springs', item: 'Springs properly tensioned', critical: true },
    { category: 'Release', item: 'Gravity close tested successfully', critical: true },
    { category: 'Release', item: 'Door reaches floor and seals properly', critical: true },
    { category: 'Release', item: 'Smoke detector trigger functional (if applicable)', critical: true },
    { category: 'Release', item: 'Reset mechanism functional', critical: false },
    { category: 'Guides', item: 'Guides intact, door travels freely', critical: false },
  ],
  dock_leveler: [
    { category: 'Deck', item: 'Deck plate in good condition, no cracks', critical: false },
    { category: 'Deck', item: 'Deck lip functional and holds position', critical: true },
    { category: 'Deck', item: 'Non-slip surface intact', critical: false },
    { category: 'Hydraulics', item: 'Hydraulic fluid level adequate', critical: false },
    { category: 'Hydraulics', item: 'No hydraulic leaks', critical: true },
    { category: 'Hydraulics', item: 'Pump and motor operational', critical: false },
    { category: 'Hydraulics', item: 'Hold-down cylinders functional', critical: true },
    { category: 'Mechanical', item: 'Safety legs functional and engaging', critical: true },
    { category: 'Mechanical', item: 'Rear hinges secure', critical: false },
    { category: 'Mechanical', item: 'Bumpers in good condition', critical: false },
    { category: 'Safety', item: 'Lip barrier (if equipped) functional', critical: false },
    { category: 'Safety', item: 'Warning lights functional', critical: false },
  ],
  other: [
    { category: 'General', item: 'Unit operational', critical: false },
    { category: 'General', item: 'No unusual noise or vibration', critical: false },
    { category: 'General', item: 'Hardware secure, no loose fasteners', critical: false },
    { category: 'General', item: 'Weather seals intact', critical: false },
    { category: 'Safety', item: 'Safety devices functional', critical: true },
    { category: 'Safety', item: 'No visible structural damage', critical: false },
  ]
};

// Map door types to templates
function getTemplate(doorType) {
  return DEFAULT_TEMPLATES[doorType] || DEFAULT_TEMPLATES['other'];
}

// ─── GET checklist template for a door type ───────────────────────────────────
router.get('/template/:door_type', requireAuth, (req, res) => {
  const template = getTemplate(req.params.door_type);
  res.json(template);
});

// ─── GET checklist responses for a specific door ──────────────────────────────
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

// ─── SAVE checklist responses for a door ─────────────────────────────────────
// Accepts an array of { item, category, critical, result, note }
router.post('/door/:door_id', requireAuth, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

    // Delete existing and reinsert
    await db.query('DELETE FROM door_checklist_items WHERE door_id = $1', [req.params.door_id]);

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      await db.query(
        `INSERT INTO door_checklist_items (door_id, category, item, critical, result, note, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [req.params.door_id, item.category, item.item, item.critical || false,
         item.result || null, item.note || null, idx]
      );
    }

    const saved = await db.query('SELECT * FROM door_checklist_items WHERE door_id = $1 ORDER BY sort_order', [req.params.door_id]);
    res.json(saved.rows);
  } catch (err) {
    console.error('[checklist/save]', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── UPDATE single checklist item ─────────────────────────────────────────────
router.patch('/item/:item_id', requireAuth, async (req, res) => {
  try {
    const { result, note } = req.body;
    await db.query(
      'UPDATE door_checklist_items SET result = $1, note = $2 WHERE id = $3',
      [result, note || null, req.params.item_id]
    );
    const updated = await db.query('SELECT * FROM door_checklist_items WHERE id = $1', [req.params.item_id]);
    res.json(updated.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
