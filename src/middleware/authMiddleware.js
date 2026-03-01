// middleware/authMiddleware.js
// Verifies JWT tokens for protecting dashboard routes

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../server.config');

// ─────────────────────────────────────────────
// Middleware: protect API/dashboard routes
// Reads the token from:
//   1. Authorization header: Bearer <token>
//   2. Cookie: token=<token>  (for dashboard HTML pages)
// ─────────────────────────────────────────────
function requireAuth(req, res, next) {
  let token = null;

  // Check Authorization header first
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Fall back to cookie (used by HTML dashboard pages)
  if (!token && req.headers.cookie) {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['token'] || null;
  }

  if (!token) {
    // API request → return JSON error
    if (req.path.startsWith('/api/') || req.headers['content-type'] === 'application/json') {
      return res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
    }
    // Browser request → redirect to login page
    return res.redirect('/login.html');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, group_name }
    next();
  } catch (err) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }
    return res.redirect('/login.html');
  }
}

// ─────────────────────────────────────────────
// Tiny cookie parser (avoids extra dependency)
// ─────────────────────────────────────────────
function parseCookies(cookieHeader) {
  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...val] = part.trim().split('=');
    acc[key.trim()] = decodeURIComponent(val.join('='));
    return acc;
  }, {});
}

module.exports = { requireAuth };
