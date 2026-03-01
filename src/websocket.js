// websocket.js
// Manages the WebSocket server with per-group device support
// NEW: Each group has their own set of devices

const { WebSocketServer } = require('ws');
const { dbRun, dbGet, dbAll } = require('./database');

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────
const PING_INTERVAL_MS  = 30000; // Send ping every 30 seconds
const AUTH_TIMEOUT_MS   = 15000; // Disconnect if not authenticated within 15s

// ─────────────────────────────────────────────
// Map of connected device sockets by group_id
// Structure: { groupId: { deviceId: socket, ... }, ... }
// ─────────────────────────────────────────────
const connectedDevices = {};

// ─────────────────────────────────────────────
// Get all active device sockets for a group
// Returns array of open sockets
// ─────────────────────────────────────────────
function getGroupDevices(groupId) {
  if (!connectedDevices[groupId]) {
    return [];
  }
  return Object.values(connectedDevices[groupId]).filter(
    ws => ws && ws.readyState === 1 /* OPEN */
  );
}

// ─────────────────────────────────────────────
// Get primary device for a group (if available)
// NEW: Returns the primary device or first available
// ─────────────────────────────────────────────
function getPrimaryDevice(groupId) {
  const devices = getGroupDevices(groupId);
  if (devices.length === 0) return null;
  
  // Try to find primary device
  for (const ws of devices) {
    if (ws._isPrimary) return ws;
  }
  
  // Fallback to first device
  return devices[0];
}

// ─────────────────────────────────────────────
// Get a list of online devices for a group
// ─────────────────────────────────────────────
function getOnlineDevicesForGroup(groupId) {
  const devices = getGroupDevices(groupId);
  return devices.map(ws => ({
    deviceId: ws._deviceId,
    deviceToken: ws._deviceToken,
    isPrimary: ws._isPrimary || false,
    lastSeen: new Date(),
  }));
}

// ─────────────────────────────────────────────
// Flush pending SMS to a group's primary device
// NEW: Routes SMS to primary/available device
// ─────────────────────────────────────────────
async function flushPendingSms(groupId) {
  try {
    const device = getPrimaryDevice(groupId);
    if (!device) {
      console.log(`[WS] No device available for group ${groupId} to flush pending SMS.`);
      return;
    }

    const pending = await dbAll(
      `SELECT s.id, s.receiver, s.message, g.group_name
       FROM sms_logs s
       JOIN groups g ON g.id = s.group_id
       WHERE s.group_id = ? AND s.status = 'pending'
       ORDER BY s.created_at ASC`,
      [groupId]
    );

    if (pending.length === 0) {
      console.log(`[WS] No pending SMS for group ${groupId}.`);
      return;
    }

    console.log(`[WS] Flushing ${pending.length} pending SMS for group ${groupId}...`);

    for (const sms of pending) {
      if (device.readyState !== 1 /* OPEN */) {
        console.warn(`[WS] Device socket closed during flush for group ${groupId} — stopping.`);
        break;
      }
      const formattedMessage = `[${sms.group_name}]\n${sms.message}`;
      device.send(JSON.stringify({
        type: 'send_sms',
        smsId: sms.id,
        to: sms.receiver,
        message: formattedMessage,
      }));
      console.log(`[WS] Flushed SMS #${sms.id} for group ${groupId} → ${sms.receiver}`);
    }
  } catch (err) {
    console.error(`[WS] flushPendingSms error for group ${groupId}:`, err.message);
  }
}

// ─────────────────────────────────────────────
// Mark device offline in DB
// ─────────────────────────────────────────────
async function markDeviceOffline(deviceId) {
  if (!deviceId) return;
  try {
    await dbRun(
      'UPDATE group_devices SET is_online = 0, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
      [deviceId]
    );
    console.log(`[WS] Device ${deviceId} marked offline.`);
  } catch (err) {
    console.error('[WS] Failed to mark device offline:', err.message);
  }
}

// ─────────────────────────────────────────────
// Setup WebSocket Server with multi-device support
// ─────────────────────────────────────────────
function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  console.log('[WS] WebSocket server listening on /ws (multi-device per group)');

  // ── Global ping interval ──────────────────────
  // Ping all authenticated clients on a fixed schedule
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws._authenticated) return;

      if (ws._missedPings >= 2) {
        console.warn(`[WS] Device ${ws._deviceId} missed ${ws._missedPings} pings — terminating.`);
        ws.terminate();
        return;
      }

      ws._missedPings = (ws._missedPings || 0) + 1;
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('close', () => clearInterval(pingInterval));

  wss.on('connection', (ws, req) => {
    const clientIP = req.socket.remoteAddress;
    console.log(`[WS] New connection from ${clientIP} — waiting for auth...`);

    // Per-connection state
    ws._authenticated = false;
    ws._groupId      = null;
    ws._deviceId     = null;
    ws._deviceToken  = null;
    ws._isPrimary    = false;
    ws._missedPings  = 0;

    // ── Auth timeout ───────────────────────────
    const authTimeout = setTimeout(() => {
      if (!ws._authenticated) {
        console.warn(`[WS] Connection from ${clientIP} timed out (no auth).`);
        ws.send(JSON.stringify({ type: 'error', message: 'Authentication timeout. Send auth message within 15 seconds.' }));
        ws.terminate();
      }
    }, AUTH_TIMEOUT_MS);

    // ── Pong handler ───────────────────────────
    ws.on('pong', () => {
      ws._missedPings = 0;
    });

    // ── Handle incoming messages ───────────────
    ws.on('message', async (rawData) => {
      let data;

      try {
        data = JSON.parse(rawData.toString());
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format.' }));
        return;
      }

      // ── Auth handshake ────────────────────────
      if (data.type === 'auth') {
        if (!data.deviceToken || !data.groupId) {
          ws.send(JSON.stringify({ type: 'error', message: 'deviceToken and groupId are required.' }));
          return;
        }

        try {
          // Verify group exists
          const group = await dbGet(
            'SELECT id FROM groups WHERE id = ?',
            [data.groupId]
          );

          if (!group) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid group ID.' }));
            ws.terminate();
            return;
          }

          // Look up device in group_devices
          const device = await dbGet(
            'SELECT id, is_active FROM group_devices WHERE device_token = ? AND group_id = ?',
            [data.deviceToken, data.groupId]
          );

          if (!device) {
            ws.send(JSON.stringify({ type: 'error', message: 'Device not found for this group. Please register first.' }));
            ws.terminate();
            return;
          }

          if (!device.is_active) {
            ws.send(JSON.stringify({ type: 'error', message: 'This device has been deactivated.' }));
            ws.terminate();
            return;
          }

          clearTimeout(authTimeout);

          // Mark connection as authenticated
          ws._authenticated = true;
          ws._groupId       = data.groupId;
          ws._deviceId      = device.id;
          ws._deviceToken   = data.deviceToken;
          ws._isPrimary     = data.isPrimary || false;
          ws._missedPings   = 0;

          // Store in connected devices map
          if (!connectedDevices[data.groupId]) {
            connectedDevices[data.groupId] = {};
          }
          connectedDevices[data.groupId][device.id] = ws;

          // Update DB
          await dbRun(
            'UPDATE group_devices SET is_online = 1, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
            [device.id]
          );

          ws.send(JSON.stringify({
            type: 'auth_success',
            message: 'Device authenticated.',
            groupId: data.groupId,
            deviceId: device.id,
          }));

          console.log(`[WS] Device authenticated: ${data.deviceToken} (Group: ${data.groupId}, Device ID: ${device.id})`);

          // Flush pending SMS after a short delay
          setTimeout(() => flushPendingSms(data.groupId), 1000);

        } catch (err) {
          console.error('[WS] Auth error:', err.message);
          ws.send(JSON.stringify({ type: 'error', message: 'Authentication failed.' }));
        }
        return;
      }

      // ── Reject unauthenticated messages ────────
      if (!ws._authenticated) {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated. Send auth message first.' }));
        return;
      }

      // ── Ping from client ───────────────────────
      if (data.type === 'ping') {
        ws._missedPings = 0;
        ws.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      // ── SMS status update from device ──────────
      if (data.type === 'sms_status') {
        const rawId = data.smsId;
        const status = data.status;

        if (rawId === undefined || rawId === null || !status) {
          ws.send(JSON.stringify({ type: 'error', message: 'smsId and status are required.' }));
          return;
        }

        const smsId = parseInt(rawId, 10);
        if (isNaN(smsId) || smsId <= 0) {
          ws.send(JSON.stringify({ type: 'error', message: 'smsId must be a positive integer.' }));
          return;
        }

        const allowedStatuses = ['sent', 'failed', 'delivered'];
        if (!allowedStatuses.includes(status)) {
          ws.send(JSON.stringify({ type: 'error', message: `Invalid status. Use: ${allowedStatuses.join(', ')}` }));
          return;
        }

        try {
          const result = await dbRun(
            'UPDATE sms_logs SET status = ? WHERE id = ?',
            [status, smsId]
          );

          if (result.changes === 0) {
            ws.send(JSON.stringify({ type: 'error', message: `SMS log ID ${smsId} not found.` }));
          } else {
            console.log(`[WS] SMS #${smsId} status: ${status} (Device: ${ws._deviceId})`);
            ws.send(JSON.stringify({ type: 'status_updated', smsId, status }));
          }
        } catch (err) {
          console.error('[WS] Status update error:', err.message);
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to update SMS status.' }));
        }
        return;
      }

      // ── Unknown message type ───────────────────
      ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: "${data.type}"` }));
    });

    // ── Connection closed ──────────────────────
    ws.on('close', async (code, reason) => {
      clearTimeout(authTimeout);
      console.log(`[WS] Connection closed from ${clientIP} (code: ${code})`);

      if (ws._authenticated && ws._groupId && ws._deviceId) {
        // Remove from connected devices map
        if (connectedDevices[ws._groupId]) {
          delete connectedDevices[ws._groupId][ws._deviceId];
          if (Object.keys(connectedDevices[ws._groupId]).length === 0) {
            delete connectedDevices[ws._groupId];
          }
        }
        await markDeviceOffline(ws._deviceId);
      }
    });

    // ── Socket error ───────────────────────────
    ws.on('error', (err) => {
      console.error(`[WS] Socket error from ${clientIP}:`, err.message);
    });
  });

  return wss;
}

// ─────────────────────────────────────────────
// Exported functions for use in routes
// ─────────────────────────────────────────────
function getGroupDeviceSocket(groupId, deviceId = null) {
  const devices = getGroupDevices(groupId);
  if (devices.length === 0) return null;

  if (deviceId) {
    // Find specific device
    if (connectedDevices[groupId] && connectedDevices[groupId][deviceId]) {
      const ws = connectedDevices[groupId][deviceId];
      return ws.readyState === 1 ? ws : null;
    }
    return null;
  }

  // Return primary or first available
  return getPrimaryDevice(groupId);
}

module.exports = {
  setupWebSocket,
  getGroupDeviceSocket,
  getGroupDevices,
  getPrimaryDevice,
  getOnlineDevicesForGroup,
};
