# SMS Gateway - Changelog

## Version 2.0 - Major Update (March 1, 2026)

### 🚀 Breaking Changes

#### Per-Group Device Registration
- **OLD:** Single device shared across all groups
- **NEW:** Each group registers their own device(s)
- **Impact:** All groups must register their devices to continue using the system

#### WebSocket Authentication Updated
- **OLD:** `{ type: "auth", deviceToken: "token" }`
- **NEW:** `{ type: "auth", deviceToken: "token", groupId: 1 }`
- **Impact:** Android apps must update authentication to include groupId

---

### ✨ New Features

#### 1. Multi-Device Per Group
- Each group can register multiple Android devices
- Primary/backup device designation
- Automatic failover to available devices
- Independent device lifecycle management

#### 2. Device Management API
- `POST /api/register-device` - Register new device
- `GET /api/devices` - List all group devices
- `PUT /api/devices/:deviceId` - Update device settings
- `DELETE /api/devices/:deviceId` - Remove device

#### 3. Enhanced Device Tracking
- Device name and model information
- Online/offline status per device
- Last seen timestamp
- Active/inactive status
- Primary device designation

#### 4. Improved SMS Routing
- SMS routed to group's primary device
- Automatic fallback to other online devices
- Per-group SMS queueing
- Better offline handling

#### 5. Device Security
- Devices must be registered before connecting
- Inactive devices automatically rejected
- Token validation per group
- Deactivation support for lost devices

---

### 🔧 Technical Changes

#### Database Schema
**New Table:** `group_devices`
```sql
CREATE TABLE group_devices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id        INTEGER NOT NULL,
  device_token    TEXT UNIQUE NOT NULL,
  device_name     TEXT,
  device_model    TEXT,
  is_online       INTEGER DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  is_primary      INTEGER DEFAULT 0,
  last_seen       DATETIME,
  registered_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
)
```

**Legacy Table:** `device` (kept for backward compatibility)

#### WebSocket Architecture
- **OLD:** Single global `androidDeviceSocket` variable
- **NEW:** `connectedDevices` map: `{ groupId: { deviceId: socket } }`
- Supports multiple concurrent connections per group
- Better connection lifecycle management

#### API Routes Updated
- `apiRoutes.js`: Updated to use `getGroupDeviceSocket(groupId)`
- Device endpoints added for CRUD operations
- Dashboard data now includes devices array

---

### 📊 API Response Changes

#### `/api/dashboard-data` Response
**Before:**
```json
{
  "group": { ... },
  "device": { "is_online": 1, "last_seen": "..." },
  "logs": [ ... ]
}
```

**After:**
```json
{
  "group": { ... },
  "devices": [
    {
      "id": 1,
      "device_name": "My Phone",
      "device_model": "Samsung Galaxy",
      "device_token": "...",
      "is_online": 1,
      "is_active": 1,
      "is_primary": 1,
      "last_seen": "..."
    }
  ],
  "logs": [ ... ]
}
```

---

### 🐛 Bug Fixes
- Fixed device status not updating correctly
- Improved WebSocket reconnection handling
- Better error messages for device issues
- Fixed concurrent connection race conditions

---

### 📝 Documentation
- New: `DEVICE_REGISTRATION_GUIDE.md` - Complete device registration guide
- Updated: WebSocket authentication protocol
- Updated: API endpoint documentation

---

### ⚠️ Migration Guide

#### For System Administrators
1. Backup your database before updating
2. Update server files (database.js, websocket.js, apiRoutes.js)
3. Restart server to create new `group_devices` table
4. Old `device` table is kept for compatibility

#### For Group Users
1. Register your Android device via API or dashboard
2. Note your device token and group ID
3. Update your Android app configuration
4. Test connection via WebSocket

#### For Android App Developers
1. Update auth message to include `groupId`:
   ```json
   {
     "type": "auth",
     "deviceToken": "your-token",
     "groupId": 1,
     "isPrimary": true
   }
   ```
2. Handle new auth response format
3. Update UI to show group ID input field

---

### 🎯 Performance Improvements
- Reduced database queries for device lookup
- Better memory management for WebSocket connections
- Improved connection cleanup on disconnect
- Faster SMS routing with in-memory device map

---

### 🔐 Security Enhancements
- Device tokens must be pre-registered
- Group isolation for device access
- Inactive device rejection
- Better authentication timeout handling

---

### 🚦 Rate Limiting (Unchanged)
- 5 SMS per minute per group
- Sliding window implementation
- Applies to both API and dashboard sends

---

### 📱 WebSocket Protocol Updates

#### New Authentication Flow
1. Connect to `ws://server:port/ws`
2. Send auth within 15 seconds with `groupId`
3. Receive `auth_success` with `deviceId`
4. Begin receiving SMS commands
5. Send status updates with `smsId`

#### Ping/Pong (Unchanged)
- Server pings every 30 seconds
- 2 missed pings = disconnection
- Client can send JSON ping for keepalive

---

### 🎨 Future Enhancements (Planned)
- [ ] Device statistics and usage metrics
- [ ] SMS delivery reports per device
- [ ] Device health monitoring
- [ ] Automatic device rotation
- [ ] Load balancing across devices
- [ ] Device groups and tagging
- [ ] SMS scheduling
- [ ] Webhook notifications
- [ ] API usage analytics

---

### 📋 Known Issues
- Dashboard UI needs update to show device management interface
- No bulk device import yet
- Device token uniqueness is global (may change to per-group)

---

### 🤝 Contributing
This is a capstone project. Contributions welcome after March 2026.

---

### 📄 License
MIT License - See LICENSE file

---

### 👥 Credits
- **Developer:** Capstone Project Team
- **Version:** 2.0
- **Release Date:** March 1, 2026

---

## Version 1.0 (February 2026)

### Initial Release
- Basic SMS Gateway functionality
- Single device support
- Group registration and authentication
- WebSocket communication
- Admin dashboard
- Rate limiting
- SMS logging and tracking
