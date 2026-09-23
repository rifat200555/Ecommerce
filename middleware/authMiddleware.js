const jwt = require('jsonwebtoken');

const AUTH_COOKIE = 'auth_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/'
};

function readCookie(req, name) {
  const header = req.headers.cookie || '';

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    const key = part.slice(0, separator).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return null;
}

function getAuthToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7);
  }

  return readCookie(req, AUTH_COOKIE);
}

function authMiddleware(req, res, next) {
  const token = getAuthToken(req);

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.userId };   // hand the info to the next function
    next();                                  // continue to the next middleware/route
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function pageAuthMiddleware(req, res, next) {
  const token = readCookie(req, AUTH_COOKIE);

  if (!token) {
    return res.redirect('/login.html');
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.userId };
    next();
  } catch (err) {
    res.clearCookie(AUTH_COOKIE, COOKIE_OPTIONS);
    return res.redirect('/login.html');
  }
}

authMiddleware.page = pageAuthMiddleware;
authMiddleware.cookieName = AUTH_COOKIE;
authMiddleware.cookieOptions = COOKIE_OPTIONS;

module.exports = authMiddleware;
