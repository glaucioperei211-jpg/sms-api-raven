# Quick Start Guide - SMS Gateway v2.0

## 🚀 5-Minute Setup

### Step 1: Start the Server (1 minute)

```bash
npm start
```

Server will start at: `http://localhost:3000`

### Step 2: Create Admin Account (1 minute)

1. Open browser: `http://localhost:3000/admin-login.html`
2. Login with:
   - Username: `admin`
   - Password: `admin1234`

### Step 3: Create Your Group Account (1 minute)

1. Open: `http://localhost:3000/register.html`
2. Register with:
   - Group Name: `My Group`
   - Email: `test@example.com`
   - Password: `password123`
3. Login at: `http://localhost:3000/login.html`
4. **Save your API Key** from the dashboard

### Step 4: Register Your Device (1 minute)

1. After login, click **"📱 Manage Devices"**
2. Click **"Generate Random Token"**
3. Fill in:
   - Device Name: `My Phone`
   - Device Model: `Samsung Galaxy` (optional)
   - Check: ✅ Set as primary device
4. Click **"Register Device"**
5. **Copy and save:**
   - Device Token
   - Group ID (shown in dashboard)

### Step 5: Test SMS Sending (1 minute)

**Option A: Via Dashboard**
1. Go back to dashboard
2. Use the send form:
   - Phone: `+1234567890`
   - Message: `Test message`
3. Click Send

**Option B: Via API**
```bash
curl -X POST http://localhost:3000/api/send-sms \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "message": "Hello from SMS Gateway!"
  }'
```

---

## 📱 Configure Android App

### Required Information
From Step 4, you should have:
1. **Server URL:** `ws://YOUR_IP:3000/ws`
2. **Device Token:** `device-1709280000-abc123`
3. **Group ID:** `1`

### Android App Settings
```
Server URL:     ws://192.168.1.54:3000/ws
Device Token:   device-1709280000-abc123
Group ID:       1
Primary Device: ✅ Yes
```

### Authentication Message (Android sends this)
```json
{
  "type": "auth",
  "deviceToken": "device-1709280000-abc123",
  "groupId": 1,
  "isPrimary": true
}
```

---

## 🎯 Quick Test Checklist

- [ ] Server running at http://localhost:3000
- [ ] Admin login works
- [ ] Group registration works
- [ ] Group login works
- [ ] Device registered successfully
- [ ] API key copied
- [ ] Test SMS sent (queued if device offline)
- [ ] Dashboard shows device status
- [ ] SMS logs visible in dashboard

---

## 🔧 Troubleshooting Quick Fixes

### Server won't start
```bash
# Check if port 3000 is in use
netstat -ano | findstr :3000

# Kill process if needed
taskkill /PID <process_id> /F

# Restart
npm start
```

### Can't access from Android
1. Get your PC's local IP:
   ```bash
   ipconfig
   # Look for "IPv4 Address" e.g., 192.168.1.54
   ```
2. Update `server.config.js`:
   ```javascript
   SERVER_HOST: '192.168.1.54',
   ```
3. Restart server
4. Use: `ws://192.168.1.54:3000/ws` in Android app

### Device shows offline
1. Check device is registered in dashboard
2. Verify WebSocket URL is correct
3. Ensure device token matches exactly
4. Check Android app is connected
5. Review server logs for connection attempts

### SMS not sending
- Device must be online to send SMS
- If device is offline, SMS will queue
- SMS auto-sends when device reconnects
- Check rate limit (5 SMS/min per group)

---

## 📚 Next Steps

1. **Secure Your Server**
   - Change admin password in `server.config.js`
   - Update JWT_SECRET
   - Enable HTTPS for production

2. **Add More Devices**
   - Go to Manage Devices
   - Register backup devices
   - Set one as primary

3. **Integrate with Your App**
   - Use API key for programmatic access
   - See [DEVICE_REGISTRATION_GUIDE.md](DEVICE_REGISTRATION_GUIDE.md)
   - Check [ANDROID_INTEGRATION_GUIDE.md](ANDROID_INTEGRATION_GUIDE.md)

4. **Monitor Usage**
   - Check SMS logs in dashboard
   - Monitor device status
   - Review rate limits

---

## 🎉 You're All Set!

Your SMS Gateway is now ready to use. Each group can register their own devices and send SMS independently.

### Key Features Available Now:
- ✅ Multi-group support
- ✅ Per-group device registration
- ✅ Device management UI
- ✅ SMS queueing
- ✅ Real-time device status
- ✅ Rate limiting
- ✅ Admin dashboard

### Need Help?
- Check [README.md](README.md) for full documentation
- Review [CHANGELOG.md](CHANGELOG.md) for what's new
- See troubleshooting section above

---

**Happy SMS Sending! 📱💬**
