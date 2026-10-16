# AGENTS.md

## Stack

- `src/` : frontend React (TanStack Start + TanStack Router/Query, Tailwind v4, shadcn/ui). Config Vite dans `vite.config.ts`.
- `backend/` : API Laravel (PHP 8, PostgreSQL) — source de données unique, exposée sous `/api/v1`.
- `frontend1/` : ancien frontend Vue (legacy, conservé pour référence).

## Commandes

- Frontend : `npm run dev` (Vite, proxy `/api` vers `BACKEND_URL`, défaut `http://127.0.0.1:8000`), `npm run build`, `npm run lint`, `npm test`.
- Stack locale complète : `bash scripts/dev-servers.sh` (Postgres 55432, Laravel 8000, Vite 5173).
- Backend : `php artisan serve` puis `php artisan test` depuis `backend/`.

## Conventions

- Appels API via `src/integrations/backend/*` uniquement, pas de fetch direct dans les composants.
- Alias `@/` vers `src/`. Ne pas importer de code serveur (`server-only`, `**/server/**`) côté client.
