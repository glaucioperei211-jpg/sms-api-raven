// routes/adminRoutes.js
// All admin panel routes — login + protected admin API endpoints

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { dbRun, dbGet, dbAll } = require('../database');
const { getDeviceSocket } = require('../websocket');
const { requireAdmin } = require('../middleware/adminMiddleware');
const {
  ADMIN_USERNAME,
  ADMIN_PASSWORD,
  ADMIN_JWT_SECRET,
  ADMIN_JWT_EXPIRES_IN,
  RATE_LIMIT_PER_MINUTE,
  SERVER_HOST,
  PORT,
} = require('../server.config');

// ─────────────────────────────────────────────
// GET /admin/api/ws-info
// Returns WebSocket connection details for Android
// ─────────────────────────────────────────────
router.get('/api/ws-info', requireAdmin, async (req, res) => {
  try {
    const device = await dbGet('SELECT is_online, last_seen, device_token FROM device LIMIT 1');

    const isLocalhost = SERVER_HOST === 'localhost' || SERVER_HOST === '127.0.0.1';
    const isNgrok     = SERVER_HOST.includes('ngrok');
    const isHttps     = !isLocalhost && !SERVER_HOST.startsWith('192.168') && !isNgrok;

    // Use wss:// for domains (HTTPS), ws:// for local/ngrok
    const protocol = isHttps ? 'wss' : 'ws';
    const port     = (isHttps || isNgrok) ? '' : `:${PORT}`;
    const wsUrl    = `${protocol}://${SERVER_HOST}${port}/ws`;

    return res.json({
      wsUrl,
      deviceConnected: device ? !!device.is_online : false,
      deviceToken: device ? device.device_token : null,
      lastSeen: device ? device.last_seen : null,
      hints: {
        localhost: `ws://YOUR_PC_IP:${PORT}/ws  (replace with your PC's local IP on same Wi-Fi)`,
        ngrok:     `wss://abc123.ngrok.io/ws   (use ngrok for outside-network access)`,
        domain:    `wss://yourdomain.com/ws    (use wss:// if your server has HTTPS)`,
      },
    });
  } catch (err) {
    console.error('[ADMIN] ws-info error:', err.message);
    return res.status(500).json({ error: 'Failed to load WebSocket info.' });
  }
});

// ─────────────────────────────────────────────
// POST /admin/login
// Body: { username, password }
// ─────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }

  const token = jwt.sign({ username }, ADMIN_JWT_SECRET, { expiresIn: ADMIN_JWT_EXPIRES_IN });

  console.log(`[ADMIN] Admin logged in: ${username}`);
  return res.status(200).json({ message: 'Admin login successful.', token });
});

// ══════════════════════════════════════════════
// All routes below require admin JWT
// ══════════════════════════════════════════════

// ─────────────────────────────────────────────
// GET /admin/api/overview
// Summary stats for the admin dashboard header
// ─────────────────────────────────────────────
router.get('/api/overview', requireAdmin, async (req, res) => {
  try {
    const totalGroups  = await dbGet('SELECT COUNT(*) as count FROM groups');
    const activeGroups = await dbGet('SELECT COUNT(*) as count FROM groups WHERE is_active = 1');
    const totalSms     = await dbGet('SELECT COUNT(*) as count FROM sms_logs');
    const pendingSms   = await dbGet("SELECT COUNT(*) as count FROM sms_logs WHERE status = 'pending'");
    const device       = await dbGet('SELECT is_online, last_seen FROM device LIMIT 1');

    return res.json({
      totalGroups:  totalGroups.count,
      activeGroups: activeGroups.count,
      totalSms:     totalSms.count,
      pendingSms:   pendingSms.count,
      device:       device || { is_online: 0, last_seen: null },
    });
  } catch (err) {
    console.error('[ADMIN] overview error:', err.message);
    return res.status(500).json({ error: 'Failed to load overview.' });
  }
});

// ─────────────────────────────────────────────
// GET /admin/api/groups
// List all groups with SMS usage
// ─────────────────────────────────────────────
router.get('/api/groups', requireAdmin, async (req, res) => {
  try {
    const groups = await dbAll(`
      SELECT
        g.id, g.group_name, g.email, g.api_key, g.sms_limit, g.is_active, g.created_at,
        COUNT(s.id) as sms_used
      FROM groups g
      LEFT JOIN sms_logs s ON s.group_id = g.id AND s.status != 'failed'
      GROUP BY g.id
      ORDER BY g.created_at DESC
    `);

    return res.json({ groups });
  } catch (err) {
    console.error('[ADMIN] groups error:', err.message);
    return res.status(500).json({ error: 'Failed to load groups.' });
  }
});

// ─────────────────────────────────────────────
// PATCH /admin/api/groups/:id/limit
// Adjust SMS limit for a group
// Body: { sms_limit }
// ─────────────────────────────────────────────
router.patch('/api/groups/:id/limit', requireAdmin, async (req, res) => {
  const groupId = parseInt(req.params.id);
  const { sms_limit } = req.body;

  if (!sms_limit || isNaN(sms_limit) || sms_limit < 0) {
    return res.status(400).json({ error: 'sms_limit must be a non-negative number.' });
  }

  try {
    const result = await dbRun(
      'UPDATE groups SET sms_limit = ? WHERE id = ?',
      [parseInt(sms_limit), groupId]
    );

    if (result.changes === 0) return res.status(404).json({ error: 'Group not found.' });

    console.log(`[ADMIN] Group #${groupId} SMS limit updated to ${sms_limit}`);
    return res.json({ message: `SMS limit updated to ${sms_limit}.` });
  } catch (err) {
    console.error('[ADMIN] limit update error:', err.message);
    return res.status(500).json({ error: 'Failed to update limit.' });
  }
});

// ─────────────────────────────────────────────
// PATCH /admin/api/groups/:id/toggle
// Enable or disable a group
// ─────────────────────────────────────────────
router.patch('/api/groups/:id/toggle', requireAdmin, async (req, res) => {
  const groupId = parseInt(req.params.id);

  try {
    const group = await dbGet('SELECT id, is_active, group_name FROM groups WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const newStatus = group.is_active ? 0 : 1;
    await dbRun('UPDATE groups SET is_active = ? WHERE id = ?', [newStatus, groupId]);

    const statusLabel = newStatus ? 'enabled' : 'disabled';
    console.log(`[ADMIN] Group "${group.group_name}" ${statusLabel}`);
    return res.json({ message: `Group ${statusLabel}.`, is_active: newStatus });
  } catch (err) {
    console.error('[ADMIN] toggle error:', err.message);
    return res.status(500).json({ error: 'Failed to toggle group status.' });
  }
});

// ─────────────────────────────────────────────
// DELETE /admin/api/groups/:id
// Permanently delete a group and its SMS logs
// ─────────────────────────────────────────────
router.delete('/api/groups/:id', requireAdmin, async (req, res) => {
  const groupId = parseInt(req.params.id);

  try {
    const group = await dbGet('SELECT id, group_name FROM groups WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    // Delete SMS logs first (foreign key)
    await dbRun('DELETE FROM sms_logs WHERE group_id = ?', [groupId]);
    await dbRun('DELETE FROM groups WHERE id = ?', [groupId]);

    console.log(`[ADMIN] Group "${group.group_name}" (ID: ${groupId}) deleted.`);
    return res.json({ message: `Group "${group.group_name}" deleted successfully.` });
  } catch (err) {
    console.error('[ADMIN] delete group error:', err.message);
    return res.status(500).json({ error: 'Failed to delete group.' });
  }
});

// ─────────────────────────────────────────────
// GET /admin/api/logs
// All SMS logs across all groups (last 100)
// Optional query: ?group_id=x
// ─────────────────────────────────────────────
router.get('/api/logs', requireAdmin, async (req, res) => {
  try {
    const { group_id } = req.query;
    let sql = `
      SELECT s.id, s.receiver, s.message, s.status, s.created_at,
             g.group_name
      FROM sms_logs s
      JOIN groups g ON g.id = s.group_id
    `;
    const params = [];

    if (group_id) {
      sql += ' WHERE s.group_id = ?';
      params.push(parseInt(group_id));
    }

    sql += ' ORDER BY s.created_at DESC LIMIT 100';

    const logs = await dbAll(sql, params);
    return res.json({ logs });
  } catch (err) {
    console.error('[ADMIN] logs error:', err.message);
    return res.status(500).json({ error: 'Failed to load logs.' });
  }
});

// ─────────────────────────────────────────────
// GET /admin/api/devices
// List all registered Android devices
// ─────────────────────────────────────────────
router.get('/api/devices', requireAdmin, async (req, res) => {
  try {
    const devices = await dbAll('SELECT * FROM device ORDER BY id ASC');
    return res.json({ devices });
  } catch (err) {
    console.error('[ADMIN] devices error:', err.message);
    return res.status(500).json({ error: 'Failed to load devices.' });
  }
});

// ─────────────────────────────────────────────
// POST /admin/api/devices
// Register a new Android device token
// Body: { device_token }
// ─────────────────────────────────────────────
router.post('/api/devices', requireAdmin, async (req, res) => {
  const { device_token } = req.body;

  if (!device_token || device_token.trim() === '') {
    return res.status(400).json({ error: 'device_token is required.' });
  }

  try {
    const existing = await dbGet('SELECT id FROM device WHERE device_token = ?', [device_token]);
    if (existing) return res.status(409).json({ error: 'Device token already registered.' });

    await dbRun('INSERT INTO device (device_token, is_online) VALUES (?, 0)', [device_token.trim()]);

    console.log(`[ADMIN] New device registered: ${device_token}`);
    return res.status(201).json({ message: 'Device registered.', device_token });
  } catch (err) {
    console.error('[ADMIN] register device error:', err.message);
    return res.status(500).json({ error: 'Failed to register device.' });
  }
});

// ─────────────────────────────────────────────
// DELETE /admin/api/devices/:id
// Remove a registered device
// ─────────────────────────────────────────────
router.delete('/api/devices/:id', requireAdmin, async (req, res) => {
  const deviceId = parseInt(req.params.id);

  try {
    const device = await dbGet('SELECT * FROM device WHERE id = ?', [deviceId]);
    if (!device) return res.status(404).json({ error: 'Device not found.' });

    await dbRun('DELETE FROM device WHERE id = ?', [deviceId]);

    console.log(`[ADMIN] Device deleted: ${device.device_token}`);
    return res.json({ message: 'Device removed.' });
  } catch (err) {
    console.error('[ADMIN] delete device error:', err.message);
    return res.status(500).json({ error: 'Failed to delete device.' });
  }
});

// ─────────────────────────────────────────────
// POST /admin/api/send-sms
// Send SMS on behalf of any group
// Body: { group_id, to, message }
// ─────────────────────────────────────────────
router.post('/api/send-sms', requireAdmin, async (req, res) => {
  const { group_id, to, message } = req.body;

  if (!group_id || !to || !message) {
    return res.status(400).json({ error: 'group_id, to, and message are required.' });
  }

  try {
    const group = await dbGet('SELECT * FROM groups WHERE id = ?', [parseInt(group_id)]);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    const formattedMessage = `[${group.group_name}]\n${message}`;

    const logResult = await dbRun(
      `INSERT INTO sms_logs (group_id, receiver, message, status) VALUES (?, ?, ?, 'pending')`,
      [group.id, to, message]
    );
    const smsId = logResult.lastID;

    const deviceSocket = getDeviceSocket();
    if (!deviceSocket || deviceSocket.readyState !== 1) {
      console.log(`[ADMIN] SMS #${smsId} queued (device offline) → ${to}`);
      return res.status(202).json({
        message: 'Device is offline. SMS has been queued and will be sent automatically when the device reconnects.',
        smsId,
        receiver: to,
        status: 'pending',
        queued: true,
      });
    }

    deviceSocket.send(JSON.stringify({ type: 'send_sms', smsId, to, message: formattedMessage }));

    console.log(`[ADMIN] Admin sent SMS #${smsId} → ${to} as group "${group.group_name}"`);
    return res.json({ message: 'SMS queued.', smsId, receiver: to, status: 'pending' });
  } catch (err) {
    console.error('[ADMIN] admin send-sms error:', err.message);
    return res.status(500).json({ error: 'Failed to send SMS.' });
  }
});

module.exports = router;
