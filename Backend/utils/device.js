import { UAParser } from 'ua-parser-js';
import { isbot } from 'isbot';

export function parseUA(ua = '') {
  const r = new UAParser(ua).getResult();
  return {
    isBot: !ua || isbot(ua),
    device: r.device?.type || 'desktop',
    browser: r.browser?.name || 'Unknown',
    os: r.os?.name || 'Unknown',
  };
}