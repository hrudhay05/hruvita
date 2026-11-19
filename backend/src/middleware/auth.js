import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { findUserById, sanitizeUser } from '../store/repository.js';

const getAccessSecret = () => process.env.JWT_SECRET || 'hruvita-jwt-access-secret-2026-secure';
const getRefreshSecret = () =>
  process.env.JWT_REFRESH_SECRET || 'hruvita-jwt-refresh-secret-2026-secure';

export const ACCESS_COOKIE_NAME = 'hruvita_access_token';
export const REFRESH_COOKIE_NAME = 'hruvita_refresh_token';

export function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    getAccessSecret(),
    { expiresIn: '1h' }
  );
}

export function signRefreshToken(user, rememberMe = false) {
  const jti = crypto.randomBytes(16).toString('hex');
  return jwt.sign(
    {
      id: user.id,
      jti,
      rememberMe: Boolean(rememberMe),
    },
    getRefreshSecret(),
    { expiresIn: rememberMe ? '30d' : '7d' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getAccessSecret());
}

export function verifyRefreshTokenJwt(token) {
  return jwt.verify(token, getRefreshSecret());
}

export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

export function setAuthCookies(res, accessToken, refreshToken, rememberMe = false) {
  const isProd = process.env.NODE_ENV === 'production';
  const common = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };

  res.cookie(ACCESS_COOKIE_NAME, accessToken, {
    ...common,
    maxAge: 60 * 60 * 1000, // 1 hour
  });

  if (refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      ...common,
      maxAge: (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000,
    });
  }
}

export function clearAuthCookies(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const common = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
  res.clearCookie(ACCESS_COOKIE_NAME, common);
  res.clearCookie(REFRESH_COOKIE_NAME, common);
}

export async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.[ACCESS_COOKIE_NAME] || '';
    const header = req.headers.authorization || '';
    if (!token && header.startsWith('Bearer ')) {
      token = header.slice(7).trim();
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }

    const decoded = jwt.verify(token, getAccessSecret());
    const user = await findUserById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    if (user.blocked) {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }

    req.user = await sanitizeUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

// NoSQL Injection sanitizer middleware
export function sanitizeNoSqlInput(req, _res, next) {
  const stripDollar = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i += 1) obj[i] = stripDollar(obj[i]);
      return obj;
    }
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else {
        obj[key] = stripDollar(obj[key]);
      }
    }
    return obj;
  };
  if (req.body) stripDollar(req.body);
  if (req.query) stripDollar(req.query);
  if (req.params) stripDollar(req.params);
  next();
}
