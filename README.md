# Uma Club Dashboard

A local management workspace for three Uma Musume clubs and a sanitized,
read-only dashboard deployed to GitHub Pages.

The local application owns applicants, private notes, thresholds, historical
snapshots, and transfer plans in SQLite. Only an explicit public allowlist is
published. Tazuna, Discord IDs, and Discord credentials are not integrated.

## Requirements

- Node.js 22 or newer
- A separate uma.moe API key
- Optional fine-grained GitHub token with Contents write access to only the
  dashboard repository

## Local setup

1. Copy `.env.sample` to `.env` and set `UMA_API_KEY`.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open <http://127.0.0.1:5173>.

The API listens only on `127.0.0.1:4174`. Runtime data is written beneath
`data/`, which is ignored by Git.

## Workflow

1. Add each club by its uma.moe circle ID and set its daily requirement.
2. Add applicants by uma ID, target club, status, and optional private note.
3. Select **Refresh data** to store current members and daily snapshots.
4. Use the planner to draft club moves. Confirmation records the plan; it does
   not transfer players in game.
5. Preview the exact sanitized publication, then publish it.

If GitHub publication variables are configured, publishing updates
`public-data/input.json` through the GitHub Contents API. Otherwise the local
copy is updated for review.

## GitHub Pages

1. Add `UMA_API_KEY` as an Actions repository secret.
2. In repository settings, set Pages source to **GitHub Actions**.
3. Push the repository and run **Refresh and deploy dashboard**.

The workflow refreshes public club/applicant performance every three hours.
When the local computer is offline, Pages continues serving its last successful
snapshot.

## Commands

- `npm run dev` — local API and management UI
- `npm test` — calculation, validation, and redaction tests
- `npm run typecheck` — frontend and backend type checks
- `npm run build:public` — static GitHub Pages build
- `npm run sync:public` — refresh public data from sanitized input
- `npm run backup` — create a consistent SQLite backup

## Privacy boundary

Public output may contain uma IDs, IGNs, target clubs, application statuses,
and public performance. It rejects fields resembling Discord IDs, tokens,
secrets, notes, local paths, or database records. Rejected applicants remain
public until removed or their publishing toggle is disabled.
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
