// routes/apiRoutes.js
// API routes for groups (send SMS via API key) and admin dashboard actions

const express = require('express');
const router = express.Router();

const { dbRun, dbGet, dbAll } = require('../database');
const { getGroupDeviceSocket, getOnlineDevicesForGroup } = require('../websocket');
const { requireAuth } = require('../middleware/authMiddleware');
const { RATE_LIMIT_PER_MINUTE } = require('../server.config');

// ─────────────────────────────────────────────
// In-memory rate limit store
// Structure: { groupId: [timestamp, timestamp, ...] }
// ─────────────────────────────────────────────
const rateLimitMap = {};

function checkRateLimit(groupId) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute

  if (!rateLimitMap[groupId]) {
    rateLimitMap[groupId] = [];
  }

  // Remove timestamps older than 1 minute
  rateLimitMap[groupId] = rateLimitMap[groupId].filter(ts => now - ts < windowMs);

  if (rateLimitMap[groupId].length >= RATE_LIMIT_PER_MINUTE) {
    return false; // Rate limit exceeded
  }

  // Record this request
  rateLimitMap[groupId].push(now);
  return true;
}

// ─────────────────────────────────────────────
// POST /api/send-sms
// Send an SMS via API key (for external group use)
// Header: Authorization: Bearer GROUP_API_KEY
// Body:   { to, message }
// ─────────────────────────────────────────────
router.post('/send-sms', async (req, res) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header. Use: Bearer YOUR_API_KEY' });
  }

  const apiKey = authHeader.split(' ')[1];
  const { to, message } = req.body;

  // ── Input validation ───────────────────────
  if (!to || !message) {
    return res.status(400).json({ error: '"to" and "message" fields are required.' });
  }

  if (message.length > 160) {
    return res.status(400).json({ error: 'Message exceeds 160 characters.' });
  }

  try {
    // Validate API key and lookup group
    const group = await dbGet(
      'SELECT * FROM groups WHERE api_key = ?',
      [apiKey]
    );

    if (!group) {
      return res.status(403).json({ error: 'Invalid API key.' });
    }

    // ── Check if group is active ───────────────
    if (!group.is_active) {
      return res.status(403).json({ error: 'This group has been disabled by the administrator.' });
    }

    // ── Check SMS limit ────────────────────────
    const usedCount = await dbGet(
      `SELECT COUNT(*) as count FROM sms_logs WHERE group_id = ? AND status != 'failed'`,
      [group.id]
    );

    if (usedCount.count >= group.sms_limit) {
      return res.status(429).json({
        error: 'SMS limit reached for this group.',
        limit: group.sms_limit,
        used: usedCount.count,
      });
    }

    // ── Check rate limit ───────────────────────
    if (!checkRateLimit(group.id)) {
      return res.status(429).json({
        error: `Rate limit exceeded. Max ${RATE_LIMIT_PER_MINUTE} SMS per minute per group.`,
      });
    }

    // ── Format message with group name prefix ──
    // Groups cannot modify the sender name
    const formattedMessage = `[${group.group_name}]\n${message}`;

    // ── Insert into sms_logs (status: pending) ─
    const logResult = await dbRun(
      `INSERT INTO sms_logs (group_id, receiver, message, status)
       VALUES (?, ?, ?, 'pending')`,
      [group.id, to, message]
    );

    const smsId = logResult.lastID;

    // ── Send via WebSocket to group's device ───
    const deviceSocket = getGroupDeviceSocket(group.id);

    if (!deviceSocket || deviceSocket.readyState !== 1 /* OPEN */) {
      // Device is offline — SMS stays 'pending' and will be delivered
      // automatically when the Android device reconnects (auto-flush).
      console.log(`[API] SMS #${smsId} queued (device offline) → ${to}`);
      return res.status(202).json({
        message: 'Device is currently offline. SMS has been queued and will be sent automatically when the device reconnects.',
        smsId,
        receiver: to,
        status: 'pending',
        queued: true,
      });
    }

    deviceSocket.send(JSON.stringify({
      type: 'send_sms',
      smsId,
      to,
      message: formattedMessage,
    }));

    console.log(`[API] SMS #${smsId} queued → ${to} | Group: ${group.group_name}`);

    return res.status(200).json({
      message: 'SMS queued successfully.',
      smsId,
      receiver: to,
      status: 'pending',
    });

  } catch (err) {
    console.error('[API] send-sms error:', err.message);
    return res.status(500).json({ error: 'Server error while processing SMS.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/dashboard-data
// Returns dashboard info for the logged-in group
// Protected by JWT (requireAuth middleware)
// ─────────────────────────────────────────────
router.get('/dashboard-data', requireAuth, async (req, res) => {
  try {
    const groupId = req.user.id;

    // Fetch group details
    const group = await dbGet(
      'SELECT id, group_name, email, api_key, sms_limit, created_at FROM groups WHERE id = ?',
      [groupId]
    );

    if (!group) {
      return res.status(404).json({ error: 'Group not found.' });
    }

    // Count sent SMS
    const usedCount = await dbGet(
      `SELECT COUNT(*) as count FROM sms_logs WHERE group_id = ? AND status != 'failed'`,
      [groupId]
    );

    // Fetch last 20 SMS logs
    const logs = await dbAll(
      `SELECT id, receiver, message, status, created_at
       FROM sms_logs
       WHERE group_id = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [groupId]
    );

    // Check group devices status
    const devices = await dbAll(
      `SELECT id, device_name, device_model, device_token, is_online, is_active, is_primary, last_seen
       FROM group_devices
       WHERE group_id = ?
       ORDER BY is_primary DESC, is_online DESC, last_seen DESC`,
      [groupId]
    );

    return res.status(200).json({
      group: {
        id: group.id,
        group_name: group.group_name,
        email: group.email,
        api_key: group.api_key,
        sms_limit: group.sms_limit,
        sms_used: usedCount.count,
        sms_remaining: group.sms_limit - usedCount.count,
        created_at: group.created_at,
      },
      devices: devices || [],
      logs,
    });

  } catch (err) {
    console.error('[API] dashboard-data error:', err.message);
    return res.status(500).json({ error: 'Failed to load dashboard data.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/dashboard-send
// Send SMS from the dashboard form (JWT-protected)
// Body: { to, message }
// ─────────────────────────────────────────────
router.post('/dashboard-send', requireAuth, async (req, res) => {
  const { to, message } = req.body;
  const groupId = req.user.id;

  if (!to || !message) {
    return res.status(400).json({ error: '"to" and "message" are required.' });
  }

  if (message.length > 160) {
    return res.status(400).json({ error: 'Message exceeds 160 characters.' });
  }

  try {
    const group = await dbGet('SELECT * FROM groups WHERE id = ?', [groupId]);
    if (!group) return res.status(404).json({ error: 'Group not found.' });

    // Check SMS limit
    const usedCount = await dbGet(
      `SELECT COUNT(*) as count FROM sms_logs WHERE group_id = ? AND status != 'failed'`,
      [groupId]
    );

    if (usedCount.count >= group.sms_limit) {
      return res.status(429).json({
        error: 'SMS limit reached.',
        limit: group.sms_limit,
        used: usedCount.count,
      });
    }

    // Check rate limit
    if (!checkRateLimit(groupId)) {
      return res.status(429).json({
        error: `Rate limit exceeded. Max ${RATE_LIMIT_PER_MINUTE} SMS per minute.`,
      });
    }

    // Format message with group name prefix
    const formattedMessage = `[${group.group_name}]\n${message}`;

    // Insert log
    const logResult = await dbRun(
      `INSERT INTO sms_logs (group_id, receiver, message, status)
       VALUES (?, ?, ?, 'pending')`,
      [groupId, to, message]
    );

    const smsId = logResult.lastID;

    // Forward to group's Android device via WebSocket
    const deviceSocket = getGroupDeviceSocket(groupId);

    if (!deviceSocket || deviceSocket.readyState !== 1) {
      // Device is offline — SMS stays 'pending' and will be delivered
      // automatically when the Android device reconnects (auto-flush).
      console.log(`[DASH] SMS #${smsId} queued (device offline) → ${to}`);
      return res.status(202).json({
        message: 'Device is currently offline. SMS has been queued and will be sent automatically when the device reconnects.',
        smsId,
        receiver: to,
        status: 'pending',
        queued: true,
      });
    }

    deviceSocket.send(JSON.stringify({
      type: 'send_sms',
      smsId,
      to,
      message: formattedMessage,
    }));

    console.log(`[DASH] SMS #${smsId} sent from dashboard → ${to} | Group: ${group.group_name}`);

    return res.status(200).json({
      message: 'SMS queued successfully.',
      smsId,
      receiver: to,
      status: 'pending',
    });

  } catch (err) {
    console.error('[DASH] dashboard-send error:', err.message);
    return res.status(500).json({ error: 'Server error while sending SMS.' });
  }
});

// ─────────────────────────────────────────────
// POST /api/register-device
// Register a new device for authenticated group
// Protected by JWT
// Body: { device_token, device_name, device_model, is_primary }
// ─────────────────────────────────────────────
router.post('/register-device', requireAuth, async (req, res) => {
  const { device_token, device_name, device_model, is_primary } = req.body;
  const groupId = req.user.id;

  if (!device_token) {
    return res.status(400).json({ error: 'device_token is required.' });
  }

  try {
    // Check if device token already exists for this group
    const existing = await dbGet(
      'SELECT id FROM group_devices WHERE device_token = ? AND group_id = ?',
      [device_token, groupId]
    );

    if (existing) {
      return res.status(409).json({ error: 'Device token already registered for this group.' });
    }

    // If this device is marked as primary, unmark all other devices
    if (is_primary) {
      await dbRun(
        'UPDATE group_devices SET is_primary = 0 WHERE group_id = ?',
        [groupId]
      );
    }

    await dbRun(
      `INSERT INTO group_devices (group_id, device_token, device_name, device_model, is_primary, is_online)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [groupId, device_token, device_name || 'Unknown Device', device_model || 'Unknown Model', is_primary ? 1 : 0]
    );

    console.log(`[DEVICE] New device registered for group ${groupId}: ${device_token}`);
    return res.status(201).json({
      message: 'Device registered successfully.',
      device_token,
      device_name,
    });

  } catch (err) {
    console.error('[DEVICE] register-device error:', err.message);
    return res.status(500).json({ error: 'Failed to register device.' });
  }
});

// ─────────────────────────────────────────────
// GET /api/devices
// Get all devices for authenticated group
// Protected by JWT
// ─────────────────────────────────────────────
router.get('/devices', requireAuth, async (req, res) => {
  const groupId = req.user.id;

  try {
    const devices = await dbAll(
      `SELECT id, device_token, device_name, device_model, is_online, is_active, is_primary, last_seen, registered_at
       FROM group_devices
       WHERE group_id = ?
       ORDER BY is_primary DESC, is_online DESC, last_seen DESC`,
      [groupId]
    );

    return res.status(200).json({ devices });
  } catch (err) {
    console.error('[DEVICE] devices error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch devices.' });
  }
});

// ─────────────────────────────────────────────
// PUT /api/devices/:deviceId
// Update device settings (name, primary status, active status)
// Protected by JWT
// Body: { device_name, is_primary, is_active }
// ─────────────────────────────────────────────
router.put('/devices/:deviceId', requireAuth, async (req, res) => {
  const { deviceId } = req.params;
  const { device_name, is_primary, is_active } = req.body;
  const groupId = req.user.id;

  try {
    // Verify device belongs to this group
    const device = await dbGet(
      'SELECT id FROM group_devices WHERE id = ? AND group_id = ?',
      [deviceId, groupId]
    );

    if (!device) {
      return res.status(404).json({ error: 'Device not found or does not belong to your group.' });
    }

    // If setting as primary, unmark all other devices
    if (is_primary === true || is_primary === 1) {
      await dbRun(
        'UPDATE group_devices SET is_primary = 0 WHERE group_id = ?',
        [groupId]
      );
    }

    // Build update query dynamically
    const updates = [];
    const params = [];

    if (device_name !== undefined) {
      updates.push('device_name = ?');
      params.push(device_name);
    }

    if (is_primary !== undefined) {
      updates.push('is_primary = ?');
      params.push(is_primary ? 1 : 0);
    }

    if (is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    params.push(deviceId);
    params.push(groupId);

    await dbRun(
      `UPDATE group_devices SET ${updates.join(', ')} WHERE id = ? AND group_id = ?`,
      params
    );

    console.log(`[DEVICE] Device ${deviceId} updated for group ${groupId}`);
    return res.status(200).json({ message: 'Device updated successfully.' });

  } catch (err) {
    console.error('[DEVICE] update-device error:', err.message);
    return res.status(500).json({ error: 'Failed to update device.' });
  }
});

// ─────────────────────────────────────────────
// DELETE /api/devices/:deviceId
// Delete a device from the group
// Protected by JWT
// ─────────────────────────────────────────────
router.delete('/devices/:deviceId', requireAuth, async (req, res) => {
  const { deviceId } = req.params;
  const groupId = req.user.id;

  try {
    // Verify device belongs to this group
    const device = await dbGet(
      'SELECT id FROM group_devices WHERE id = ? AND group_id = ?',
      [deviceId, groupId]
    );

    if (!device) {
      return res.status(404).json({ error: 'Device not found or does not belong to your group.' });
    }

    await dbRun(
      'DELETE FROM group_devices WHERE id = ? AND group_id = ?',
      [deviceId, groupId]
    );

    console.log(`[DEVICE] Device ${deviceId} deleted from group ${groupId}`);
    return res.status(200).json({ message: 'Device deleted successfully.' });

  } catch (err) {
    console.error('[DEVICE] delete-device error:', err.message);
    return res.status(500).json({ error: 'Failed to delete device.' });
  }
});

module.exports = router;
