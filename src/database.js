// database.js
// Handles SQLite database connection and table initialization

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file location
const DB_PATH = path.join(__dirname, 'database.db');

// Create and connect to the SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[DB] Failed to connect to database:', err.message);
    process.exit(1);
  }
  console.log('[DB] Connected to SQLite database at', DB_PATH);
});

// Enable WAL mode for better concurrent read/write performance
db.run('PRAGMA journal_mode = WAL;');

// ─────────────────────────────────────────────
// Initialize all tables on first run
// ─────────────────────────────────────────────
function initializeDatabase() {
  db.serialize(() => {

    // ── groups table ──────────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS groups (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name      TEXT    NOT NULL,
        email           TEXT    UNIQUE NOT NULL,
        password_hash   TEXT    NOT NULL,
        api_key         TEXT    UNIQUE NOT NULL,
        sms_limit       INTEGER DEFAULT 200,
        is_active       INTEGER DEFAULT 1,
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating groups table:', err.message);
      else {
        console.log('[DB] groups table ready.');
        // Migration: add is_active column if it doesn't exist (for existing databases)
        db.run(`ALTER TABLE groups ADD COLUMN is_active INTEGER DEFAULT 1`, (alterErr) => {
          // Ignore "duplicate column" error — it means migration already ran
          if (alterErr && !alterErr.message.includes('duplicate column')) {
            console.error('[DB] Migration error:', alterErr.message);
          }
        });
      }
    });

    // ── sms_logs table ───────────────────────
    db.run(`
      CREATE TABLE IF NOT EXISTS sms_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id   INTEGER NOT NULL,
        receiver   TEXT    NOT NULL,
        message    TEXT    NOT NULL,
        status     TEXT    DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id)
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating sms_logs table:', err.message);
      else      console.log('[DB] sms_logs table ready.');
    });

    // ── group_devices table ──────────────────
    // NEW: Each group has their own set of devices
    db.run(`
      CREATE TABLE IF NOT EXISTS group_devices (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id        INTEGER NOT NULL,
        device_token    TEXT    UNIQUE NOT NULL,
        device_name     TEXT,
        device_model    TEXT,
        is_online       INTEGER DEFAULT 0,
        is_active       INTEGER DEFAULT 1,
        is_primary      INTEGER DEFAULT 0,
        last_seen       DATETIME,
        registered_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating group_devices table:', err.message);
      else      console.log('[DB] group_devices table ready.');
    });

    // ── device table (legacy, kept for backward compatibility) ───────
    // Old table is still created but deprecated
    db.run(`
      CREATE TABLE IF NOT EXISTS device (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        device_token TEXT    UNIQUE NOT NULL,
        is_online    INTEGER DEFAULT 0,
        last_seen    DATETIME
      )
    `, (err) => {
      if (err) console.error('[DB] Error creating device table:', err.message);
      else      console.log('[DB] device table ready (legacy).');
    });

  });
}

// ─────────────────────────────────────────────
// Helper: run a query that modifies data (INSERT / UPDATE / DELETE)
// Returns a Promise that resolves with { lastID, changes }
// ─────────────────────────────────────────────
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

// ─────────────────────────────────────────────
// Helper: fetch a single row
// ─────────────────────────────────────────────
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// ─────────────────────────────────────────────
// Helper: fetch multiple rows
// ─────────────────────────────────────────────
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = { db, initializeDatabase, dbRun, dbGet, dbAll };
