import { Router } from 'express';
import bcrypt from 'bcryptjs';
import QRCode from 'qrcode';
import { z } from 'zod';
import Link from '../models/link.js';
import Campaign from '../models/Campaign.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/error.js';
import { validateDestination } from '../services/url.service.js';
import { validateAlias, generateCode } from '../services/code.service.js';
import { invalidateLink } from '../services/cache.service.js';
import { presentLink, escapeRegex } from '../utils/present.js';


const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParams = z.object({ id: objectId });

const destination = z.string().trim().min(1).max(2048);
const alias = z.string().trim().max(64).nullable().optional(); // empty/null -> auto-generate
const tags = z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]);
const expiresAt = z.coerce.date().nullable().optional();
const clickLimit = z.number().int().min(1).max(1_000_000).nullable().optional();
const password = z.string().min(4).max(72).nullable().optional();
const campaignId = objectId.nullable().optional();

const createSchema = z.object({ destination, alias, expiresAt, clickLimit, password, campaignId, tags });
const validateSchema = z.object({
  destination: z.string().max(4096),
  alias,
  expiresAt,
  clickLimit,
});
const updateSchema = z.object({
  destination: destination.optional(),
  expiresAt,
  clickLimit,
  password,
  campaignId,
  tags: tags.optional(),
  status: z.enum(['active', 'disabled']).optional(),
});
const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'disabled', 'expired', 'limit_reached']).optional(),
  campaignId: objectId.optional(),
  tag: z.string().trim().toLowerCase().optional(),
  q: z.string().trim().max(100).optional(),
  scope: z.enum(['own', 'all']).default('own'),
});
const qrQuery = z.object({
  format: z.enum(['png', 'svg']).default('png'),
  size: z.coerce.number().int().min(128).max(1024).default(300),
});


async function checkLinkInput({ destination: dest, alias: rawAlias, expiresAt: exp, clickLimit: limit }) {
  const errors = [];
  const warnings = [];

  const dv = await validateDestination(dest);
  dv.errors.forEach((message) => errors.push({ field: 'destination', message }));
  dv.warnings.forEach((message) => warnings.push({ field: 'destination', message }));

  let finalAlias = null;
  if (rawAlias) {
    const av = await validateAlias(rawAlias);
    if (!av.ok) errors.push({ field: 'alias', message: av.error });
    else finalAlias = av.alias;
  }

  if (exp) {
    const ms = exp.getTime() - Date.now();
    if (ms <= 0) errors.push({ field: 'expiresAt', message: 'Expiry must be in the future' });
    else if (ms < 3600_000) warnings.push({ field: 'expiresAt', message: 'This link will expire in under an hour' });
  }
  if (limit && limit < 5) {
    warnings.push({ field: 'clickLimit', message: 'Very low click limit: the link stops after only a few visits' });
  }
  return { errors, warnings, destination: dv.normalized, alias: finalAlias };
}

async function getAccessibleLink(id, user, { withPassword = false } = {}) {
  let q = Link.findById(id);
  if (withPassword) q = q.select('+passwordHash');
  const link = await q;
  
  if (!link || (user.role !== 'admin' && String(link.ownerId) !== user.id)) {
    throw new HttpError(404, 'Link not found');
  }
  return link;
}

async function assertCampaign(id, ownerId) {
  const c = await Campaign.findOne({ _id: id, ownerId }).select('_id').lean();
  if (!c) throw new HttpError(400, 'Campaign not found');
  return c._id;
}

const toDetails = (list) => list.map((e) => ({ path: e.field, message: e.message }));

router.post('/validate', validate(validateSchema), async (req, res) => {
  const check = await checkLinkInput(req.valid.body);
  res.json({
    ok: check.errors.length === 0,
    errors: check.errors,
    warnings: check.warnings,
    normalizedDestination: check.destination ?? null,
  });
});

router.post('/', createLimiter, validate(createSchema), async (req, res) => {
  const input = req.valid.body;
  const check = await checkLinkInput(input);
  if (check.errors.length) {
    return res.status(400).json({ error: 'Validation failed', details: toDetails(check.errors) });
  }

  const campaign = input.campaignId ? await assertCampaign(input.campaignId, req.user.id) : null;
  const code = check.alias || (await generateCode());

  try {
    const link = await Link.create({
      code,
      destination: check.destination,
      ownerId: req.user.id,
      campaignId: campaign,
      tags: [...new Set(input.tags)],
      expiresAt: input.expiresAt ?? null,
      clickLimit: input.clickLimit ?? null,
      hasPassword: !!input.password,
      passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
    });
    res.status(201).json({ link: presentLink(link), warnings: check.warnings });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'Alias is already taken'); // lost a race
    throw err;
  }
});

router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const { page, limit, status, campaignId: cid, tag, q, scope } = req.valid.query;
  const now = new Date();
  const reached = { $and: [{ $gt: ['$clickLimit', null] }, { $gte: ['$clickCount', '$clickLimit'] }] };

  const filter = {};
  if (!(req.user.role === 'admin' && scope === 'all')) filter.ownerId = req.user.id;
  if (cid) filter.campaignId = cid;
  if (tag) filter.tags = tag;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ code: rx }, { destination: rx }];
  }
  if (status === 'disabled') filter.status = 'disabled';
  if (status === 'expired') Object.assign(filter, { status: 'active', expiresAt: { $lte: now } });
  if (status === 'limit_reached') Object.assign(filter, { status: 'active', $expr: reached });
  if (status === 'active') {
    filter.status = 'active';
    filter.$and = [
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      { $expr: { $not: [reached] } },
    ];
  }

  const [items, total] = await Promise.all([
    Link.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Link.countDocuments(filter),
  ]);
  res.json({ items: items.map(presentLink), page, limit, total });
});

router.get('/:id', validate(idParams, 'params'), async (req, res) => {
  res.json({ link: presentLink(await getAccessibleLink(req.valid.params.id, req.user)) });
});

router.patch('/:id', validate(idParams, 'params'), validate(updateSchema), async (req, res) => {
  const link = await getAccessibleLink(req.valid.params.id, req.user);
  const b = req.valid.body;
  const isAdmin = req.user.role === 'admin';

  if (b.destination !== undefined) {
    const dv = await validateDestination(b.destination);
    if (!dv.ok) {
      return res.status(400).json({
        error: 'Validation failed',
        details: dv.errors.map((message) => ({ path: 'destination', message })),
      });
    }
    link.destination = dv.normalized;
  }
  if (b.expiresAt !== undefined) {
    if (b.expiresAt && b.expiresAt.getTime() <= Date.now()) {
      throw new HttpError(400, 'Validation failed', [{ path: 'expiresAt', message: 'Expiry must be in the future' }]);
    }
    link.expiresAt = b.expiresAt;
  }
  if (b.clickLimit !== undefined) link.clickLimit = b.clickLimit;
  if (b.tags !== undefined) link.tags = [...new Set(b.tags)];
  if (b.campaignId !== undefined) {
    link.campaignId = b.campaignId ? await assertCampaign(b.campaignId, link.ownerId) : null;
  }
  if (b.password !== undefined) {
    link.hasPassword = !!b.password;
    link.passwordHash = b.password ? await bcrypt.hash(b.password, 10) : null;
  }
  if (b.status === 'disabled') {
    link.status = 'disabled';
    link.disabledBy = isAdmin ? 'admin' : 'owner';
  } else if (b.status === 'active') {
    if (link.disabledBy === 'admin' && !isAdmin) throw new HttpError(403, 'This link was disabled by an admin');
    link.status = 'active';
    link.disabledBy = null;
    link.disabledReason = null;
  }

  await link.save();
  await invalidateLink(link.code);
  res.json({ link: presentLink(link) });
});


router.get('/:id/qr', validate(idParams, 'params'), validate(qrQuery, 'query'), async (req, res) => {
  const link = await getAccessibleLink(req.valid.params.id, req.user);
  const { format, size } = req.valid.query;
  const baseUrl = (process.env.baseUrl || process.env.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
  const target = `${baseUrl}/${link.code}?src=qr`;
  res.set('Content-Disposition', `inline; filename="${link.code}.${format}"`);
  if (format === 'svg') {
    res.type('image/svg+xml').send(await QRCode.toString(target, { type: 'svg', margin: 2 }));
  } else {
    res.type('image/png').send(await QRCode.toBuffer(target, { width: size, margin: 2 }));
  }
});

export default router;