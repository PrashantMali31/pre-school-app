# Pre-School SaaS (monorepo)

- `frontend/` — Next.js 16 app (moved as-is, builds clean). API client at `src/lib/api.ts`, backend URL via `NEXT_PUBLIC_API_URL`.
- `backend/` — Fastify + TypeScript + Drizzle + PostgreSQL SaaS API. See `backend/README.md`.
- `docker-compose.yml` — Postgres `:5434` + Adminer DB viewer `:8080`.

## Quickstart

```bash
docker compose up -d            # postgres + viewer
cd backend && npm install && cp .env.example .env   # set DATABASE_URL + TEST_DATABASE_URL + JWT_SECRET
# create the test DB once: psql "$DATABASE_URL" -c "CREATE DATABASE preschool_test;"
npm run db:generate && npm run db:migrate && npm run db:seed && npm run dev   # :4000 (in backend/)
npm test                        # in backend/; needs TEST_DATABASE_URL=.../preschool_test
cd ../frontend && cp .env.example .env.local && npm run dev      # :3000
```

Note: `POST /auth/signup` returns **201** on success (`{accessToken, tenant}`).

Demo logins (password `sprouts123`): `demo@little-sprouts.in`, `demo@sunshine-kids.in`, `demo@rainbow-preschool.in`.

> Note: an older `preschool-postgres` container (Prisma schema, `:5433`) already existed on this machine — left untouched. The new stack uses `preschool-pg-saas` on `:5434`.
