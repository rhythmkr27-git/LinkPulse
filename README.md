# LinkPulse — URL Shortener & Analytics

LinkPulse is a URL shortener with user accounts, custom aliases, expiry rules, click limits, password-protected links, campaigns, tags, QR codes, and analytics backed by MongoDB.

## Requirements

- Node.js 22 or newer
- MongoDB local instance or MongoDB Atlas database
- npm
- Redis is optional (the app works without it)

## 1. Configure the backend

```bash
cd Backend
cp .env.example .env
```

Edit `Backend/.env` and set `MONGO_DB_URI` and a long random `JWT_SECRET`. Keep `NODE_ENV=development` for local testing. The default local database URI is `mongodb://127.0.0.1:27017/linkpulse`.

Install dependencies and start the API:

```bash
npm install
npm run dev
```

The API should respond at `http://localhost:8080/health` with `{ "status": "ok", "service": "LinkPulse API" }`.

## 2. Configure the frontend

In a second terminal:

```bash
cd Frontend
cp .env.example .env
npm install
npm run dev
```

Open the Vite URL shown in the terminal (normally `http://localhost:5173`). The frontend uses `VITE_API_URL=http://localhost:8080` by default.

## 3. Optional demo data

With the backend `.env` configured and MongoDB running:

```bash
cd Backend
npm run seed
```

This adds demo accounts, campaigns and links without deleting existing data. Demo credentials for a fresh database:

- Demo user: `demo` / `Demo@12345`
- Admin: `admin` / `Admin@123`
- Password-protected short link: `/secret-deck`, password `demo123`

For a disposable local database only, `node seed/seed.js --reset` clears LinkPulse collections before adding the demo records. Never use `--reset` against production data. Set `SEED_ADMIN_PASSWORD` and `SEED_DEMO_PASSWORD` before seeding if you want different demo passwords.

## Core workflow

1. Register or log in.
2. Create a campaign (optional).
3. Create a short link with an optional alias, expiry, click limit, password and tags.
4. Copy/open the short URL; the backend evaluates its status and redirect rules.
5. View click totals, daily traffic, top links, referrers and devices in the dashboard.
6. Disable a link from the link table; disabled links stop redirecting while event history remains stored.

## Deployment notes

- Set `NODE_ENV=production`, `JWT_SECRET`, `MONGO_DB_URI`, `baseUrl` (public backend short-link domain), and `CLIENT_URLS` (comma-separated allowed frontend origins).
- HTTPS is required for cross-site secure cookies in production.
- Never commit `.env` files or credentials.
- Redis is optional; configure `REDIS_URL2` only if you have a Redis service.
- Geolocation depends on the local GeoIP database and may be unavailable or approximate.

## Important limitations

This codebase implements the primary link lifecycle and dashboard workflows. Bulk CSV import, link-in-bio pages, device-targeted redirects, custom domains, a public API-key system and a dedicated admin UI are not included in this iteration. Test the deployment, MongoDB connection, cookie behavior and click-limit concurrency in your own environment before presenting it as production-ready.
