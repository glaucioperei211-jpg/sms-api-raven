// routes/authRoutes.js
// Handles group registration and login

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const { dbRun, dbGet } = require('../database');
const { JWT_SECRET, JWT_EXPIRES_IN, BCRYPT_ROUNDS } = require('../server.config');

// ─────────────────────────────────────────────
// POST /register
// Register a new group
// Body: { group_name, email, password }
// ─────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { group_name, email, password } = req.body;

  // ── Input validation ───────────────────────
  if (!group_name || !email || !password) {
    return res.status(400).json({ error: 'group_name, email, and password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  try {
    // Check if email is already registered
    const existing = await dbGet('SELECT id FROM groups WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Generate unique API key
    const api_key = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');

    // Insert new group
    const result = await dbRun(
      `INSERT INTO groups (group_name, email, password_hash, api_key)
       VALUES (?, ?, ?, ?)`,
      [group_name.trim(), email.toLowerCase(), password_hash, api_key]
    );

    console.log(`[AUTH] New group registered: "${group_name}" (ID: ${result.lastID})`);

    return res.status(201).json({
      message: 'Group registered successfully.',
      group_id: result.lastID,
      api_key: api_key,
    });

  } catch (err) {
    console.error('[AUTH] Register error:', err.message);
    return res.status(500).json({ error: 'Server error during registration.' });
  }
});

// ─────────────────────────────────────────────
// POST /login
// Login a group and receive a JWT
// Body: { email, password }
// ─────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Fetch group by email
    const group = await dbGet(
      'SELECT * FROM groups WHERE email = ?',
      [email.toLowerCase()]
    );

    if (!group) {
      // Use a vague message to prevent email enumeration
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Compare password with stored hash
    const passwordMatch = await bcrypt.compare(password, group.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT
    const token = jwt.sign(
      {
        id: group.id,
        email: group.email,
        group_name: group.group_name,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    console.log(`[AUTH] Login successful: "${group.group_name}" (ID: ${group.id})`);

    return res.status(200).json({
      message: 'Login successful.',
      token,
      group: {
        id: group.id,
        group_name: group.group_name,
        email: group.email,
        api_key: group.api_key,
        sms_limit: group.sms_limit,
      },
    });

  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    return res.status(500).json({ error: 'Server error during login.' });
  }
});

module.exports = router;
