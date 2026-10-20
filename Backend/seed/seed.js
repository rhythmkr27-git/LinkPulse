import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/usermodel.js';
import Campaign from '../models/Campaign.js';
import Link from '../models/link.js';
import ClickEvent from '../models/ClickEvent.js';

const uri = process.env.MONGO_DB_URI || 'mongodb://127.0.0.1:27017/linkpulse';
const reset = process.argv.includes('--reset');
if (process.env.NODE_ENV === 'production' && reset) {
  console.error('Refusing destructive --reset in production.'); process.exit(1);
}
await mongoose.connect(uri);
try {
  if (reset) await Promise.all([User.deleteMany({}), Campaign.deleteMany({}), Link.deleteMany({}), ClickEvent.deleteMany({})]);
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
  const demoPassword = process.env.SEED_DEMO_PASSWORD || 'Demo@12345';
  let admin = await User.findOne({ email: 'admin@linkpulse.dev' });
  if (!admin) admin = await User.create({ username: 'admin', email: 'admin@linkpulse.dev', passwordHashed: await bcrypt.hash(adminPassword, 10), role: 'admin' });
  let demo = await User.findOne({ email: 'demo@linkpulse.dev' });
  if (!demo) demo = await User.create({ username: 'demo', email: 'demo@linkpulse.dev', passwordHashed: await bcrypt.hash(demoPassword, 10), role: 'user' });

  const campaignSpecs = [
    { name: 'Summer Launch', description: 'Social and email campaign links.' },
    { name: 'Product Docs', description: 'Documentation and onboarding links.' },
  ];
  const campaigns = {};
  for (const spec of campaignSpecs) {
    campaigns[spec.name] = await Campaign.findOneAndUpdate({ ownerId: demo._id, name: spec.name }, { $setOnInsert: { ...spec, ownerId: demo._id } }, { upsert: true, new: true });
  }
  const samples = [
    { code: 'summer-sale', destination: 'https://example.com/summer-sale', campaignId: campaigns['Summer Launch']._id, tags: ['promo', 'social'] },
    { code: 'docs-hub', destination: 'https://example.com/docs', campaignId: campaigns['Product Docs']._id, tags: ['docs'] },
    { code: 'secret-deck', destination: 'https://example.com/investor-deck', campaignId: null, tags: ['private'], password: 'demo123' },
  ];
  for (const sample of samples) {
    const existing = await Link.findOne({ code: sample.code });
    if (existing) continue;
    await Link.create({ code: sample.code, destination: sample.destination, ownerId: demo._id, campaignId: sample.campaignId, tags: sample.tags, hasPassword: !!sample.password, passwordHash: sample.password ? await bcrypt.hash(sample.password, 10) : null });
  }
  console.log('Seed completed.');
  console.log(`Admin login: admin / ${adminPassword}`);
  console.log(`Demo login: demo / ${demoPassword}`);
  console.log('Password-protected link: /secret-deck (password: demo123)');
  console.log(reset ? 'Database was reset before seeding.' : 'Existing data was preserved; missing demo records were added.');
} finally {
  await mongoose.disconnect();
}
