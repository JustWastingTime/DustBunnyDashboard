# Uma Club Dashboard

Online club performance dashboard for Dust Bunny, Dirt Bunny, Damp Bunny, and Dusk Bunny.

- **Public:** overview charts/members at `/`, applications at `/apply`
- **Tournaments:** Discord login at `/tourney` — rostered players pick Umas by round (managers can edit all)
- **Staff:** Discord login at `/staff` — applicants, planner, tournaments, blacklist, club settings
- **Local:** optional SQLite management app (`npm run dev`) for offline planner/settings/publish

## Online stack (Vercel free)

- Vite React frontend
- Vercel serverless API routes under `api/`
- Neon Postgres for applicants (`DATABASE_URL`)
- Discord OAuth for managers (`config/access.json` ACL)
- Live uma.moe reads via `UMA_API_KEY` (never exposed to the browser)

## Deploy to Vercel

1. Create a free [Neon](https://neon.tech) Postgres database and copy the connection string.
2. Create a Discord application at <https://discord.com/developers/applications>:
   - OAuth2 → Redirects: `https://YOUR_DOMAIN/api/auth/callback`
   - Copy Client ID and Client Secret
3. Put your Discord user ID in `config/access.json` (replace the placeholder).
4. Import the repo into Vercel. Set env vars:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon connection string |
| `DISCORD_CLIENT_ID` | Discord app client ID |
| `DISCORD_CLIENT_SECRET` | Discord app client secret |
| `SESSION_SECRET` | Long random string for JWT cookies |
| `UMA_API_KEY` | uma.moe API key |
| `SITE_URL` | Canonical site URL, e.g. `https://your-app.vercel.app` |
| `DISCORD_APPLY_WEBHOOK_URL` | Optional. Discord webhook URL for the applications channel — posts an embed (+ 30-day chart) on each apply |

5. Deploy. Open `/` for the overview, `/apply` to submit, `/staff` to manage, `/tourney` for tournament picks.

To get the webhook URL: Discord channel → Edit Channel → Integrations → Webhooks → New Webhook → Copy Webhook URL.

Local online preview (after `npm i -g vercel` and env vars in `.env`):

```bash
npm run dev:online
```

## Local SQLite workspace

Still available for transfer planning, club settings, and GitHub Pages publish:

1. Copy `.env.sample` to `.env` and set `UMA_API_KEY`.
2. `npm install`
3. `npm run dev` → <http://127.0.0.1:5173>

## Commands

- `npm run dev` — local SQLite API + management UI
- `npm run dev:online` — Vercel-style local API + online UI
- `npm run build:vercel` — production frontend for Vercel
- `npm run build:public` — static GitHub Pages build
- `npm test` / `npm run typecheck`

## Privacy

Public responses include Uma IDs, IGNs, club targets, statuses, and performance.
They never include Discord IDs, Discord usernames, private notes, or secrets.
Staff-only APIs require an allowlisted Discord session.

## Favicon

Tab icon: `public/favicon.svg`. Home-screen / iOS icon: `public/apple-touch-icon.png`. Forks should replace both.

## Hosting your own club network

This app is meant to be forked. Bunny-specific names live in config and a few asset files — you do **not** need to rename code like `bunnyHistoryStints`. That helper just means “stints inside the clubs listed in `config/clubs.json`.”

1. **Clubs** — replace `config/clubs.json` with your uma.moe circle IDs, display names, daily targets, and whether promotion is enabled.
2. **Managers** — put your Discord user IDs and those circle IDs in `config/access.json`.
3. **Branding** — edit `config/site.json` (`siteTitle`, `siteName`, `networkName`, `description`, `publicEyebrow`, apply copy, Discord webhook footer, tenure note). Also update `index.html` title/description for the first paint before JS loads.
4. **Icons** — replace `public/favicon.svg` and `public/apple-touch-icon.png`.
5. **Session cookie** — change `sessionCookie` in `config/site.json` so logins do not collide with another network’s site.
6. **Env** — your own Neon `DATABASE_URL`, Discord OAuth app + callback URL, `SESSION_SECRET`, `UMA_API_KEY`, `SITE_URL`, optional apply webhook.
7. **GitHub Pages (optional)** — `vite.config.ts` uses the repo name as the base path; the local fallback is `/DustBunnyDashboard/`. Rename the repo or change that fallback.
8. **Planner colors** — transfer tags still tint Dust / Dirt / Damp / Dusk by club **name**. Other names use a generic “other” color unless you add CSS in `src/App.css`.
9. **Do not copy** — Bunny `access.json` IDs, Neon data, Discord secrets, or uma.moe keys. `public-data/input.json` is a Bunny snapshot for the static Pages build; regenerate it with `npm run sync:public` after you change clubs.

Tenure still treats every club in `config/clubs.json` as one network (transfers inside the list do not reset; gaps outside it do not count).

