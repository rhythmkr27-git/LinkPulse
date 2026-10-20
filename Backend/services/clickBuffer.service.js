import ClickEvent from '../models/ClickEvent.js';
import Link from '../models/link.js';

const FLUSH_INTERVAL_MS = 2000;
const MAX_BATCH = 250;
const MAX_BUFFER = 20000;
let buffer = [];
let timer = null;
let flushing = false;

export const bufferSize = () => buffer.length;
export function pushClick(event) {
  if (buffer.length >= MAX_BUFFER) {
    console.error('Click buffer is full; dropping oldest event');
    buffer.shift();
  }
  buffer.push(event);
  if (buffer.length >= MAX_BATCH) void flushNow();
}

export async function flushNow() {
  if (flushing || buffer.length === 0) return;
  flushing = true;
  const batch = buffer;
  buffer = [];
  let persisted = false;
  try {
    await ClickEvent.insertMany(batch.map(({ counted, ...doc }) => doc), { ordered: false });
    persisted = true;
  } catch (err) {
    // Mongo may have accepted some unordered inserts before returning an error. Requeueing
    // here can duplicate events, so log the failure and retry only when no write was acknowledged.
    console.error('Click event batch insert failed:', err.message);
    if (!err.result?.insertedCount && !err.insertedDocs?.length) {
      buffer = batch.concat(buffer).slice(-MAX_BUFFER);
    }
  }
  if (persisted) {
    try {
      const increments = new Map();
      for (const event of batch) {
        if (event.isBot || event.counted) continue;
        const id = String(event.linkId);
        increments.set(id, (increments.get(id) || 0) + 1);
      }
      if (increments.size) await Link.bulkWrite([...increments].map(([id, n]) => ({
        updateOne: { filter: { _id: id }, update: { $inc: { clickCount: n } } },
      })), { ordered: false });
    } catch (err) {
      console.error('Click counter update failed after event persistence:', err.message);
    }
  }
  flushing = false;
}

export function startClickFlusher() {
  if (timer) return;
  timer = setInterval(() => { if (!flushing) void flushNow(); }, FLUSH_INTERVAL_MS);
  timer.unref?.();
}

export async function drainClicks() {
  if (timer) clearInterval(timer);
  timer = null;
  while (flushing) await new Promise((resolve) => setTimeout(resolve, 25));
  // Retry a few times in case MongoDB is briefly unavailable during shutdown.
  for (let i = 0; i < 3 && buffer.length; i++) await flushNow();
}
