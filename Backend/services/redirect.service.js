import bcrypt from 'bcryptjs';
import Link from '../models/link.js';
import { getLinkByCode } from './cache.service.js';

export async function evaluateVisit({ code, password, isBot }) {
  const link = await getLinkByCode(code);
  if (!link) return { outcome: 'not_found' };

  if (link.status !== 'active') return { outcome: 'disabled', link };
  if (link.expiresAt && new Date(link.expiresAt) <= new Date()) return { outcome: 'expired', link };


  const limited = link.clickLimit != null;
  if (limited) {
    const fresh = await Link.findById(link._id).select('clickCount clickLimit status').lean();
    if (!fresh) return { outcome: 'not_found' };
    if (fresh.status !== 'active') return { outcome: 'disabled', link };
    if (fresh.clickCount >= fresh.clickLimit) return { outcome: 'limit_reached', link };
  }

  if (link.hasPassword) {
    if (password == null) return { outcome: 'password_required', link };
    if (!(await bcrypt.compare(password, link.passwordHash))) return { outcome: 'wrong_password', link };
  }

  let counted = false;
  if (limited && !isBot) {
    const updated = await Link.findOneAndUpdate(
      { _id: link._id, status: 'active', $expr: { $lt: ['$clickCount', '$clickLimit'] } },
      { $inc: { clickCount: 1 } },
      { projection: { _id: 1 } }
    );
    if (!updated) return { outcome: 'limit_reached', link };
    counted = true;
  }

  return { outcome: 'redirect', link, counted };
}