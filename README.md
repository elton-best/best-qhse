# LOGIQUALI / BestQHSE

Plateforme QHSE multi-normes (ISO 9001, 14001, 45001, 27001, 22000, 50001).

## Architecture

- `src/` : frontend React (TanStack Start, TanStack Router/Query, Tailwind v4, shadcn/ui).
- `backend/` : API Laravel (PHP 8, PostgreSQL), exposée sous `/api/v1`.
- `frontend1/` : ancien frontend Vue, conservé pour référence uniquement.

## Développement

Prérequis : Node.js 22+, PHP 8.3+, PostgreSQL 16.

Stack locale complète (Postgres 55432, Laravel 8000, Vite 5173) :

```sh
bash scripts/dev-servers.sh
```

Ou séparément :

```sh
# Frontend
npm install
npm run dev        # proxy /api vers BACKEND_URL (défaut http://127.0.0.1:8000)

# Backend
cd backend
composer install
php artisan migrate
php artisan serve
```

## Vérifications

```sh
npm run lint
npm test
npm run build
cd backend && php artisan test
```

Configuration locale : copier `.env.example` vers `.env` (frontend) et adapter `backend/.env`.
