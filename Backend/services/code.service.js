import { customAlphabet } from 'nanoid';
import Link from '../models/link.js';

const gen = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 7);

export const RESERVED = new Set([
  'api', 'admin', 'login', 'logout', 'register', 'signup', 'dashboard', 'health',
  'static', 'assets', 'links', 'link', 'campaigns', 'analytics', 'settings',
  'qr', 'unlock', 'favicon', 'robots', 'www',
]);

export const CODE_RE = /^[a-z0-9_-]{3,32}$/;

export async function validateAlias(raw) {
  const alias = String(raw).trim().toLowerCase();
  if (!CODE_RE.test(alias)) {
    return { ok: false, error: 'Alias must be 3-32 characters: letters, numbers, - or _' };
  }
  if (RESERVED.has(alias)) return { ok: false, error: 'This alias is reserved' };
  if (await Link.exists({ code: alias })) return { ok: false, error: 'Alias is already taken' };
  return { ok: true, alias };
}

export async function generateCode() {
  for (let i = 0; i < 5; i++) {
    const code = gen();
    if (!RESERVED.has(code) && !(await Link.exists({ code }))) return code;
  }
  throw new Error('Could not generate a unique code');
}

