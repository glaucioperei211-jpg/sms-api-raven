# Android App - Connection Fix Guide

## Problem: Phone Shows OFFLINE

Your Android device is not connecting because the app needs to be updated to use the new authentication format.

---

## Quick Fix for Android App

### What Changed
**Old auth (v1.0):**
```json
{
  "type": "auth",
  "deviceToken": "your-token"
}
```

**New auth (v2.0) - ADD groupId:**
```json
{
  "type": "auth",
  "deviceToken": "your-token",
  "groupId": 1,
  "isPrimary": true
}
```

---

## Step-by-Step Fix

### Step 1: Get Your Group ID

1. Login to dashboard: `http://your-server:3000/login.html`
2. Look at the URL or dashboard data
3. Your Group ID is shown in the dashboard (usually `1`, `2`, `3`, etc.)

**OR check the API response:**
```bash
# After login, your group info includes the ID
{
  "group": {
    "id": 1,  // <-- This is your Group ID
    "group_name": "Your Group",
    ...
  }
}
```

### Step 2: Update Android App Auth Code

Find your WebSocket authentication code and update it:

**Before:**
```kotlin
val authMessage = JSONObject().apply {
    put("type", "auth")
    put("deviceToken", deviceToken)
}
webSocket.send(authMessage.toString())
```

**After:**
```kotlin
val authMessage = JSONObject().apply {
    put("type", "auth")
    put("deviceToken", deviceToken)
    put("groupId", 1)           // ADD THIS - Use your actual group ID
    put("isPrimary", true)      // ADD THIS - Optional
}
webSocket.send(authMessage.toString())
```

### Step 3: Register Your Device Token

**IMPORTANT:** Your device token must be registered BEFORE connecting!

1. Go to: `http://your-server:3000/devices.html`
2. Click "Generate Random Token" OR use your own
3. Enter device name (e.g., "My Phone")
4. Check "Set as primary device"
5. Click "Register Device"
6. **Copy the device token** - use this exact token in your Android app

### Step 4: Update Android App Settings

Add a field for Group ID in your app settings:

```kotlin
// In SharedPreferences
val groupId = 1  // Your group ID from dashboard

// Store it
prefs.edit().putInt("group_id", groupId).apply()

// Use it in auth
val groupId = prefs.getInt("group_id", 0)
```

### Step 5: Reconnect

1. Close and restart your Android app
2. It should now connect successfully
3. Check dashboard - device should show as **ONLINE**

---

## Testing Connection

### Check if it worked:

1. **Dashboard shows ONLINE** ✅
2. **Send test SMS from dashboard** ✅
3. **Android app receives SMS command** ✅
4. **SMS status updates to "sent"** ✅

### Still showing OFFLINE?

**Check these:**

1. ✅ Device token registered at `/devices.html`
2. ✅ Device token in app EXACTLY matches registered token
3. ✅ Group ID is correct (usually 1 for first group)
4. ✅ Server URL correct: `ws://your-ip:3000/ws`
5. ✅ Server is running
6. ✅ Network connection working

---

## Common Issues

### Issue: "Device not found for this group"
**Fix:** Register the device token first at `/devices.html`

### Issue: "Invalid group ID"
**Fix:** Use the correct group ID from your dashboard (usually 1, 2, 3...)

### Issue: "Authentication timeout"
**Fix:** Ensure you send auth message within 15 seconds of connecting

### Issue: Device shows OFFLINE immediately
**Fix:** Check server logs for error messages. Device token and group ID must match exactly.

---

## Quick Test Without Updating App

### Option 1: Use Old Device Table (Temporary)

If you want to test without updating the app immediately, you can manually register in the old `device` table:

```sql
-- Connect to database.db
sqlite3 database.db

-- Insert your device token
INSERT INTO device (device_token, is_online) VALUES ('your-token', 0);

-- Exit
.quit
```

**Note:** This is temporary. The old table is deprecated. You should update your app to use the new system.

---

## Full Solution (Recommended)

1. ✅ Fix "Manage Devices" redirect issue (DONE - fixed in devices.html)
2. ✅ Register device at `/devices.html`
3. ✅ Update Android app to send `groupId` in auth
4. ✅ Use registered device token in app
5. ✅ Restart app and verify connection

**Time to fix:** 10-15 minutes

---

## Need More Help?

See complete Android integration guide:
- [ANDROID_INTEGRATION_GUIDE.md](ANDROID_INTEGRATION_GUIDE.md) - Full code examples
- [DEVICE_REGISTRATION_GUIDE.md](DEVICE_REGISTRATION_GUIDE.md) - Device registration details

---

**After fixing:** Device should show **ONLINE** in dashboard! 🟢
