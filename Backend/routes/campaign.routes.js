import { Router } from 'express';
import { z } from 'zod';
import Campaign from '../models/Campaign.js';
import Link from '../models/link.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { overview } from '../services/analytics.service.js';

const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParams = z.object({ id: objectId });
const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).optional(),
});
const listQuery = z.object({ scope: z.enum(['own', 'all']).default('own') });
const statsQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(7) });

router.post('/', validate(createSchema), async (req, res) => {
  try {
    const campaign = await Campaign.create({ ...req.valid.body, ownerId: req.user.id });
    res.status(201).json({ campaign });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, 'You already have a campaign with this name');
    throw err;
  }
});

router.get('/', validate(listQuery, 'query'), async (req, res) => {
  const filter = req.user.role === 'admin' && req.valid.query.scope === 'all' ? {} : { ownerId: req.user.id };
  const campaigns = await Campaign.find(filter).sort({ createdAt: -1 }).lean();
  const counts = await Link.aggregate([
    { $match: { campaignId: { $in: campaigns.map((c) => c._id) } } },
    { $group: { _id: '$campaignId', links: { $sum: 1 } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c.links]));
  res.json({ items: campaigns.map((c) => ({ ...c, linkCount: byId.get(String(c._id)) || 0 })) });
});


router.get('/:id/stats', validate(idParams, 'params'), validate(statsQuery, 'query'), async (req, res) => {
  const campaign = await Campaign.findById(req.valid.params.id).lean();
  if (!campaign || (req.user.role !== 'admin' && String(campaign.ownerId) !== req.user.id)) {
    throw new HttpError(404, 'Campaign not found');
  }
  const stats = await overview({ campaignId: String(campaign._id), days: req.valid.query.days });
  res.json({ campaign, ...stats });
});

export default router;

