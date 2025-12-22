const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// ----------------------
// MIDDLEWARES
// ----------------------
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ----------------------
// ROUTES
// ----------------------

// Import Game Routes (HTTP)
const gameRoutes = require('./routes/Game/gameHttpRoutes');
const gameAuth = require('./routes/Game/AuthPlayer');

app.use('/api', gameRoutes);
app.use('/auth', gameAuth)

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'UNO Game API is running 🚀',
    timestamp: new Date().toISOString(),
  });
});

// ----------------------
// ERROR HANDLING
// ----------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

// Export the app for server.js
module.exports = app;
