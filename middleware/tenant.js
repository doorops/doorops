const jwt = require('jsonwebtoken');
const db = require('../db');

// Verify JWT and attach user + company to request
async function requireAuth(req, res, next) {
  const token = req.cookies?.token
    || req.headers.authorization?.replace('Bearer ', '')
    || req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Load user with company
    const result = await db.query(
      'SELECT u.*, c.slug as company_slug, c.name as company_name, c.plan, c.active as company_active FROM users u JOIN companies c ON u.company_id = c.id WHERE u.id = $1 AND u.active = true',
      [decoded.userId]
    );

    if (!result.rows.length) return res.status(401).json({ error: 'User not found' });
    
    const user = result.rows[0];
    if (!user.company_active) return res.status(403).json({ error: 'Account suspended' });

    req.user = user;
    req.companyId = user.company_id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireAdmin(req, res, next) {
  if (!['owner', 'admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') {
    return res.status(403).json({ error: 'Owner access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireOwner };
