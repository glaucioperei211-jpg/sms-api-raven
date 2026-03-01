# SMS API Dashboard - Device Registration Guide

## Overview

The SMS API Dashboard now supports **per-group device registration**. Each group must register their own Android device(s) to send SMS through their account. Multiple groups can use different devices simultaneously.

---

## Key Improvements

### ✅ Multi-Device Support
- Each group registers their own device(s)
- No single device used across all groups
- Support for multiple devices per group
- Primary device designation for routing priority

### ✅ Device Management
- Register new devices with custom names
- Mark devices as active/inactive
- Set primary device for SMS routing
- View device status (online/offline)
- Delete devices from your account

### ✅ Enhanced Security
- Devices are tied to specific groups
- Device tokens must be registered before use
- Inactive devices are automatically rejected

---

## API Endpoints

### 1. Register a Device

**Endpoint:** `POST /api/register-device`  
**Authentication:** Required (JWT token from login)  
**Description:** Register a new Android device for your group

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "device_token": "unique-device-token-12345",
  "device_name": "My Android Phone",
  "device_model": "Samsung Galaxy S23",
  "is_primary": true
}
```

**Response (201 Created):**
```json
{
  "message": "Device registered successfully.",
  "device_token": "unique-device-token-12345",
  "device_name": "My Android Phone"
}
```

**Notes:**
- `device_token`: A unique identifier for your device (can be UUID or any unique string)
- `device_name`: Optional friendly name for the device
- `device_model`: Optional device model information
- `is_primary`: If true, this device becomes the primary device (unmarks others)

---

### 2. List Your Devices

**Endpoint:** `GET /api/devices`  
**Authentication:** Required (JWT token from login)  
**Description:** Get all devices registered to your group

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response (200 OK):**
```json
{
  "devices": [
    {
      "id": 1,
      "device_token": "unique-device-token-12345",
      "device_name": "My Android Phone",
      "device_model": "Samsung Galaxy S23",
      "is_online": 1,
      "is_active": 1,
      "is_primary": 1,
      "last_seen": "2026-03-01T10:30:00Z",
      "registered_at": "2026-02-28T08:00:00Z"
    },
    {
      "id": 2,
      "device_token": "backup-device-67890",
      "device_name": "Backup Phone",
      "device_model": "Google Pixel 8",
      "is_online": 0,
      "is_active": 1,
      "is_primary": 0,
      "last_seen": "2026-03-01T08:15:00Z",
      "registered_at": "2026-03-01T07:00:00Z"
    }
  ]
}
```

---

### 3. Update Device Settings

**Endpoint:** `PUT /api/devices/:deviceId`  
**Authentication:** Required (JWT token from login)  
**Description:** Update device name, primary status, or active status

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body (all fields optional):**
```json
{
  "device_name": "Updated Device Name",
  "is_primary": true,
  "is_active": false
}
```

**Response (200 OK):**
```json
{
  "message": "Device updated successfully."
}
```

**Notes:**
- Setting `is_primary: true` automatically unmarks all other devices
- Setting `is_active: false` deactivates the device (it can't connect)

---

### 4. Delete a Device

**Endpoint:** `DELETE /api/devices/:deviceId`  
**Authentication:** Required (JWT token from login)  
**Description:** Remove a device from your group

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response (200 OK):**
```json
{
  "message": "Device deleted successfully."
}
```

---

### 5. Send SMS (Updated)

**Endpoint:** `POST /api/send-sms`  
**Authentication:** Required (API Key)  
**Description:** Send SMS via your group's registered device

**Request Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request Body:**
```json
{
  "to": "+1234567890",
  "message": "Hello from SMS Gateway!"
}
```

**Response (200 OK - Device Online):**
```json
{
  "message": "SMS queued successfully.",
  "smsId": 42,
  "receiver": "+1234567890",
  "status": "pending"
}
```

**Response (202 Accepted - Device Offline):**
```json
{
  "message": "Device is currently offline. SMS has been queued and will be sent automatically when the device reconnects.",
  "smsId": 42,
  "receiver": "+1234567890",
  "status": "pending",
  "queued": true
}
```

**Response (403 Forbidden - No Device Registered):**
```json
{
  "error": "No active device registered for this group. Please register a device first."
}
```

---

## WebSocket Authentication (for Android App)

### Connection Flow

1. **Connect to WebSocket**
   ```
   ws://YOUR_SERVER_IP:3000/ws
   ```

2. **Send Authentication Message** (within 15 seconds)
   ```json
   {
     "type": "auth",
     "deviceToken": "unique-device-token-12345",
     "groupId": 1,
     "isPrimary": true
   }
   ```

3. **Receive Authentication Response**
   ```json
   {
     "type": "auth_success",
     "message": "Device authenticated.",
     "groupId": 1,
     "deviceId": 1
   }
   ```

4. **Receive SMS Commands**
   ```json
   {
     "type": "send_sms",
     "smsId": 42,
     "to": "+1234567890",
     "message": "[YourGroup]\nHello from SMS Gateway!"
   }
   ```

5. **Send Status Updates**
   ```json
   {
     "type": "sms_status",
     "smsId": 42,
     "status": "sent"
   }
   ```

**Status values:** `sent`, `failed`, `delivered`

---

## Dashboard Data (Updated)

**Endpoint:** `GET /api/dashboard-data`  
**Authentication:** Required (JWT token from login)  
**Description:** Get dashboard information including devices

**Response:**
```json
{
  "group": {
    "id": 1,
    "group_name": "Test Group",
    "email": "test@example.com",
    "api_key": "group_api_key_here",
    "sms_limit": 200,
    "sms_used": 45,
    "sms_remaining": 155,
    "created_at": "2026-02-15T10:00:00Z"
  },
  "devices": [
    {
      "id": 1,
      "device_name": "My Android Phone",
      "device_model": "Samsung Galaxy S23",
      "device_token": "unique-device-token-12345",
      "is_online": 1,
      "is_active": 1,
      "is_primary": 1,
      "last_seen": "2026-03-01T10:30:00Z"
    }
  ],
  "logs": [
    {
      "id": 45,
      "receiver": "+1234567890",
      "message": "Test message",
      "status": "sent",
      "created_at": "2026-03-01T10:29:00Z"
    }
  ]
}
```

---

## Getting Started (for Groups)

### Step 1: Register Your Account
1. Go to the dashboard registration page
2. Register with your group email and password
3. Save your API key from the dashboard

### Step 2: Register Your Android Device
You can register your device in two ways:

#### Option A: Via Dashboard (when available)
1. Log in to your dashboard
2. Go to the "Devices" section
3. Click "Register New Device"
4. Enter device information
5. Copy the device token for your Android app

#### Option B: Via API
```bash
curl -X POST http://YOUR_SERVER:3000/api/register-device \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_token": "my-unique-device-token",
    "device_name": "My Phone",
    "device_model": "Samsung Galaxy",
    "is_primary": true
  }'
```

### Step 3: Configure Android App
1. Install the SMS Gateway Android app
2. Enter these details:
   - **Server URL:** `ws://YOUR_SERVER_IP:3000/ws`
   - **Device Token:** Your registered device token
   - **Group ID:** Your group ID (found in dashboard)

### Step 4: Start Sending SMS
Use your API key to send SMS:

```bash
curl -X POST http://YOUR_SERVER:3000/api/send-sms \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "message": "Hello from SMS Gateway!"
  }'
```

---

## Device Management Best Practices

### Primary Device
- Mark your most reliable device as primary
- Primary device receives SMS first
- You can change primary device anytime

### Multiple Devices
- Register backup devices for redundancy
- System automatically routes to available devices
- Devices can be online/offline independently

### Device Security
- Use unique, hard-to-guess device tokens
- Deactivate lost/stolen devices immediately
- Delete devices you no longer use

---

## Error Handling

### Common Errors

**Device Not Registered:**
```json
{
  "type": "error",
  "message": "Device not found for this group. Please register first."
}
```

**Device Deactivated:**
```json
{
  "type": "error",
  "message": "This device has been deactivated."
}
```

**Invalid Group ID:**
```json
{
  "type": "error",
  "message": "Invalid group ID."
}
```

**Authentication Timeout:**
```json
{
  "type": "error",
  "message": "Authentication timeout. Send auth message within 15 seconds."
}
```

---

## Migration from Old System

If you were using the old single-device system:

1. Register your device using the new API endpoint
2. Update your Android app to send `groupId` in auth message
3. Old device table is kept for backward compatibility but deprecated
4. All new features require the new `group_devices` table

---

## Additional Features

### Rate Limiting
- Max 5 SMS per minute per group (configurable)
- Prevents API abuse

### SMS Queueing
- SMS automatically queued when device is offline
- Automatically sent when device reconnects
- No manual intervention needed

### Status Tracking
- Track SMS status: pending → sent → delivered
- View complete history in dashboard
- Failed SMS don't count toward limit

---

## Support

For issues or questions:
- Check device registration via `/api/devices` endpoint
- Verify device is online in dashboard
- Check WebSocket logs for connection issues
- Ensure device token matches exactly

---

**Version:** 2.0  
**Last Updated:** March 1, 2026
