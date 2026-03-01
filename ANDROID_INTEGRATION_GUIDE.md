# Android App Integration Guide - SMS Gateway v2.0

## Overview
This guide helps Android developers update their SMS Gateway app to work with the new per-group device registration system.

---

## Quick Start

### Step 1: Get Your Credentials
1. Log in to the dashboard at `http://YOUR_SERVER:3000/login.html`
2. Navigate to "Manage Devices" 
3. Register a new device:
   - Click "Generate Random Token" or create your own UUID
   - Enter device name (e.g., "My Phone")
   - Enter device model (e.g., "Samsung Galaxy S23")
   - Check "Set as primary device" if this is your main device
   - Click "Register Device"
4. Note down:
   - **Device Token** (e.g., `device-1709280000000-abc123def`)
   - **Group ID** (found in dashboard URL or dashboard data)
   - **Server URL** (e.g., `ws://192.168.1.54:3000/ws`)

---

## Updated WebSocket Authentication

### Old Authentication (v1.0)
```json
{
  "type": "auth",
  "deviceToken": "your-device-token"
}
```

### New Authentication (v2.0) ⭐
```json
{
  "type": "auth",
  "deviceToken": "your-device-token",
  "groupId": 1,
  "isPrimary": true
}
```

### Parameters
- `deviceToken` (string, required): The device token you registered
- `groupId` (integer, required): Your group ID
- `isPrimary` (boolean, optional): Whether this is the primary device (default: false)

---

## Authentication Response

### Success Response
```json
{
  "type": "auth_success",
  "message": "Device authenticated.",
  "groupId": 1,
  "deviceId": 3
}
```

### Error Responses

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

**Timeout (15 seconds):**
```json
{
  "type": "error",
  "message": "Authentication timeout. Send auth message within 15 seconds."
}
```

---

## Complete Android Integration Example

### 1. User Interface Updates

Add these fields to your settings/configuration screen:

```kotlin
// SettingsActivity.kt or similar
class SettingsActivity : AppCompatActivity() {
    private lateinit var etServerUrl: EditText
    private lateinit var etDeviceToken: EditText
    private lateinit var etGroupId: EditText
    private lateinit var switchPrimary: Switch
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)
        
        etServerUrl = findViewById(R.id.etServerUrl)
        etDeviceToken = findViewById(R.id.etDeviceToken)
        etGroupId = findViewById(R.id.etGroupId)
        switchPrimary = findViewById(R.id.switchPrimary)
        
        // Load saved preferences
        loadPreferences()
    }
    
    private fun loadPreferences() {
        val prefs = getSharedPreferences("sms_gateway", MODE_PRIVATE)
        etServerUrl.setText(prefs.getString("server_url", "ws://192.168.1.54:3000/ws"))
        etDeviceToken.setText(prefs.getString("device_token", ""))
        etGroupId.setText(prefs.getInt("group_id", 0).toString())
        switchPrimary.isChecked = prefs.getBoolean("is_primary", false)
    }
    
    private fun savePreferences() {
        val prefs = getSharedPreferences("sms_gateway", MODE_PRIVATE)
        prefs.edit().apply {
            putString("server_url", etServerUrl.text.toString())
            putString("device_token", etDeviceToken.text.toString())
            putInt("group_id", etGroupId.text.toString().toIntOrNull() ?: 0)
            putBoolean("is_primary", switchPrimary.isChecked)
            apply()
        }
    }
}
```

### 2. WebSocket Service Update

```kotlin
class SmsWebSocketService : Service() {
    private var webSocket: WebSocket? = null
    private lateinit var prefs: SharedPreferences
    
    override fun onCreate() {
        super.onCreate()
        prefs = getSharedPreferences("sms_gateway", MODE_PRIVATE)
    }
    
    private fun connectWebSocket() {
        val serverUrl = prefs.getString("server_url", "") ?: return
        val deviceToken = prefs.getString("device_token", "") ?: return
        val groupId = prefs.getInt("group_id", 0)
        val isPrimary = prefs.getBoolean("is_primary", false)
        
        if (serverUrl.isEmpty() || deviceToken.isEmpty() || groupId == 0) {
            Log.e(TAG, "Missing configuration")
            return
        }
        
        val client = OkHttpClient.Builder()
            .pingInterval(25, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
            
        val request = Request.Builder()
            .url(serverUrl)
            .build()
            
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "WebSocket connected")
                
                // Send authentication message
                val authMessage = JSONObject().apply {
                    put("type", "auth")
                    put("deviceToken", deviceToken)
                    put("groupId", groupId)
                    put("isPrimary", isPrimary)
                }
                
                webSocket.send(authMessage.toString())
            }
            
            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }
            
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "WebSocket closed: $reason")
                scheduleReconnect()
            }
            
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket error: ${t.message}")
                scheduleReconnect()
            }
        })
    }
    
    private fun handleMessage(text: String) {
        try {
            val json = JSONObject(text)
            val type = json.getString("type")
            
            when (type) {
                "auth_success" -> {
                    val groupId = json.getInt("groupId")
                    val deviceId = json.getInt("deviceId")
                    Log.i(TAG, "Authenticated: Group $groupId, Device $deviceId")
                    updateStatus("Connected", true)
                }
                
                "send_sms" -> {
                    val smsId = json.getInt("smsId")
                    val to = json.getString("to")
                    val message = json.getString("message")
                    sendSms(smsId, to, message)
                }
                
                "error" -> {
                    val errorMsg = json.getString("message")
                    Log.e(TAG, "Server error: $errorMsg")
                    updateStatus("Error: $errorMsg", false)
                }
                
                "pong" -> {
                    // Keepalive response
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse message: ${e.message}")
        }
    }
    
    private fun sendSms(smsId: Int, phoneNumber: String, message: String) {
        try {
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }
            
            smsManager.sendTextMessage(
                phoneNumber,
                null,
                message,
                getPendingSentIntent(smsId),
                null
            )
            
            Log.i(TAG, "SMS sent: ID=$smsId, To=$phoneNumber")
            
        } catch (e: Exception) {
            Log.e(TAG, "SMS send failed: ${e.message}")
            sendSmsStatus(smsId, "failed")
        }
    }
    
    private fun getPendingSentIntent(smsId: Int): PendingIntent {
        val intent = Intent("SMS_SENT").apply {
            putExtra("smsId", smsId)
        }
        return PendingIntent.getBroadcast(
            this,
            smsId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
    
    private fun sendSmsStatus(smsId: Int, status: String) {
        val statusMessage = JSONObject().apply {
            put("type", "sms_status")
            put("smsId", smsId)
            put("status", status)
        }
        webSocket?.send(statusMessage.toString())
    }
    
    // Broadcast receiver to handle SMS delivery status
    private val smsSentReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            val smsId = intent?.getIntExtra("smsId", 0) ?: return
            
            val status = when (resultCode) {
                Activity.RESULT_OK -> "sent"
                else -> "failed"
            }
            
            sendSmsStatus(smsId, status)
        }
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
    
    companion object {
        private const val TAG = "SmsWebSocketService"
    }
}
```

### 3. Layout XML Example

```xml
<!-- res/layout/activity_settings.xml -->
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="SMS Gateway Settings"
        android:textSize="24sp"
        android:textStyle="bold"
        android:layout_marginBottom="24dp"/>

    <com.google.android.material.textfield.TextInputLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="Server URL">
        
        <com.google.android.material.textfield.TextInputEditText
            android:id="@+id/etServerUrl"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:inputType="textUri"/>
    </com.google.android.material.textfield.TextInputLayout>

    <com.google.android.material.textfield.TextInputLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="16dp"
        android:hint="Device Token">
        
        <com.google.android.material.textfield.TextInputEditText
            android:id="@+id/etDeviceToken"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:inputType="text"/>
    </com.google.android.material.textfield.TextInputLayout>

    <com.google.android.material.textfield.TextInputLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="16dp"
        android:hint="Group ID">
        
        <com.google.android.material.textfield.TextInputEditText
            android:id="@+id/etGroupId"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:inputType="number"/>
    </com.google.android.material.textfield.TextInputLayout>

    <com.google.android.material.switchmaterial.SwitchMaterial
        android:id="@+id/switchPrimary"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="16dp"
        android:text="Set as Primary Device"/>

    <Button
        android:id="@+id/btnSave"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_marginTop="24dp"
        android:text="Save Settings"/>

</LinearLayout>
```

---

## Testing Your Integration

### 1. Test WebSocket Connection
```
1. Enter server URL: ws://YOUR_IP:3000/ws
2. Enter device token from dashboard
3. Enter your group ID (found in dashboard)
4. Connect and verify "auth_success" message
```

### 2. Test SMS Sending
```
1. Use dashboard or API to send test SMS
2. Verify SMS received by WebSocket
3. Send SMS via SmsManager
4. Send status update back to server
5. Check dashboard for "sent" status
```

---

## Common Issues

### Issue: "Device not found for this group"
**Solution:** 
- Verify device token is correctly registered on server
- Check you're using the correct group ID
- Ensure device token matches exactly (no spaces)

### Issue: "This device has been deactivated"
**Solution:**
- Log in to dashboard → Manage Devices
- Find your device and click "Activate"

### Issue: Connection timeout
**Solution:**
- Check server URL is correct
- Ensure server is running
- Verify network connectivity
- Check firewall settings

### Issue: SMS sent but status not updating
**Solution:**
- Verify you're sending SMS status updates
- Check smsId matches the one received
- Use valid status: "sent", "failed", or "delivered"

---

## Best Practices

1. **Token Security**
   - Store device token securely (SharedPreferences with encryption)
   - Never hardcode tokens in your app
   - Regenerate token if device is compromised

2. **Connection Management**
   - Implement exponential backoff for reconnection
   - Handle network state changes
   - Keep WebSocket alive with periodic pings

3. **Battery Optimization**
   - Use foreground service for background operation
   - Request battery optimization exemption
   - Batch status updates when possible

4. **Error Handling**
   - Log all WebSocket events for debugging
   - Show user-friendly error messages
   - Implement automatic retry for failed SMS

5. **User Experience**
   - Show connection status in notification
   - Display SMS queue counter
   - Provide manual reconnect option

---

## Migration from v1.0

### Required Changes
1. Add `groupId` field to settings UI
2. Include `groupId` in authentication message
3. Optionally add `isPrimary` flag
4. Handle new `deviceId` in auth response

### Database Migration (if storing locally)
```kotlin
// Add columns to local database if needed
db.execSQL("ALTER TABLE devices ADD COLUMN group_id INTEGER DEFAULT 0")
db.execSQL("ALTER TABLE devices ADD COLUMN device_id INTEGER DEFAULT 0")
```

---

## Support

For issues or questions:
- Check server logs for WebSocket errors
- Verify device registration in dashboard
- Test with curl or Postman first
- Review DEVICE_REGISTRATION_GUIDE.md

---

**Version:** 2.0  
**Compatible with:** SMS Gateway Server v2.0+  
**Last Updated:** March 1, 2026
