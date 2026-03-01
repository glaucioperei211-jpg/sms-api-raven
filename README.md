# SMS API Dashboard - Version 2.0

**A complete SMS Gateway Backend with per-group device management**

---

## 🚀 What's New in v2.0

### Major Improvements

#### ✅ Per-Group Device Registration
- **Before:** All groups shared one device
- **After:** Each group registers their own Android device(s)
- **Benefit:** True multi-tenant support, better isolation and reliability

#### ✅ Multiple Devices Per Group
- Register multiple devices as primary/backup
- Automatic failover to available devices
- Device health monitoring and status tracking
- Independent device lifecycle management

#### ✅ Device Management Interface
- Web-based device registration UI at `/devices.html`
- Register, activate, deactivate, and delete devices
- Set primary device for SMS routing priority
- Real-time online/offline status monitoring

#### ✅ Enhanced Security
- Device tokens must be pre-registered before use
- Per-group device isolation
- Deactivate compromised devices without deletion
- Better authentication and validation

---

## 📋 Features

### Core Features
- ✅ Multi-group SMS Gateway with isolated devices
- ✅ RESTful API with JWT authentication
- ✅ WebSocket communication with Android devices
- ✅ Per-group device registration and management
- ✅ SMS queueing when devices are offline
- ✅ Automatic SMS flushing on device reconnection
- ✅ Rate limiting (5 SMS/minute per group)
- ✅ SMS status tracking (pending → sent → delivered)
- ✅ Admin dashboard for system management
- ✅ Group dashboard with analytics
- ✅ Device management UI with real-time status

### Technical Features
- ✅ SQLite database with WAL mode
- ✅ WebSocket server with ping/pong keepalive
- ✅ JWT token authentication (8-hour expiry)
- ✅ bcrypt password hashing
- ✅ API key per group
- ✅ Rate limiting per group
- ✅ Concurrent multi-device support
- ✅ Automatic device failover

---

## 🏗️ Architecture

```
┌─────────────────────┐
│   Web Dashboard     │
│  (HTML/CSS/JS)      │
└──────────┬──────────┘
           │ HTTP/JWT
           ↓
┌─────────────────────┐
│   Express Server    │
│  - Auth Routes      │
│  - API Routes       │
│  - Admin Routes     │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ↓             ↓
┌─────────┐  ┌──────────┐
│ SQLite  │  │ WebSocket│
│   DB    │  │  Server  │
└─────────┘  └────┬─────┘
                  ↓
          ┌──────────────┐
          │ Android Apps │
          │ (Per Group)  │
          └──────────────┘
```

---

## 🗄️ Database Schema

### `groups` Table
Stores registered user groups (organizations/teams)
```sql
- id: Primary key
- group_name: Organization name
- email: Login email (unique)
- password_hash: bcrypt hashed password
- api_key: Unique API key for programmatic access
- sms_limit: Maximum SMS allowed
- is_active: Active status (admin can disable)
- created_at: Registration timestamp
```

### `group_devices` Table (NEW in v2.0)
Stores Android devices per group
```sql
- id: Primary key
- group_id: Foreign key to groups
- device_token: Unique device identifier
- device_name: Friendly name (e.g., "My Phone")
- device_model: Device model info
- is_online: Real-time online status
- is_active: Active status (can be deactivated)
- is_primary: Primary device for SMS routing
- last_seen: Last connection timestamp
- registered_at: Device registration timestamp
```

### `sms_logs` Table
SMS transaction logs
```sql
- id: Primary key
- group_id: Foreign key to groups
- receiver: Phone number
- message: SMS content
- status: pending | sent | failed | delivered
- created_at: Timestamp
```

---

## 📡 API Endpoints

### Authentication APIs
```
POST /register         - Register new group
POST /login           - Login and get JWT token
```

### SMS APIs
```
POST   /api/send-sms           - Send SMS (API key auth)
POST   /api/dashboard-send     - Send SMS from dashboard (JWT auth)
GET    /api/dashboard-data     - Get dashboard data (JWT auth)
```

### Device Management APIs (NEW)
```
POST   /api/register-device    - Register new device (JWT auth)
GET    /api/devices            - List all group devices (JWT auth)
PUT    /api/devices/:id        - Update device settings (JWT auth)
DELETE /api/devices/:id        - Delete device (JWT auth)
```

### Admin APIs
```
POST   /admin/login            - Admin login
GET    /admin/api/stats        - System statistics
GET    /admin/api/groups       - List all groups
PUT    /admin/api/groups/:id   - Update group (toggle active, change limit)
DELETE /admin/api/groups/:id   - Delete group
```

---

## 🔌 WebSocket Protocol

### Connection
```
ws://YOUR_SERVER:PORT/ws
```

### Authentication (Updated in v2.0)
**Client → Server:**
```json
{
  "type": "auth",
  "deviceToken": "unique-device-token",
  "groupId": 1,
  "isPrimary": true
}
```

**Server → Client:**
```json
{
  "type": "auth_success",
  "message": "Device authenticated.",
  "groupId": 1,
  "deviceId": 3
}
```

### SMS Command
**Server → Client:**
```json
{
  "type": "send_sms",
  "smsId": 42,
  "to": "+1234567890",
  "message": "[GroupName]\nHello World"
}
```

### Status Update
**Client → Server:**
```json
{
  "type": "sms_status",
  "smsId": 42,
  "status": "sent"
}
```

Allowed statuses: `sent`, `failed`, `delivered`

---

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ and npm
- SQLite3
- Android device with SMS permissions

### Installation

1. **Clone and Install**
```bash
git clone <repository-url>
cd sms-api-dashboard
npm install
```

2. **Configure Server**
Edit `server.config.js`:
```javascript
module.exports = {
  PORT: 3000,
  JWT_SECRET: 'change-this-in-production',
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD: 'admin1234',
  SERVER_HOST: '192.168.1.54',  // Your server IP
  RATE_LIMIT_PER_MINUTE: 5,
};
```

3. **Start Server**
```bash
npm start
```

Server will start at `http://localhost:3000`

### Usage Flow

#### For Groups (Users)

1. **Register Account**
   - Go to `http://YOUR_SERVER:3000/register.html`
   - Create account with email and password
   - Save API key from dashboard

2. **Register Device**
   - Login and go to "Manage Devices"
   - Click "Generate Random Token" or create UUID
   - Enter device name and model
   - Mark as primary device
   - Click "Register Device"
   - Note device token and group ID

3. **Configure Android App**
   - Install SMS Gateway Android app
   - Enter server URL: `ws://YOUR_SERVER:3000/ws`
   - Enter device token from step 2
   - Enter group ID
   - Connect

4. **Send SMS**
   - Via API:
     ```bash
     curl -X POST http://YOUR_SERVER:3000/api/send-sms \
       -H "Authorization: Bearer YOUR_API_KEY" \
       -H "Content-Type: application/json" \
       -d '{"to": "+1234567890", "message": "Hello!"}'
     ```
   - Via Dashboard: Login and use send form

#### For Administrators

1. **Login to Admin Panel**
   - Go to `http://YOUR_SERVER:3000/admin-login.html`
   - Default: username `admin`, password `admin1234`

2. **Manage Groups**
   - View all registered groups
   - Edit SMS limits
   - Activate/deactivate groups
   - Delete groups

---

## 📱 Android App Integration

See [ANDROID_INTEGRATION_GUIDE.md](ANDROID_INTEGRATION_GUIDE.md) for complete Android app development guide.

**Key Changes for v2.0:**
- Add `groupId` to WebSocket authentication
- Update UI to include group ID field
- Handle new `deviceId` in auth response

---

## 📖 Documentation

- **[DEVICE_REGISTRATION_GUIDE.md](DEVICE_REGISTRATION_GUIDE.md)** - Complete device registration guide
- **[ANDROID_INTEGRATION_GUIDE.md](ANDROID_INTEGRATION_GUIDE.md)** - Android app integration guide
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes
- **[ANDROID_FIX_PROMPT.md](ANDROID_FIX_PROMPT.md)** - Original Flutter app documentation

---

## 🔧 Configuration

### Environment Variables
```bash
PORT=3000
JWT_SECRET=your-jwt-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin1234
ADMIN_JWT_SECRET=admin-jwt-secret
SERVER_HOST=192.168.1.54
```

### Rate Limiting
Default: 5 SMS per minute per group (configurable in `server.config.js`)

### SMS Limits
Default: 200 SMS per group (configurable by admin)

---

## 🎯 Use Cases

1. **Educational Institutions**
   - Each department registers their own devices
   - Send notifications to students independently
   - Separate SMS quotas per department

2. **Small Businesses**
   - Marketing team has their own device
   - Support team has separate device
   - Track SMS usage per team

3. **Development Teams**
   - Test environment with test device
   - Production environment with production device
   - Staging with separate device

---

## 🛡️ Security Best Practices

1. **Change Default Credentials**
   ```javascript
   ADMIN_USERNAME: 'your-admin-username',
   ADMIN_PASSWORD: 'strong-password-here',
   JWT_SECRET: 'long-random-string',
   ```

2. **Use HTTPS in Production**
   - Deploy behind nginx/Apache with SSL
   - Use WSS (WebSocket Secure) instead of WS

3. **Device Token Security**
   - Use UUIDs for device tokens
   - Never commit tokens to version control
   - Rotate tokens periodically

4. **Database Backups**
   - Backup `database.db` regularly
   - Store backups securely
   - Test restoration process

---

## 🐛 Troubleshooting

### Device Won't Connect
1. Check device token is registered in dashboard
2. Verify group ID is correct
3. Check server URL and port
4. Ensure server is running
5. Check firewall/network settings

### SMS Not Sending
1. Verify device is online in dashboard
2. Check SMS permissions on Android
3. Verify phone number format
4. Check rate limits not exceeded
5. Review server logs for errors

### Authentication Failed
1. Ensure device token matches exactly
2. Check group ID is correct
3. Verify device is active (not deactivated)
4. Check authentication timeout (15 seconds)

---

## 📊 Performance

- **Concurrent Connections:** Supports multiple devices per group
- **SMS Queue:** Unlimited pending SMS (stored in database)
- **WebSocket Ping:** Every 30 seconds
- **Auth Timeout:** 15 seconds
- **Database:** SQLite with WAL mode for better concurrency

---

## 🔜 Roadmap

- [ ] Device usage statistics and analytics
- [ ] SMS scheduling and delayed sending
- [ ] Webhook notifications for SMS events
- [ ] SMS templates and variables
- [ ] Bulk SMS import via CSV
- [ ] Device groups and load balancing
- [ ] Delivery reports and read receipts
- [ ] Multi-language support
- [ ] Two-factor authentication

---

## 📄 License

MIT License

Copyright (c) 2026 Capstone Project Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 👥 Contributors

**Capstone Project Team**
- Backend Development: Node.js/Express/WebSocket
- Database Design: SQLite
- Frontend: HTML/CSS/JavaScript
- Version: 2.0
- Release Date: March 1, 2026

---

## 🤝 Support

For issues, questions, or contributions:
1. Check documentation files
2. Review troubleshooting section
3. Check server logs
4. Test with provided examples

---

## 📝 Version History

### v2.0 (March 1, 2026)
- Per-group device registration
- Multiple devices per group
- Device management UI
- Enhanced WebSocket protocol
- Better security and isolation

### v1.0 (February 2026)
- Initial release
- Single device shared system
- Basic SMS Gateway functionality
- Admin dashboard
- Group management

---

**Built with ❤️ for the Capstone Project**
