import dotenv from 'dotenv';

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function effectiveStatus(l) {
  if (l.status !== 'active') return l.status;
  if (l.expiresAt && new Date(l.expiresAt) <= new Date()) return 'expired';
  if (l.clickLimit != null && l.clickCount >= l.clickLimit) return 'limit_reached';
  return 'active';
}


export function presentLink(doc) {
  const l = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(l._id),
    code: l.code,
    shortUrl: `${(process.env.baseUrl || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '')}/${l.code}`,
    destination: l.destination,
    ownerId: String(l.ownerId),
    campaignId: l.campaignId ? String(l.campaignId) : null,
    tags: l.tags || [],
    status: l.status,
    effectiveStatus: effectiveStatus(l),
    disabledBy: l.disabledBy ?? null,
    disabledReason: l.disabledReason ?? null,
    expiresAt: l.expiresAt ?? null,
    clickLimit: l.clickLimit ?? null,
    clickCount: l.clickCount ?? 0,
    hasPassword: !!l.hasPassword,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}