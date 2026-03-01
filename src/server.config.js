// server.config.js
// Shared configuration values used across the project

module.exports = {
  // ── Server ──────────────────────────────────
  PORT: process.env.PORT || 3000,

  // ── JWT ─────────────────────────────────────
  // Change this to a long random string in production!
  JWT_SECRET: process.env.JWT_SECRET || 'sms12345supersecret',

  // ── JWT token expiry ─────────────────────────
  JWT_EXPIRES_IN: '8h',

  // ── Rate limiting ────────────────────────────
  // Max SMS per minute per group (sliding window)
  RATE_LIMIT_PER_MINUTE: 5,

  // ── bcrypt rounds ────────────────────────────
  BCRYPT_ROUNDS: 10,

  // ── Admin credentials (hardcoded) ────────────
  // Change these before going to production!
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin1234',

  // Separate secret for admin JWT tokens
  ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET || 'capstone_admin_secret_2026_CHANGE_ME',
  ADMIN_JWT_EXPIRES_IN: '8h',

  // ── Server host for WebSocket URL display ────
  // Set this to your PC's local IP (same Wi-Fi), public domain, or ngrok URL.
  // Used only to display the correct WS URL in the admin dashboard.
  //
  // Examples:
  //   Local Wi-Fi:  "192.168.1.100"
  //   ngrok:        "abc123.ngrok.io"
  //   Domain:       "yourdomain.com"
  //   Render:       "your-service.onrender.com"
  //
  SERVER_HOST: process.env.SERVER_HOST || 'localhost',
};
