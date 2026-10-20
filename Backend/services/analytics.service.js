import mongoose from 'mongoose';
import ClickEvent from '../models/ClickEvent.js';
import Link from '../models/link.js';
import Campaign from '../models/Campaign.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));


function sinceDate(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

function fillDays(days, series) {
  const byDay = new Map(series.map((s) => [s._id, s.clicks]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date, clicks: byDay.get(date) || 0 });
  }
  return out;
}

const named = (arr) => arr.map((x) => ({ name: x._id, clicks: x.clicks }));

function clickFacets() {
  const top = (field) => [
    { $match: { isBot: false } },
    { $group: { _id: { $ifNull: [`$${field}`, 'Unknown'] }, clicks: { $sum: 1 } } },
    { $sort: { clicks: -1 } },
    { $limit: 10 },
  ];
  return {
    totals: [{ $group: { _id: '$isBot', clicks: { $sum: 1 } } }],
    uniques: [{ $match: { isBot: false } }, { $group: { _id: '$visitorHash' } }, { $count: 'n' }],
    timeseries: [
      { $match: { isBot: false } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$ts' } }, clicks: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ],
    referrers: top('referrer'),
    devices: top('device'),
    browsers: top('browser'),
    countries: top('country'),
  };
}

function shape(f, days) {
  return {
    period: { days },
    clicks: f.totals.find((t) => t._id === false)?.clicks ?? 0,
    botClicks: f.totals.find((t) => t._id === true)?.clicks ?? 0,
    uniqueVisitors: f.uniques[0]?.n ?? 0,
    timeseries: fillDays(days, f.timeseries),
    referrers: named(f.referrers),
    devices: named(f.devices),
    browsers: named(f.browsers),
    countries: named(f.countries),
  };
}

export async function linkStats(linkId, days = 7) {
  const [f] = await ClickEvent.aggregate([
    { $match: { linkId: oid(linkId), ts: { $gte: sinceDate(days) } } },
    { $facet: clickFacets() },
  ]);
  return shape(f, days);
}


export async function overview({ ownerId = null, campaignId = null, days = 7 } = {}) {
  const clickMatch = { ts: { $gte: sinceDate(days) } };
  if (ownerId) clickMatch.ownerId = oid(ownerId);
  if (campaignId) clickMatch.campaignId = oid(campaignId);

  const facets = {
    ...clickFacets(),
    topLinks: [
      { $match: { isBot: false } },
      { $group: { _id: '$linkId', clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: 5 },
    ],
    campaigns: [
      { $match: { isBot: false, campaignId: { $ne: null } } },
      { $group: { _id: '$campaignId', clicks: { $sum: 1 } } },
      { $sort: { clicks: -1 } },
      { $limit: 10 },
    ],
  };
  const [f] = await ClickEvent.aggregate([{ $match: clickMatch }, { $facet: facets }]);

 
  const linkDocs = await Link.find({ _id: { $in: f.topLinks.map((x) => x._id) } })
    .select('code destination status')
    .lean();
  const linkById = new Map(linkDocs.map((l) => [String(l._id), l]));
  const campDocs = await Campaign.find({ _id: { $in: f.campaigns.map((x) => x._id) } })
    .select('name')
    .lean();
  const campById = new Map(campDocs.map((c) => [String(c._id), c]));

 
  const linkFilter = {};
  if (ownerId) linkFilter.ownerId = ownerId;
  if (campaignId) linkFilter.campaignId = campaignId;
  const now = new Date();
  const weekAhead = new Date(Date.now() + 7 * 86400000);
  const reached = { $and: [{ $gt: ['$clickLimit', null] }, { $gte: ['$clickCount', { $multiply: ['$clickLimit', 0.8] }] }] };
  const pick = 'code destination expiresAt clickLimit clickCount disabledReason';

  const [total, disabled, expired, expiringSoon, limitAlerts, recentlyDisabled] = await Promise.all([
    Link.countDocuments(linkFilter),
    Link.countDocuments({ ...linkFilter, status: 'disabled' }),
    Link.countDocuments({ ...linkFilter, status: 'active', expiresAt: { $lte: now } }),
    Link.find({ ...linkFilter, status: 'active', expiresAt: { $gt: now, $lte: weekAhead } })
      .sort({ expiresAt: 1 }).limit(5).select(pick).lean(),
    Link.find({ ...linkFilter, status: 'active', $expr: reached })
      .sort({ updatedAt: -1 }).limit(5).select(pick).lean(),
    Link.find({ ...linkFilter, status: 'disabled' }).sort({ updatedAt: -1 }).limit(5).select(pick).lean(),
  ]);

  return {
    ...shape(f, days),
    links: { total, active: total - disabled - expired, disabled, expired },
    topLinks: f.topLinks.map((x) => ({
      id: String(x._id),
      code: linkById.get(String(x._id))?.code ?? null,
      destination: linkById.get(String(x._id))?.destination ?? null,
      clicks: x.clicks,
    })),
    campaigns: f.campaigns.map((x) => ({
      id: String(x._id),
      name: campById.get(String(x._id))?.name ?? 'Unknown',
      clicks: x.clicks,
    })),
    alerts: { expiringSoon, limitAlerts, recentlyDisabled },
  };
}