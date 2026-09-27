import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '../../db/client';
import { memberships, passwordResets, refreshTokens, schoolOptions, schoolProfiles, tenants, users } from '../../db/schema';
import { hashPassword, newRefreshToken, sha256, slugify, verifyPassword } from '../../utils/security';
import { DEFAULT_OPTIONS } from '../../utils/defaults';
import { requireAuth } from '../../middlewares/tenant';

const forgotSchema = z.object({
  email: z.string().trim().email().max(100),
});

const resetSchema = z.object({
  token: z.string().trim().min(1),
  password: z.string().min(6).max(72),
});

const signupSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(100),
  password: z.string().min(6).max(72),
  schoolName: z.string().trim().min(2).max(60),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(100),
  password: z.string().min(1),
});

const isProd = () => process.env.NODE_ENV === 'production';
// Shared refresh-cookie options: httpOnly + lax + path /, secure only in prod
// (secure cookies over http://localhost would never be sent back in dev).
const refreshCookieOpts = () => ({
  httpOnly: true as const,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 30 * 24 * 3600,
  secure: isProd(),
});

// Stricter per-route limit for auth abuse targets (global is 200/min in app.ts).
const STRICT_LIMIT = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

async function issueTokens(app: FastifyInstance, userId: string, email: string) {
  const accessToken = app.jwt.sign({ sub: userId, email });
  const refresh = newRefreshToken();
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: sha256(refresh),
    expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
  });
  return { accessToken, refresh };
}

// Keep at most `keep` newest refresh tokens per user (by createdAt desc).
async function pruneUserTokens(userId: string, keep = 10) {
  const rows = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(eq(refreshTokens.userId, userId))
    .orderBy(desc(refreshTokens.createdAt));
  if (rows.length <= keep) return;
  for (const stale of rows.slice(keep)) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, stale.id));
  }
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/signup', async (req, reply) => {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const email = parsed.data.email.toLowerCase();
    const exists = await db.select().from(users).where(eq(users.email, email)).then((r) => r[0]);
    if (exists) return reply.code(409).send({ error: { code: 'EMAIL_TAKEN', message: 'Account already exists. Please log in.' } });

    // unique slug
    const base = slugify(parsed.data.schoolName);
    let slug = base;
    let n = 2;
    while (await db.select().from(tenants).where(eq(tenants.slug, slug)).then((r) => r[0])) slug = `${base}-${n++}`;

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await db.insert(users).values({ email, name: parsed.data.name.trim(), passwordHash }).returning().then((r) => r[0]);
    const tenant = await db.insert(tenants).values({ slug, name: parsed.data.schoolName.trim(), plan: 'Starter' }).returning().then((r) => r[0]);
    await db.insert(schoolProfiles).values({ tenantId: tenant.id, name: tenant.name, principal: user.name });
    await db.insert(schoolOptions).values({ tenantId: tenant.id, ...DEFAULT_OPTIONS });
    await db.insert(memberships).values({ userId: user.id, tenantId: tenant.id, role: 'Admin' });
    // Every school rides a subscription: free Starter from day one.
    const { startSubscription } = await import('../billing/routes.js');
    await startSubscription(tenant.id, 'starter', 'monthly', user.id);

    const { accessToken, refresh } = await issueTokens(app, user.id, user.email);
    reply.setCookie('refresh_token', refresh, refreshCookieOpts());
    return reply.code(201).send({ accessToken, user: { id: user.id, name: user.name, email: user.email }, tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, plan: tenant.plan } });
  });

  app.post('/login', STRICT_LIMIT, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const email = parsed.data.email.toLowerCase();
    const user = await db.select().from(users).where(eq(users.email, email)).then((r) => r[0]);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return reply.code(401).send({ error: { code: 'BAD_CREDENTIALS', message: 'Incorrect email or password.' } });
    }
    const mems = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    if (mems.length === 0) return reply.code(403).send({ error: { code: 'NO_SCHOOL', message: 'Account has no school. Please sign up again.' } });
    const { accessToken, refresh } = await issueTokens(app, user.id, user.email);
    await pruneUserTokens(user.id);
    reply.setCookie('refresh_token', refresh, refreshCookieOpts());
    const tenantRows = await Promise.all(mems.map(async (m) => db.select().from(tenants).where(eq(tenants.id, m.tenantId)).then((r) => ({ ...r[0], role: m.role }))));
    return { accessToken, user: { id: user.id, name: user.name, email: user.email }, tenants: tenantRows };
  });

  app.post('/refresh', async (req, reply) => {
    // Opportunistic hygiene: sweep all expired refresh tokens (cheap single query).
    await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
    const raw = (req.cookies as Record<string, string | undefined>)['refresh_token'];
    if (!raw) return reply.code(401).send({ error: { code: 'NO_REFRESH', message: 'Missing refresh token.' } });
    const row = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(raw))).then((r) => r[0]);
    if (!row || row.expiresAt < new Date()) return reply.code(401).send({ error: { code: 'EXPIRED', message: 'Session expired. Please log in.' } });
    const user = await db.select().from(users).where(eq(users.id, row.userId)).then((r) => r[0]);
    if (!user) return reply.code(401).send({ error: { code: 'NO_USER', message: 'Please log in again.' } });
    await db.delete(refreshTokens).where(eq(refreshTokens.id, row.id));
    const { accessToken, refresh } = await issueTokens(app, user.id, user.email);
    await pruneUserTokens(user.id);
    reply.setCookie('refresh_token', refresh, refreshCookieOpts());
    return { accessToken };
  });

  app.post('/logout', { preHandler: requireAuth }, async (req, reply) => {
    const raw = (req.cookies as Record<string, string | undefined>)['refresh_token'];
    if (raw) await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, sha256(raw)));
    reply.clearCookie('refresh_token', { path: '/', sameSite: 'lax', httpOnly: true, secure: isProd() });
    return { ok: true };
  });

  app.post('/logout-all', { preHandler: requireAuth }, async (req) => {
    // Revokes ALL refresh tokens for this user (all devices). The current access
    // token is short-lived and stays valid until expiry — the client discards it.
    const userId = (req.user as { sub: string }).sub;
    const deleted = await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId)).returning({ id: refreshTokens.id });
    return { ok: true, revoked: deleted.length };
  });

  app.post('/forgot', STRICT_LIMIT, async (req, reply) => {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const email = parsed.data.email.toLowerCase();
    const user = await db.select().from(users).where(eq(users.email, email)).then((r) => r[0]);
    if (user) {
      const raw = crypto.randomBytes(32).toString('hex');
      await db.insert(passwordResets).values({
        userId: user.id,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + 3600 * 1000),
      });
      const base = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      const resetLink = `${base}/reset?token=${raw}`;
      // Dev stand-in for email: log the link server-side only (never return it).
      // To plug a real provider later (Resend/SES via env SMTP_KEY):
      //   await mailer.send({ to: email, subject: 'Reset your password', html: `<a href="${resetLink}">Reset password</a>` });
      console.log(`[password-reset] ${email} -> ${resetLink}`);
    }
    // Always neutral: never reveal whether the email exists.
    return { ok: true };
  });

  app.post('/reset', STRICT_LIMIT, async (req, reply) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const row = await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, sha256(parsed.data.token))).then((r) => r[0]);
    if (!row || row.usedAt) return reply.code(400).send({ error: { code: 'INVALID_TOKEN', message: 'This reset link is invalid or has already been used.' } });
    if (row.expiresAt < new Date()) return reply.code(400).send({ error: { code: 'EXPIRED_TOKEN', message: 'This reset link has expired. Please request a new one.' } });
    const passwordHash = await hashPassword(parsed.data.password);
    await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, row.userId));
    return { ok: true };
  });

  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const userId = (req.user as { sub: string }).sub;
    const user = await db.select().from(users).where(eq(users.id, userId)).then((r) => r[0]);
    if (!user) return { user: null, memberships: [] };
    const mems = await db.select().from(memberships).where(eq(memberships.userId, user.id));
    const tenantRows = await Promise.all(
      mems.map(async (m) => {
        const t = await db.select().from(tenants).where(eq(tenants.id, m.tenantId)).then((r) => r[0]);
        return t ? { ...t, role: m.role } : null;
      })
    );
    return { user: { id: user.id, name: user.name, email: user.email }, memberships: tenantRows.filter(Boolean) };
  });

  // join another school explicitly (replaces demo auto-login)
  app.post('/join', { preHandler: requireAuth }, async (req, reply) => {
    const parsed = z.object({ slug: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'School slug required.' } });
    const userId = (req.user as { sub: string }).sub;
    const tenant = await db.select().from(tenants).where(eq(tenants.slug, parsed.data.slug)).then((r) => r[0]);
    if (!tenant) return reply.code(404).send({ error: { code: 'TENANT_NOT_FOUND', message: 'School not found.' } });
    const existing = await db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenant.id))).then((r) => r[0]);
    if (existing) return { ok: true, tenant };
    if (!tenant.demo) return reply.code(403).send({ error: { code: 'INVITE_ONLY', message: 'This school requires an invite.' } });
    // Demo auto-join is capped at Parent: never mint Admin outside signup/school-create.
    await db.insert(memberships).values({ userId, tenantId: tenant.id, role: 'Parent' });
    return { ok: true, tenant };
  });
}
