import { Router } from 'express';
import { z } from 'zod';
import Link from '../models/link.js';
import User from '../models/usermodel.js';
import Blocklist from '../models/blockList.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { invalidateLink } from '../services/cache.service.js';
import { overview } from '../services/analytics.service.js';
import { presentLink, escapeRegex } from '../utils/present.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParams = z.object({ id: objectId });
const disableSchema = z.object({ reason: z.string().trim().max(200).optional() });
const domainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((d) => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''))
    .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Enter a valid domain, e.g. bad-site.com')),
  reason: z.string().trim().max(200).optional(),
});
const statsQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(7) });


router.patch('/links/:id/disable', validate(idParams, 'params'), validate(disableSchema), async (req, res) => {
  const link = await Link.findById(req.valid.params.id);
  if (!link) throw new HttpError(404, 'Link not found');
  link.status = 'disabled';
  link.disabledBy = 'admin';
  link.disabledReason = req.valid.body.reason || 'Disabled by admin';
  await link.save();
  await invalidateLink(link.code);
  res.json({ link: presentLink(link) });
});

router.patch('/links/:id/enable', validate(idParams, 'params'), async (req, res) => {
  const link = await Link.findById(req.valid.params.id);
  if (!link) throw new HttpError(404, 'Link not found');
  link.status = 'active';
  link.disabledBy = null;
  link.disabledReason = null;
  await link.save();
  await invalidateLink(link.code);
  res.json({ link: presentLink(link) });
});

router.get('/blocklist', async (req, res) => {
  res.json({ items: await Blocklist.find().sort({ createdAt: -1 }).lean() });
});


router.post('/blocklist', validate(domainSchema), async (req, res) => {
  const { domain, reason } = req.valid.body;
  let entry;
  try {
    entry = await Blocklist.create({ domain, reason, addedBy: req.user.id });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Domain is already blocked');
    throw err;
  }

  const rx = new RegExp(`^https?://([^/]*\\.)?${escapeRegex(domain)}(:\\d+)?(/|\\?|#|$)`, 'i');
  const affected = await Link.find({ status: 'active', destination: rx }).select('code');
  if (affected.length) {
    await Link.updateMany(
      { _id: { $in: affected.map((l) => l._id) } },
      { status: 'disabled', disabledBy: 'admin', disabledReason: `Domain blocklisted: ${domain}` }
    );
    await Promise.all(affected.map((l) => invalidateLink(l.code)));
  }
  res.status(201).json({ entry, disabledLinks: affected.length });
});

router.delete('/blocklist/:id', validate(idParams, 'params'), async (req, res) => {
  const removed = await Blocklist.findByIdAndDelete(req.valid.params.id);
  if (!removed) throw new HttpError(404, 'Blocklist entry not found');
  res.json({ ok: true }); 
});

router.get('/users', async (req, res) => {
  res.json({ items: await User.find().sort({ createdAt: -1 }).select('username email role createdAt').lean() });
});


router.get('/stats', validate(statsQuery, 'query'), async (req, res) => {
  const [users, stats] = await Promise.all([User.countDocuments(), overview({ days: req.valid.query.days })]);
  res.json({ users, ...stats });
});

export default router;