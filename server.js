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

// Routes
app.use('/api/auth', require('./routes/auth'));
// app.use('/api/companies', require('./routes/companies'));
// app.use('/api/inspections', require('./routes/inspections'));
// app.use('/api/po', require('./routes/po'));
// app.use('/api/jobber', require('./routes/jobber'));
// app.use('/api/billing', require('./routes/billing'));

// Serve frontend for all non-API routes (SPA)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`DoorOps running on port ${PORT}`);
});
