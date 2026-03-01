// server.js
// Main entry point for the Capstone SMS Gateway Backend

const express = require('express');
const http = require('http');
const path = require('path');

const { PORT } = require('./server.config');
const { initializeDatabase } = require('./database');
const { setupWebSocket } = require('./websocket');
const authRoutes = require('./routes/authRoutes');
const apiRoutes = require('./routes/apiRoutes');
const adminRoutes = require('./routes/adminRoutes');

// ─────────────────────────────────────────────
// Initialize Express app
// ─────────────────────────────────────────────
const app = express();

// ── Body parsing middleware ──────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve static HTML files from /public ────
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────

// Auth routes: /register, /login
app.use('/', authRoutes);

// API routes: /api/send-sms, /api/dashboard-data, etc.
app.use('/api', apiRoutes);

// Admin routes: /admin/login, /admin/api/...
app.use('/admin', adminRoutes);

// ── Root redirect ────────────────────────────
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// ── 404 handler ──────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ── Global error handler ─────────────────────
app.use((err, req, res, next) => {
  console.error('[SERVER] Unhandled error:', err.message);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

// ─────────────────────────────────────────────
// Create HTTP server and attach WebSocket
// ─────────────────────────────────────────────
const server = http.createServer(app);

// Setup WebSocket server on the same HTTP server
setupWebSocket(server);

// ─────────────────────────────────────────────
// Initialize database and start server
// ─────────────────────────────────────────────
initializeDatabase();

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║      Capstone SMS Gateway Backend            ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║  HTTP  →  http://localhost:${PORT}               ║`);
  console.log(`║  WS    →  ws://localhost:${PORT}/ws              ║`);
  console.log(`║  Login →  http://localhost:${PORT}/login.html    ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
