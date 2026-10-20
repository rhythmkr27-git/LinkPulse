import jwt from 'jsonwebtoken';
import User from '../models/usermodel.js';
import { env } from '../config/env.js';
import { HttpError } from './error.js';

export const COOKIE = 'token';

// Frontend on a different domain in production needs SameSite=None + Secure.
export const cookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.isProd ? 'none' : 'lax',
  path: '/',
};

export function signToken(user) {
  return jwt.sign({ sub: String(user._id ?? user.id), role: user.role }, env.jwtSecret, { expiresIn: '7d' });
}

export function setAuthCookie(res, user) {
  const token = signToken(user);
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: 7 * 24 * 3600 * 1000 });
  res.cookie('accessToken', token, { ...cookieOptions, maxAge: 7 * 24 * 3600 * 1000 });
}

export async function requireAuth(req, res, next) {
  const header = req.get('authorization');
  const token = req.cookies?.[COOKIE] || req.cookies?.accessToken || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) throw new HttpError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }

  const user = await User.findById(payload.sub).lean();
  if (!user) throw new HttpError(401, 'User no longer exists');

  req.user = { id: String(user._id), role: user.role, email: user.email, username: user.username ?? user.name ?? 'user', name: user.name ?? user.username ?? 'user' };
  next();
}

export const verifyUser = requireAuth;
export const tokenGenrator = signToken;
export const setCookies = setAuthCookie;
export const requireAuthLegacy = requireAuth;
