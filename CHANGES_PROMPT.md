# SMS Gateway v2.0 - What Changed

## Core Change
**Before:** All groups shared one device  
**After:** Each group registers their own device(s)

---

## Breaking Changes

### Android App Must Update:
```json
// Add groupId to WebSocket auth
{
  "type": "auth",
  "deviceToken": "your-token",
  "groupId": 1,           // NEW - Required
  "isPrimary": true       // NEW - Optional
}
```

### Users Must:
1. Register device at `/devices.html`
2. Update Android app with Group ID
3. Reconnect device

---

## New Features

1. **Device Management UI** - `/devices.html`
   - Register/delete devices
   - Set primary device
   - View online/offline status

2. **Multi-Device Support**
   - Register multiple devices per group
   - Automatic failover to backup

3. **Device Isolation**
   - Each group's devices are completely separate
   - SMS only routes to your group's devices

---

## Key Benefits

- **Complete isolation** - Your devices, your SMS
- **Better reliability** - Backup devices available
- **Self-service** - Manage your own devices
- **More secure** - Devices must be pre-registered

---

## Migration (5 minutes)

**For Users:**
1. Login to dashboard
2. Go to "Manage Devices"
3. Register your Android device
4. Copy device token and group ID
5. Update Android app settings

**For Admins:**
- Pull code, run `npm start`
- Database auto-updates

---

## Documentation

- [QUICKSTART.md](QUICKSTART.md) - Get started fast
- [ANDROID_INTEGRATION_GUIDE.md](ANDROID_INTEGRATION_GUIDE.md) - Update your app
- [README.md](README.md) - Full documentation

---

**Version:** 2.0 | **Status:** Production Ready
