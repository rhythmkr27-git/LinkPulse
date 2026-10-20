import Blocklist from "../models/blockList.js";
import dotenv from 'dotenv';

dotenv.config();

const MAX_LEN = 2048;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])/;
const isProd = process.env.isProd === 'true' || process.env.NODE_ENV === 'production';

const selfHosts = () => {
  const baseUrl = process.env.baseUrl || process.env.BASE_URL;
  const clientUrl = process.env.clientUrl || process.env.CLIENT_URL;
  const hosts = [];
  if (baseUrl) hosts.push(new URL(baseUrl).host.toLowerCase());
  if (clientUrl) hosts.push(new URL(clientUrl).host.toLowerCase());
  return new Set(hosts);
};

function domainSuffixes(host) {
  const parts = host.split('.');
  const out = [];
  for (let i = 0; i <= parts.length - 2; i++) out.push(parts.slice(i).join('.'));
  return out.length ? out : [host];
}

export async function validateDestination(input) {
  const errors = [];
  const warnings = [];
  const raw = String(input ?? '').trim();

  if (!raw) return { ok: false, errors: ['URL is required'], warnings };
  if (raw.length > MAX_LEN) return { ok: false, errors: [`URL is longer than ${MAX_LEN} characters`], warnings };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, errors: ['Not a valid URL (include http:// or https://)'], warnings };
  }

  if (!['http:', 'https:'].includes(url.protocol)) errors.push('Only http and https URLs are allowed');
  if (url.username || url.password) errors.push('URLs with embedded credentials are not allowed');

  const host = url.hostname.toLowerCase();
  if (selfHosts().has(url.host.toLowerCase())) {
    errors.push('Destination points back to LinkPulse (redirect loop)');
  }
  if (PRIVATE_HOST.test(host)) {
    (isProd ? errors : warnings).push('Destination is a local/private address');
  }
  if (url.protocol === 'http:') warnings.push('Destination is not HTTPS');

  if (!errors.length) {
    const hit = await Blocklist.findOne({ domain: { $in: domainSuffixes(host) } }).lean();
    if (hit) errors.push(`Domain is blocked: ${hit.domain}`);
  }

  return { ok: errors.length === 0, normalized: url.href, errors, warnings };
}