import Redis from 'ioredis';
import dotenv from 'dotenv';

let client = null;


export function initRedis() {
  if (!process.env.REDIS_URL2) {
    console.log('Redis disabled (REDIS_URL empty): link lookups use MongoDB directly');
    return null;
  }

  client = new Redis(process.env.REDIS_URL2, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
  client.on('error', (e) => console.error('Redis error:', e.message));
  client.on('ready', () => console.log('Redis ready'));
  return client;
}

export const getRedis = () => client;

export async function closeRedis() {
  if (client) await client.quit().catch(() => {});
}