// middleware/adminMiddleware.js
// Verifies JWT tokens specifically for the admin panel

const jwt = require('jsonwebtoken');
const { ADMIN_JWT_SECRET } = require('../server.config');

function requireAdmin(req, res, next) {
  let token = null;

  // Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // Fall back to cookie (used by admin HTML pages)
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, part) => {
      const [key, ...val] = part.trim().split('=');
      acc[key.trim()] = decodeURIComponent(val.join('='));
      return acc;
    }, {});
    token = cookies['admin_token'] || null;
  }

  if (!token) {
    if (req.path.startsWith('/admin/api/')) {
      return res.status(401).json({ error: 'Admin authentication required.' });
    }
    return res.redirect('/admin-login.html');
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    req.admin = decoded; // { username }
    next();
  } catch (err) {
    if (req.path.startsWith('/admin/api/')) {
      return res.status(401).json({ error: 'Invalid or expired admin token.' });
    }
    return res.redirect('/admin-login.html');
  }
}

module.exports = { requireAdmin };
