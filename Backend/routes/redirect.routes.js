import { Router } from 'express';
import { CODE_RE } from '../services/code.service.js';
import { evaluateVisit } from '../services/redirect.service.js';
import { pushClick } from '../services/clickBuffer.service.js';
import { unlockLimiter } from '../middleware/rateLimit.js';
import { parseUA } from '../utils/device.js';
import { lookupGeo } from '../utils/geo.js';
import { visitorHash } from '../utils/hash.js';


const router = Router();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function page(res, status, title, body) {
  res
    .status(status)
    .set('Cache-Control', 'no-store')
    .type('html')
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f7f9;color:#1a1a1a;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#fff;padding:2rem 2.5rem;border-radius:12px;box-shadow:0 2px 12px #0001;max-width:380px;width:calc(100% - 2rem)}
h1{font-size:1.25rem;margin:0 0 .75rem}p{margin:.25rem 0 1rem;color:#555}
input,button{font:inherit;padding:.6rem .8rem;border-radius:8px;border:1px solid #ccc;width:100%;box-sizing:border-box}
button{background:#111;color:#fff;border-color:#111;margin-top:.6rem;cursor:pointer}.err{color:#b00020}</style></head>
<body><main><h1>${esc(title)}</h1>${body}</main></body></html>`);
}

const passwordPage = (res, code, error) =>
  page(
    res,
    error ? 401 : 200,
    'Password required',
    `<p>This link is password protected.</p>${error ? `<p class="err">${esc(error)}</p>` : ''}
<form method="POST" action="/${code}/unlock">
<input type="password" name="password" placeholder="Password" autofocus required>
<button type="submit">Continue</button></form>`
  );

function referrerOf(req) {
  if (req.query.src === 'qr') return 'qr-code'; 
  const ref = req.get('referer');
  if (!ref) return 'direct';
  try {
    return new URL(ref).hostname.replace(/^www\./, '') || 'direct';
  } catch {
    return 'direct';
  }
}

async function visit(req, res, password) {
  const code = String(req.params.code).toLowerCase();

  if (!CODE_RE.test(code)) return page(res, 404, 'Link not found', '<p>This short link does not exist.</p>');

  const ua = req.get('user-agent') || '';
  const parsed = parseUA(ua);
  const isHead = req.method === 'HEAD'; 
  const isBot = parsed.isBot || isHead;

  const result = await evaluateVisit({ code, password, isBot });
  const { link } = result;

  switch (result.outcome) {
    case 'not_found':
      return page(res, 404, 'Link not found', '<p>This short link does not exist.</p>');
    case 'disabled':
      return page(res, 410, 'Link disabled', '<p>This link has been disabled.</p>');
    case 'expired':
      return page(res, 410, 'Link expired', '<p>This link has expired.</p>');
    case 'limit_reached':
      return page(res, 410, 'Link unavailable', '<p>This link has reached its click limit.</p>');
    case 'password_required':
      return passwordPage(res, code);
    case 'wrong_password':
      return passwordPage(res, code, 'Incorrect password. Try again.');
    case 'redirect': {
      if (!isHead) {
        const { country, city } = lookupGeo(req.ip);
        pushClick({
          linkId: link._id,
          ownerId: link.ownerId,
          campaignId: link.campaignId || null,
          ts: new Date(),
          referrer: referrerOf(req),
          device: parsed.device,
          browser: parsed.browser,
          os: parsed.os,
          country,
          city,
          isBot: parsed.isBot, 
          visitorHash: visitorHash(req.ip, ua),
          counted: result.counted,
        });
      }

      return res.redirect(req.method === 'POST' ? 303 : 302, link.destination);
    }
  }
}

router.get('/:code', (req, res) => visit(req, res, null));
router.post('/:code/unlock', unlockLimiter, (req, res) => visit(req, res, String(req.body?.password ?? '')));

export default router;