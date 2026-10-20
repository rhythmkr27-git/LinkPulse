import crypto from 'crypto';

export function visitorHash(ip, userAgent) {
  const raw = `${ip ?? 'unknown'}|${userAgent ?? ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
