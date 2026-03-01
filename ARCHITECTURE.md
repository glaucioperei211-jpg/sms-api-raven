# SMS Gateway v2.0 - Architecture Diagrams

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     SMS Gateway System v2.0                      │
│                    Multi-Group Device Support                    │
└─────────────────────────────────────────────────────────────────┘

                              Internet
                                 │
                    ┌────────────┴────────────┐
                    │                         │
              Web Browsers              Android Devices
                    │                         │
                    ↓                         ↓
            ┌───────────────┐        ┌──────────────┐
            │  HTTP Server  │        │  WebSocket   │
            │  (Express)    │←───────│   Server     │
            └───────┬───────┘        └──────┬───────┘
                    │                       │
                    └───────────┬───────────┘
                                ↓
                        ┌───────────────┐
                        │ SQLite Database│
                        │  - groups      │
                        │  - group_devices│
                        │  - sms_logs    │
                        └───────────────┘
```

---

## Request Flow - Device Registration

```
┌─────────┐         ┌─────────┐         ┌──────────┐         ┌────────┐
│  User   │         │Dashboard│         │API Server│         │Database│
└────┬────┘         └────┬────┘         └────┬─────┘         └───┬────┘
     │                   │                    │                   │
     │  Login            │                    │                   │
     ├──────────────────>│                    │                   │
     │                   │  POST /login       │                   │
     │                   ├───────────────────>│                   │
     │                   │                    │  Verify Password  │
     │                   │                    ├──────────────────>│
     │                   │                    │<──────────────────┤
     │                   │<───────────────────┤                   │
     │  JWT Token        │                    │                   │
     │<──────────────────┤                    │                   │
     │                   │                    │                   │
     │  Navigate to      │                    │                   │
     │  /devices.html    │                    │                   │
     ├──────────────────>│                    │                   │
     │                   │                    │                   │
     │  Fill Form        │                    │                   │
     │  - Token          │                    │                   │
     │  - Name           │                    │                   │
     │  - Model          │                    │                   │
     │                   │                    │                   │
     │  Submit           │                    │                   │
     ├──────────────────>│                    │                   │
     │                   │POST /api/          │                   │
     │                   │register-device     │                   │
     │                   ├───────────────────>│                   │
     │                   │ + JWT Token        │  INSERT INTO      │
     │                   │                    │  group_devices    │
     │                   │                    ├──────────────────>│
     │                   │                    │<──────────────────┤
     │                   │<───────────────────┤                   │
     │  Success          │                    │                   │
     │<──────────────────┤                    │                   │
     │                   │                    │                   │
```

---

## Request Flow - SMS Sending

```
┌─────────┐    ┌─────────┐    ┌──────┐    ┌─────────┐    ┌─────────┐
│External │    │API Server│    │Database│   │WebSocket│    │ Android │
│  App    │    │          │    │        │   │ Server  │    │ Device  │
└────┬────┘    └────┬─────┘    └───┬────┘   └────┬────┘    └────┬────┘
     │              │               │             │              │
     │POST /api/    │               │             │              │
     │send-sms      │               │             │              │
     │+ API Key     │               │             │              │
     ├─────────────>│               │             │              │
     │              │ Validate Key  │             │              │
     │              ├──────────────>│             │              │
     │              │<──────────────┤             │              │
     │              │ Get Group     │             │              │
     │              │               │             │              │
     │              │ INSERT SMS    │             │              │
     │              │ (pending)     │             │              │
     │              ├──────────────>│             │              │
     │              │<──────────────┤             │              │
     │              │ SMS ID: 42    │             │              │
     │              │               │             │              │
     │              │ Get Group     │             │              │
     │              │ Device        │             │              │
     │              ├───────────────┼────────────>│              │
     │              │               │             │ Find Device  │
     │              │               │             │ for Group    │
     │              │               │             │              │
     │              │               │             │ send_sms     │
     │              │               │             │ {id:42}      │
     │              │               │             ├─────────────>│
     │              │               │             │              │
     │<─────────────┤               │             │              │
     │ 200 OK       │               │             │              │
     │ SMS Queued   │               │             │              │
     │              │               │             │              │
     │              │               │             │              │ Send SMS
     │              │               │             │              │ via Native
     │              │               │             │              │ SMS Manager
     │              │               │             │              │
     │              │               │             │ sms_status   │
     │              │               │             │ {id:42,      │
     │              │               │             │ status:sent} │
     │              │               │             │<─────────────┤
     │              │               │             │              │
     │              │ UPDATE SMS    │             │              │
     │              │ status=sent   │             │              │
     │              │<──────────────┼─────────────┤              │
     │              ├──────────────>│             │              │
     │              │               │             │              │
```

---

## Device Connection Flow

```
┌─────────────┐                                    ┌──────────────┐
│   Android   │                                    │  WebSocket   │
│   Device    │                                    │   Server     │
└──────┬──────┘                                    └──────┬───────┘
       │                                                  │
       │  1. Connect to ws://server:3000/ws              │
       ├────────────────────────────────────────────────>│
       │                                                  │
       │  2. Send Auth (within 15 seconds)               │
       │  {                                               │
       │    "type": "auth",                               │
       │    "deviceToken": "token-123",                   │
       │    "groupId": 1,                                 │
       │    "isPrimary": true                             │
       │  }                                               │
       ├────────────────────────────────────────────────>│
       │                                                  │
       │                                         Validate │
       │                                         Token &  │
       │                                         Group    │
       │                                                  │
       │  3. Receive Success                              │
       │  {                                               │
       │    "type": "auth_success",                       │
       │    "groupId": 1,                                 │
       │    "deviceId": 3                                 │
       │  }                                               │
       │<────────────────────────────────────────────────┤
       │                                                  │
       │                                         Mark     │
       │                                         Online   │
       │                                         in DB    │
       │                                                  │
       │  4. Receive Pending SMS                          │
       │  {                                               │
       │    "type": "send_sms",                           │
       │    "smsId": 42,                                  │
       │    "to": "+1234567890",                          │
       │    "message": "[Group]\nHello"                   │
       │  }                                               │
       │<────────────────────────────────────────────────┤
       │                                                  │
       │  Send Native SMS                                 │
       │                                                  │
       │  5. Send Status Update                           │
       │  {                                               │
       │    "type": "sms_status",                         │
       │    "smsId": 42,                                  │
       │    "status": "sent"                              │
       │  }                                               │
       ├────────────────────────────────────────────────>│
       │                                                  │
       │                                         Update   │
       │                                         DB       │
       │                                                  │
       │  6. Ping/Pong (every 30 seconds)                 │
       │<───────────────────────────────────────────────>│
       │                                                  │
```

---

## Multi-Device Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      WebSocket Server                             │
│                                                                   │
│  connectedDevices Map                                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                                                               │ │
│  │  Group 1: {                                                   │ │
│  │    deviceId_1: WebSocket (Primary, Online)                   │ │
│  │    deviceId_2: WebSocket (Backup, Online)                    │ │
│  │  }                                                            │ │
│  │                                                               │ │
│  │  Group 2: {                                                   │ │
│  │    deviceId_3: WebSocket (Primary, Online)                   │ │
│  │  }                                                            │ │
│  │                                                               │ │
│  │  Group 3: {                                                   │ │
│  │    deviceId_4: WebSocket (Primary, Offline)                  │ │
│  │    deviceId_5: WebSocket (Backup, Online) ← Receives SMS     │ │
│  │  }                                                            │ │
│  │                                                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

                              ↓

When SMS arrives for Group 1:
1. Check Group 1 devices in map
2. Find Primary device (deviceId_1)
3. If Primary is online → Send to Primary
4. If Primary is offline → Send to first available backup
5. If no device online → Queue in database
```

---

## Device Selection Algorithm

```
function getGroupDeviceSocket(groupId):
    devices = connectedDevices[groupId]
    
    if devices is empty:
        return null  // Queue SMS in database
    
    // Try to find primary device
    for device in devices:
        if device.isPrimary AND device.isOnline:
            return device.socket
    
    // Fallback to first available device
    for device in devices:
        if device.isOnline:
            return device.socket
    
    return null  // All devices offline
```

---

## Database Schema Relationships

```
┌─────────────────┐
│     groups      │
│─────────────────│
│ id (PK)         │
│ group_name      │
│ email           │
│ password_hash   │
│ api_key         │
│ sms_limit       │
│ is_active       │
│ created_at      │
└────────┬────────┘
         │
         │ 1:N relationship
         │
         ├──────────────────┬─────────────────────┐
         ↓                  ↓                     ↓
┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐
│ group_devices   │  │   sms_logs      │  │ Admin Panel  │
│─────────────────│  │─────────────────│  │──────────────│
│ id (PK)         │  │ id (PK)         │  │ Views All    │
│ group_id (FK)   │  │ group_id (FK)   │  │ Groups       │
│ device_token    │  │ receiver        │  │              │
│ device_name     │  │ message         │  │ Can Edit     │
│ device_model    │  │ status          │  │ Limits &     │
│ is_online       │  │ created_at      │  │ Status       │
│ is_active       │  └─────────────────┘  └──────────────┘
│ is_primary      │
│ last_seen       │
│ registered_at   │
└─────────────────┘
```

---

## User Roles and Permissions

```
┌──────────────────────────────────────────────────────────────────┐
│                         Admin User                                │
│                                                                   │
│  Login: /admin-login.html                                         │
│  Access: Hardcoded username/password                              │
│                                                                   │
│  Permissions:                                                     │
│  ✓ View all groups                                                │
│  ✓ Edit SMS limits                                                │
│  ✓ Activate/deactivate groups                                     │
│  ✓ Delete groups                                                  │
│  ✓ View system statistics                                         │
│  ✗ Cannot see device tokens                                       │
│  ✗ Cannot send SMS on behalf of groups                            │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                         Group User                                │
│                                                                   │
│  Login: /login.html                                               │
│  Access: Email + password                                         │
│                                                                   │
│  Permissions:                                                     │
│  ✓ View own dashboard                                             │
│  ✓ Send SMS via API or dashboard                                  │
│  ✓ Register devices                                                │
│  ✓ Manage own devices (CRUD)                                      │
│  ✓ View SMS logs                                                  │
│  ✓ View API key                                                   │
│  ✗ Cannot see other groups' data                                  │
│  ✗ Cannot modify SMS limit                                        │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      Android Device                               │
│                                                                   │
│  Auth: WebSocket with device token + group ID                     │
│  Access: Must be registered first                                 │
│                                                                   │
│  Permissions:                                                     │
│  ✓ Receive SMS commands                                           │
│  ✓ Send status updates                                            │
│  ✓ Keepalive pings                                                │
│  ✗ Cannot access HTTP endpoints                                   │
│  ✗ Cannot see other groups' SMS                                   │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Security Model

```
┌──────────────────────────────────────────────────────────────────┐
│                     Authentication Layers                         │
└──────────────────────────────────────────────────────────────────┘

Layer 1: HTTP Endpoints
────────────────────────
┌─────────────┐
│ Public      │  /register, /login, /admin-login
│ (No Auth)   │  Anyone can access
└─────────────┘

┌─────────────┐
│ JWT Auth    │  /api/*, /dashboard, /devices
│ (Bearer)    │  Requires valid JWT token
└─────────────┘

┌─────────────┐
│ API Key     │  /api/send-sms
│ (Bearer)    │  Requires valid API key
└─────────────┘


Layer 2: WebSocket Connections
───────────────────────────────
┌──────────────────────────────────────┐
│  1. Connect (no auth)                │
│  2. Send auth within 15 seconds      │
│  3. Validate:                        │
│     - Device token exists            │
│     - Group ID is valid              │
│     - Device belongs to group        │
│     - Device is active               │
│  4. Store authenticated connection   │
└──────────────────────────────────────┘


Layer 3: Data Isolation
───────────────────────
┌──────────────────────────────────────┐
│  Database Queries Always Include:    │
│  - WHERE group_id = ?                │
│  - Prevents cross-group access       │
│  - Foreign key constraints           │
│  - CASCADE on delete                 │
└──────────────────────────────────────┘
```

---

## Deployment Architecture

```
Production Setup:

                    Internet
                       │
                       ↓
                ┌──────────────┐
                │  Reverse     │
                │  Proxy       │
                │  (nginx)     │
                │              │
                │  SSL/TLS     │
                │  WSS Support │
                └──────┬───────┘
                       │
                       ↓
           ┌────────────────────────┐
           │  Node.js Application   │
           │  - PM2 Process Manager │
           │  - Port 3000           │
           └────────┬───────────────┘
                    │
                    ↓
            ┌───────────────┐
            │ SQLite DB     │
            │ (with backups)│
            └───────────────┘


Recommended Stack:
- OS: Ubuntu 20.04+ / Debian / Windows Server
- Node.js: v16+ LTS
- Process Manager: PM2
- Reverse Proxy: nginx with SSL
- Backup: Daily database backups
- Monitoring: PM2 logs, error tracking
```

---

## File Structure

```
sms-api-dashboard/
├── server.js                    # Main entry point
├── server.config.js             # Configuration
├── database.js                  # Database layer
├── websocket.js                 # WebSocket server (NEW v2.0)
├── package.json                 # Dependencies
│
├── middleware/
│   ├── authMiddleware.js        # JWT verification
│   └── adminMiddleware.js       # Admin auth
│
├── routes/
│   ├── authRoutes.js            # /register, /login
│   ├── apiRoutes.js             # /api/* (UPDATED v2.0)
│   └── adminRoutes.js           # /admin/*
│
├── public/
│   ├── login.html               # User login
│   ├── register.html            # User registration
│   ├── dashboard.html           # User dashboard (UPDATED v2.0)
│   ├── devices.html             # Device management (NEW v2.0)
│   ├── admin-login.html         # Admin login
│   └── admin-dashboard.html     # Admin panel
│
├── docs/
│   ├── README.md                # Main documentation (NEW v2.0)
│   ├── QUICKSTART.md            # Quick start guide (NEW v2.0)
│   ├── DEVICE_REGISTRATION_GUIDE.md  # Device guide (NEW v2.0)
│   ├── ANDROID_INTEGRATION_GUIDE.md  # Android guide (NEW v2.0)
│   ├── CHANGELOG.md             # Version history (NEW v2.0)
│   ├── IMPROVEMENTS_SUMMARY.md  # Summary (NEW v2.0)
│   ├── ARCHITECTURE.md          # This file (NEW v2.0)
│   └── ANDROID_FIX_PROMPT.md    # Flutter app docs
│
├── database.db                  # SQLite database
└── websocket.js.backup          # Backup of old version
```

---

**Architecture Version:** 2.0  
**Last Updated:** March 1, 2026  
**Status:** Production Ready ✅
