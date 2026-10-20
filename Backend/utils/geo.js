let geoip = null;
try {
  geoip = (await import('geoip-lite')).default;
} catch {
  console.warn('geoip-lite unavailable: geo lookup disabled');
}

export function lookupGeo(ip) {
  if (!geoip || !ip) return { country: null, city: null };
  const g = geoip.lookup(ip.replace(/^::ffff:/, ''));
  return { country: g?.country ?? null, city: g?.city || null };
}

