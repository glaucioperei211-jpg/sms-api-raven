# Flutter SMS Gateway App — Create From Scratch (FIXED)

You are Claude 4.6, an expert Flutter/Dart developer. Generate a complete, production-ready Flutter SMS Gateway app from scratch.

---

## Known Bugs Fixed In This Version

| # | Bug | Root Cause | Fix |
|---|-----|-----------|-----|
| 1 | SMS always reports `"failed"` even when device is connected | `MethodChannel` registered **only on the main engine** (`MainActivity`). The `flutter_background_service` background isolate runs on a **separate engine** that never receives the SMS channel handler → `MissingPluginException` is silently caught → returns `false` → reports `"failed"` | Create `SmsPlugin.kt` as a `FlutterPlugin` and register it on the background engine via `SmsBgService.kt` which extends `BackgroundService` |
| 2 | `SmsManager.getDefault()` may throw on Android 12+ | Deprecated API — can fail on API 31+ without being the default SMS app | Use `context.getSystemService(SmsManager::class.java)` on API 31+, gate with `Build.VERSION.SDK_INT` check |
| 3 | Background isolate can't resolve plugins | Missing `DartPluginRegistrant.ensureInitialized()` call in background entry point | Add `DartPluginRegistrant.ensureInitialized()` at the top of `onStart` |

---

## Task

Create a complete **Flutter** SMS Gateway app that:
- Connects to a Node.js WebSocket server
- Receives SMS commands via WebSocket and sends them using the device's native SMS
- Runs as a **background service** that persists even when the app is closed
- Auto-reconnects on disconnect with exponential backoff
- Auto-starts on device boot
- Shows a minimal status UI

---

## Project Setup

- **Framework**: Flutter (latest stable)
- **Language**: Dart
- **Package name**: `com.example.smsgateway`
- **Project name**: `sms_gateway`
- **Target**: Android only (no iOS needed)
- **Min SDK**: 26 (Android 8.0)
- **Target SDK**: 34

---

## Required Flutter/Dart Packages

```yaml
dependencies:
  flutter:
    sdk: flutter
  web_socket_channel: ^2.4.5            # WebSocket client
  flutter_background_service: ^5.0.6    # Background/foreground service
  flutter_background_service_android: ^6.2.4
  flutter_local_notifications: ^17.0.0  # Foreground notification
  permission_handler: ^11.3.0           # Runtime permissions
  shared_preferences: ^2.2.2            # Persist state
```

> Do NOT use `telephony` — it conflicts with background SMS sending. Use the platform channel (`SmsPlugin.kt`) approach defined below.

---

## Server Info (hardcode as constants)

```dart
const String wsUrl = 'ws://192.168.1.54:3000/ws';
const String deviceToken = 'sms12345supersecret123';
```

---

## Files to Generate

Generate ALL of the following with complete, working code:

1. **`pubspec.yaml`** — all dependencies
2. **`lib/main.dart`** — app entry point, initializes background service, shows status UI
3. **`lib/websocket_manager.dart`** — WebSocket connection, auth, message dispatch, reconnect
4. **`lib/sms_sender.dart`** — sends SMS via platform channel (catches `MissingPluginException`)
5. **`lib/models.dart`** — all Dart data classes / JSON models
6. **`lib/background_service.dart`** — initializes and runs the background/foreground service
7. **`lib/notification_helper.dart`** — notification channel setup for foreground service
8. **`android/app/src/main/AndroidManifest.xml`** — permissions and service declarations
9. **`android/app/build.gradle`** — minSdk, targetSdk, compileSdk config
10. **`android/app/src/main/kotlin/com/example/smsgateway/MainActivity.kt`** — registers `SmsPlugin` on the main engine
11. **`android/app/src/main/kotlin/com/example/smsgateway/SmsPlugin.kt`** — **NEW** — `FlutterPlugin` that handles SMS, registered on ALL engines
12. **`android/app/src/main/kotlin/com/example/smsgateway/SmsBgService.kt`** — **NEW** — extends `BackgroundService`, registers `SmsPlugin` on the background engine
13. **`android/app/src/main/kotlin/com/example/smsgateway/BootReceiver.kt`** — restart service on boot

---

## WebSocket Protocol (implement EXACTLY as described)

### Connection Flow
1. App connects to `ws://192.168.1.54:3000/ws`
2. **Immediately** on connection open, send auth JSON — **must happen within 15 seconds** or server closes the connection
3. Server replies with `auth_success`
4. Server may push queued `send_sms` commands within 1–2 seconds after auth
5. App processes each `send_sms`, sends the SMS natively, then reports status back to server

### Messages: App → Server

**Auth (FIRST message after connecting):**
```json
{ "type": "auth", "deviceToken": "sms12345supersecret123" }
```

**SMS Status Report (after each send attempt):**
```json
{ "type": "sms_status", "smsId": 1, "status": "sent" }
```
- `smsId` is an **int** (not a String)
- `status` must be exactly one of: `"sent"`, `"failed"`, or `"delivered"`

### Messages: Server → App

**Auth success:**
```json
{ "type": "auth_success", "message": "Device authenticated and online." }
```

**Send SMS command:**
```json
{ "type": "send_sms", "smsId": 1, "to": "+639XXXXXXXXX", "message": "[GroupName]\nMessage body here" }
```
- `smsId` is an **int**
- `to` is the recipient phone number
- `message` may contain newlines and can be long (handle multipart)

**Status confirmed:**
```json
{ "type": "status_updated", "smsId": 1, "status": "sent" }
```

**Pong (response to JSON ping):**
```json
{ "type": "pong" }
```

**Error:**
```json
{ "type": "error", "message": "Description of the error." }
```

---

## Data Models (`lib/models.dart`)

```dart
import 'dart:convert';

class AuthMessage {
  final String type = 'auth';
  final String deviceToken;
  AuthMessage({required this.deviceToken});
  String toJson() => jsonEncode({'type': type, 'deviceToken': deviceToken});
}

class SmsStatusMessage {
  final String type = 'sms_status';
  final int smsId;
  final String status; // "sent", "failed", or "delivered"
  SmsStatusMessage({required this.smsId, required this.status});
  String toJson() => jsonEncode({'type': type, 'smsId': smsId, 'status': status});
}

class ServerMessage {
  final String type;
  final int? smsId;
  final String? to;
  final String? message;
  final String? status;

  ServerMessage({
    this.type = '',
    this.smsId,
    this.to,
    this.message,
    this.status,
  });

  factory ServerMessage.fromJson(Map<String, dynamic> json) {
    return ServerMessage(
      type: json['type'] ?? '',
      smsId: json['smsId'] is int ? json['smsId'] : null,
      to: json['to'],
      message: json['message'],
      status: json['status'],
    );
  }
}
```

---

## WebSocket Manager (`lib/websocket_manager.dart`)

Requirements:
- Use `web_socket_channel` package (`WebSocketChannel.connect(wsUrl)`)
- On connect: send auth JSON immediately
- Listen to incoming messages, parse JSON into `ServerMessage`, dispatch by `type`:

```
"auth_success"   → set isAuthenticated = true, log
"send_sms"       → extract smsId (int), to, message → call SmsSender.send(), then report status
"status_updated" → log confirmation
"pong"           → log
"error"          → log error message
else             → log unknown type
```

- On error or stream done: schedule reconnect with exponential backoff
- Reconnect: start at 5 seconds, double each failure, max 60 seconds
- On successful connect (auth_success received): reset delay to 5 seconds
- Send a JSON ping `{"type": "ping"}` every 25 seconds as a keepalive timer
- Expose `connect()` and `disconnect()` methods
- Handle `WebSocketChannelException` and `SocketException` gracefully
- After receiving `send_sms`, call `SmsSender.send(to, message)`, then send back:
  - If success: `{"type": "sms_status", "smsId": <int>, "status": "sent"}`
  - If failure: `{"type": "sms_status", "smsId": <int>, "status": "failed"}`

Structure:
```dart
class WebSocketManager {
  WebSocketChannel? _channel;
  Timer? _pingTimer;
  Timer? _reconnectTimer;
  int _reconnectDelay = 5000; // milliseconds
  static const int _maxReconnectDelay = 60000;
  bool isAuthenticated = false;

  void connect() { ... }
  void disconnect() { ... }
  void _onMessage(dynamic rawData) { ... }
  void _scheduleReconnect() { ... }
  void _sendAuth() { ... }
  void _startPingTimer() { ... }
  void _stopPingTimer() { ... }
}
```

---

## SMS Sender (`lib/sms_sender.dart`)

Use **platform channel** approach. The channel name must exactly match `SmsPlugin.kt`.

**Dart side:**
```dart
import 'package:flutter/services.dart';

class SmsSender {
  static const _channel = MethodChannel('com.example.smsgateway/sms');

  static Future<bool> send(String to, String message) async {
    try {
      final result = await _channel.invokeMethod<bool>('sendSms', {
        'to': to,
        'message': message,
      });
      return result == true;
    } on MissingPluginException catch (e) {
      // This means SmsPlugin was NOT registered on the current engine.
      // Check that SmsBgService.kt is used in AndroidManifest.xml.
      print('[SmsSender] MissingPluginException — SmsPlugin not on this engine: $e');
      return false;
    } catch (e) {
      print('[SmsSender] SMS send error: $e');
      return false;
    }
  }
}
```

## `android/app/src/main/kotlin/com/example/smsgateway/MainActivity.kt`

Registers `SmsPlugin` on the **main** Flutter engine. The **background** engine is handled by `SmsBgService.kt`.

```kotlin
package com.example.smsgateway

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Register SmsPlugin on the main engine
        flutterEngine.plugins.add(SmsPlugin())
    }
}
```

---

## `android/app/src/main/kotlin/com/example/smsgateway/SmsPlugin.kt` — CRITICAL FIX (NEW FILE)

By implementing `FlutterPlugin`, this class can be attached to **any** Flutter engine — main or background. This is the core fix: the background service's engine gets an SMS handler.

```kotlin
package com.example.smsgateway

import android.content.Context
import android.os.Build
import android.telephony.SmsManager
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.MethodCallHandler
import io.flutter.plugin.common.MethodChannel.Result

class SmsPlugin : FlutterPlugin, MethodCallHandler {

    private lateinit var channel: MethodChannel
    private lateinit var context: Context

    companion object {
        const val CHANNEL_NAME = "com.example.smsgateway/sms"
    }

    // Called when attached to any Flutter engine (main OR background).
    // This is what makes it work in the background isolate.
    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, CHANNEL_NAME)
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }

    override fun onMethodCall(call: MethodCall, result: Result) {
        if (call.method != "sendSms") {
            result.notImplemented()
            return
        }

        val to      = call.argument<String>("to")
        val message = call.argument<String>("message")

        if (to.isNullOrBlank() || message.isNullOrBlank()) {
            result.error("INVALID_ARGS", "to and message are required", null)
            return
        }

        try {
            // FIX: SmsManager.getDefault() is deprecated on Android 12+ (API 31+)
            // and can throw on devices where the app is not the default SMS app.
            // Use context.getSystemService() on API 31+.
            val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                context.getSystemService(SmsManager::class.java)
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            // Handle multipart SMS (>160 chars)
            val parts = smsManager.divideMessage(message)
            if (parts.size == 1) {
                smsManager.sendTextMessage(to, null, message, null, null)
            } else {
                smsManager.sendMultipartTextMessage(to, null, parts, null, null)
            }

            result.success(true)

        } catch (e: Exception) {
            result.error("SMS_ERROR", e.message ?: "Unknown SMS error", null)
        }
    }
}
```

---

## `android/app/src/main/kotlin/com/example/smsgateway/SmsBgService.kt` — CRITICAL FIX (NEW FILE)

Extends `flutter_background_service_android`'s `BackgroundService` and registers `SmsPlugin` on the background Flutter engine in `onCreate`. Without this, the background engine has no handler for `com.example.smsgateway/sms`.

```kotlin
package com.example.smsgateway

import id.flutter.flutter_background_service.BackgroundService

class SmsBgService : BackgroundService() {

    override fun onCreate() {
        super.onCreate()
        // Register SmsPlugin on the background Flutter engine.
        // This is the fix: the background isolate's MethodChannel calls
        // to 'com.example.smsgateway/sms' will now have a handler.
        flutterEngine?.plugins?.add(SmsPlugin())
    }
}
```

---

## Background Service (`lib/background_service.dart`)

Use `flutter_background_service` package:

```dart
Future<void> initializeService() async {
  final service = FlutterBackgroundService();
  await service.configure(
    androidConfiguration: AndroidConfiguration(
      onStart: onStart,
      autoStart: true,
      isForegroundMode: true,
      notificationChannelId: 'sms_gateway_channel',
      initialNotificationTitle: 'SMS Gateway',
      initialNotificationContent: 'Running in background...',
      foregroundServiceNotificationId: 888,
    ),
    iosConfiguration: IosConfiguration(), // not used, Android only
  );
  await service.startService();
}

@pragma('vm:entry-point')
void onStart(ServiceInstance service) async {
  // FIX: DartPluginRegistrant resolves plugins on the background engine's
  // binary messenger. Without this, MethodChannel calls (SmsSender.send)
  // throw MissingPluginException in the background isolate.
  DartPluginRegistrant.ensureInitialized();

  // Initialize WebSocketManager here
  final wsManager = WebSocketManager();
  wsManager.connect();

  // Listen for stop command from UI
  service.on('stopService').listen((event) {
    wsManager.disconnect();
    service.stopSelf();
  });
}
```

---

## Notification Helper (`lib/notification_helper.dart`)

- Channel ID: `"sms_gateway_channel"`
- Channel name: `"SMS Gateway Service"`
- Importance: low (silent, no sound)
- Use `flutter_local_notifications` to create the notification channel on app start

---

## Main App (`lib/main.dart`)

```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeService();
  runApp(const SmsGatewayApp());
}
```

**UI requirements:**
- Material Design
- Simple single-screen layout:
  - App bar: "SMS Gateway"
  - Card showing: WebSocket URL, Device Token
  - Status indicator: green dot + "Service Running" or red dot + "Service Stopped"
  - "Stop Service" / "Start Service" toggle button
- Request `SEND_SMS` permission on startup using `permission_handler`
- If permission denied, show a warning and retry button

---

## `android/app/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.SEND_SMS" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

    <application
        android:label="SMS Gateway"
        android:name="${applicationName}"
        android:icon="@mipmap/ic_launcher">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>

        <service
            android:name=".SmsBgService"
            android:foregroundServiceType="connectedDevice"
            android:exported="false" />
        <!--
            CRITICAL: Use .SmsBgService (our custom class) NOT the default
            id.flutter.flutter_background_service.BackgroundService.
            SmsBgService.onCreate() registers SmsPlugin on the background
            Flutter engine so MethodChannel calls from the background
            isolate (SmsSender.send) have a handler and don't throw
            MissingPluginException.
        -->

        <receiver
            android:name=".BootReceiver"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
            </intent-filter>
        </receiver>

        <meta-data
            android:name="flutterEmbedding"
            android:value="2" />
    </application>
</manifest>
```

---

## `android/app/build.gradle`

```gradle
android {
    compileSdk 34
    defaultConfig {
        applicationId "com.example.smsgateway"
        minSdk 26
        targetSdk 34
        versionCode 1
        versionName "1.0"
    }
}
```

---

## Boot Receiver (`BootReceiver.kt`)

```kotlin
package com.example.smsgateway

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            // flutter_background_service handles auto-start when autoStart: true
            // This receiver is a safety net
        }
    }
}
```

---

## Summary of Critical Rules

| Rule | Detail |
|------|--------|
| Auth first | Send `{"type":"auth","deviceToken":"..."}` immediately on WebSocket open |
| Auth within 15s | Server terminates connection if no auth received in 15 seconds |
| `type` field required | Every outgoing JSON must include `"type"` or server ignores it |
| `smsId` is int | Integer in both directions — never String |
| Status values | Only: `"sent"`, `"failed"`, `"delivered"` |
| JSON ping | Send `{"type":"ping"}` every 25 seconds as keepalive |
| Reconnect | On disconnect/error: exponential backoff 5s → 10s → 20s → ... → 60s max |
| Background service | Must survive app close — `flutter_background_service` with `isForegroundMode: true` |
| Multipart SMS | `SmsManager.divideMessage()` + `sendMultipartTextMessage()` in `SmsPlugin.kt` |
| MethodChannel scope | `SmsPlugin` must be registered on the **background engine** via `SmsBgService`, not just `MainActivity` |
| SmsManager API | Use `context.getSystemService(SmsManager::class.java)` on API 31+, `SmsManager.getDefault()` on older |
| DartPluginRegistrant | Call `DartPluginRegistrant.ensureInitialized()` at the top of the `onStart` background entry point |
| Background service class | AndroidManifest must declare `.SmsBgService`, NOT the default `BackgroundService` class |
| Boot start | Service auto-starts on device reboot via `autoStart: true` + `BootReceiver` |
| Permissions | Request `SEND_SMS` at runtime before starting service |

---

## What to Generate

Provide the **complete file content** for ALL 13 files listed above.
Each file must be:
- **Complete** — no placeholders, no `// TODO`, no partial implementations
- **Fully working** — copy-paste ready into a Flutter project
- **Well-commented** — explain key fix logic (especially `SmsPlugin`, `SmsBgService`, `DartPluginRegistrant`)
- **Edge-case safe** — null checks, Android API version guards, permission denied handling, multipart SMS

Start by generating `pubspec.yaml`, then each Dart file, then the Android-specific files.
Generate `SmsPlugin.kt` and `SmsBgService.kt` before `MainActivity.kt`.
