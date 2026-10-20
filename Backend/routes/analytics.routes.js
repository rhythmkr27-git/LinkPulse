import { Router } from 'express';
import { z } from 'zod';
import Link from '../models/link.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { overview, linkStats } from '../services/analytics.service.js';
import { presentLink } from '../utils/present.js';

const router = Router();
router.use(requireAuth);

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const days = z.coerce.number().int().min(1).max(365).default(7);

const overviewQuery = z.object({
  days,
  campaignId: objectId.optional(),
  scope: z.enum(['own', 'all']).default('own'),
});


router.get('/overview', validate(overviewQuery, 'query'), async (req, res) => {
  const { days: d, campaignId, scope } = req.valid.query;
  const ownerId = req.user.role === 'admin' && scope === 'all' ? null : req.user.id;
  res.json(await overview({ ownerId, campaignId: campaignId ?? null, days: d }));
});

router.get(
  '/links/:id',
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ days }), 'query'),
  async (req, res) => {
    const link = await Link.findById(req.valid.params.id);
    if (!link || (req.user.role !== 'admin' && String(link.ownerId) !== req.user.id)) {
      throw new HttpError(404, 'Link not found');
    }
    res.json({ link: presentLink(link), ...(await linkStats(link._id, req.valid.query.days)) });
  }
);

export default router;