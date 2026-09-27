# Preschool SaaS API (backend)

Fastify + TypeScript + Drizzle + PostgreSQL. Multi-tenant: every row carries `tenant_id`, resolved from `X-Tenant-Slug` + membership check.

## Run

```bash
# from repo root — starts Postgres :5434 + Adminer :8080
docker compose up -d

cd backend
npm install
npm run db:generate   # creates drizzle/ migration from schema
npm run db:migrate
npm run db:seed       # 3 demo schools + demo logins (password: sprouts123)
npm run dev           # :4000
```

DB viewer: http://localhost:8080 (server `postgres`, user `preschool`, pass `preschool`, db `preschool`) or `npm run db:studio`.

## Auth

- `POST /auth/signup {name,email,password,schoolName}` → creates user + tenant + profile + options + Admin membership → `{accessToken, tenant}`
- `POST /auth/login {email,password}` → `{accessToken, tenants[]}`
- Access JWT 15m (`Authorization: Bearer`), refresh in httpOnly cookie. Send `X-Tenant-Slug` on all domain calls.

## Endpoints

`/health`, `/auth/*`, `/tenants/mine|/profile`, `/options`, `/classes`, `/students`, `/teachers`, `/attendance`, `/invoices`, `/events`, `/announcements`, `/enquiries`
