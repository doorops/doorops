require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/inspections', require('./routes/inspections'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/checklists', require('./routes/checklists'));
app.use('/api/photos', require('./routes/photos'));
app.use('/api/team', require('./routes/team'));
app.use('/api/jobber', require('./routes/jobber'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/portal', require('./routes/portal'));

// Serve frontend for all non-API routes (SPA)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  // Named HTML pages
  if (req.path === '/privacy') return res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
  if (req.path === '/terms') return res.sendFile(path.join(__dirname, 'public', 'terms.html'));
  // Client portal — serve portal.html for /portal/:token
  if (req.path.startsWith('/portal/')) return res.sendFile(path.join(__dirname, 'public', 'portal.html'));
  // Shareable report — serve report.html for /report/:token
  if (req.path.startsWith('/report/')) return res.sendFile(path.join(__dirname, 'public', 'report.html'));
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`DoorOps running on port ${PORT}`);
});
