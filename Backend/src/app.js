import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { initRedis, closeRedis } from '../config/redis.js';
import authRoutes from '../routes/auth.routes.js';
import linkRoutes from '../routes/link.routes.js';
import campaignRoutes from '../routes/campaign.routes.js';
import analyticsRoutes from '../routes/analytics.routes.js';
import adminRoutes from '../routes/admin.routes.js';
import redirectRoutes from '../routes/redirect.routes.js';
import { errorHandler, notFound } from '../middleware/error.js';
import { startClickFlusher, drainClicks } from '../services/clickBuffer.service.js';

const app = express();
const port = Number(process.env.PORT || 8080);
const allowedOrigins = (process.env.CLIENT_URLS || process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, callback) {
  if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not allowed by CORS'));
}, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
if (process.env.NODE_ENV !== 'test') app.use(morgan('tiny'));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'LinkPulse API' }));
app.use('/auth', authRoutes);
app.use('/links', linkRoutes);
app.use('/campaigns', campaignRoutes);
app.use('/analytics', analyticsRoutes);
app.use('/admin', adminRoutes);
// Redirect routes must come after API routes, because they match /:code.
app.use(redirectRoutes);
app.use(notFound);
app.use(errorHandler);

async function start() {
  if (!process.env.MONGO_DB_URI) throw new Error('MONGO_DB_URI is required. Copy .env.example to .env and configure MongoDB.');
  if (!process.env.JWT_SECRET && !process.env.access_token_secret) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET is required in production.');
    process.env.JWT_SECRET = 'local-development-secret-change-before-deploy';
  }
  await mongoose.connect(process.env.MONGO_DB_URI);
  console.log('MongoDB connected');
  initRedis();
  startClickFlusher();
  const server = app.listen(port, () => console.log(`LinkPulse API listening on http://localhost:${port}`));

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; shutting down...`);
    server.close(async () => {
      try { await drainClicks(); } catch (err) { console.error('Could not drain click buffer:', err.message); }
      await closeRedis();
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('Failed to start LinkPulse:', err.message);
  process.exit(1);
});

export default app;
