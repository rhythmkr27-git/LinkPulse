import { getRedis } from "../config/redis.js";
import Link from "../models/link.js";

const TTL_SECONDS = 300;
const key = (code) => `link:${code}`;

function revive(link) {
  if (link.expiresAt) link.expiresAt = new Date(link.expiresAt);
  return link;
}

export async function getLinkByCode(code) {
  const redis = getRedis();
  if (redis) {
    try {
      const hit = await redis.get(key(code));
      if (hit) return revive(JSON.parse(hit));
    } catch {
    }
  }

  const link = await Link.findOne({ code }).select('+passwordHash').lean();
  if (!link) return null;

  if (redis) {
    try {
      await redis.set(key(code), JSON.stringify(link), 'EX', TTL_SECONDS);
    } catch {
    }
  }
  return link;
}

export async function invalidateLink(code) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key(code));
  } catch {
  }
}