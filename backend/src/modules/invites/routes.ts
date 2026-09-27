import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { memberships, tenants, users } from '../../db/schema';
import { requireAuth, requireRole, resolveTenant, tenantOf } from '../../middlewares/tenant';
import { hashPassword, sha256 } from '../../utils/security';

const FRONTEND_URL = () => process.env.FRONTEND_URL ?? 'http://localhost:3000';

const createSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(100),
  role: z.enum(['Teacher', 'Parent']),
});

const acceptSchema = z.object({
  token: z.string().trim().min(1, 'Invite token required.'),
  email: z.string().trim().email('Enter a valid email address.').max(100).optional(),
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(60).optional(),
  password: z.string().min(6, 'Password must be at least 6 characters.').max(72).optional(),
});

// Stricter per-route limit for invite acceptance (global is 200/min in app.ts).
const ACCEPT_LIMIT = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

interface InviteRow {
  id: string;
  tenant_id: string;
  email: string;
  role: 'Teacher' | 'Parent';
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  tenant_slug?: string;
}

/** db.execute() shape differs by driver version — normalize to a rows array. */
function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const rows = (res as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('invite_tokens') && msg.includes('does not exist');
}

export async function inviteRoutes(app: FastifyInstance) {
  // Create (or re-issue) an invite — Admin only.
  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const email = parsed.data.email.toLowerCase();
    const role = parsed.data.role;
    const createdBy = (req.user as { sub: string }).sub;

    try {
      const raw = crypto.randomBytes(32).toString('hex');
      const tokenHash = sha256(raw);
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

      const pending = rowsOf<InviteRow>(await db.execute(sql`
        SELECT id, tenant_id, email, role, token_hash, expires_at, accepted_at, created_at
        FROM invite_tokens
        WHERE tenant_id = ${t.id} AND email = ${email}
          AND accepted_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1
      `))[0];

      let rowId: string;
      let status = 201;
      if (pending) {
        // NOTE: raw tokens are unrecoverable from sha256, so "return its link again"
        // is implemented as a token rotation on the SAME row (no duplicate rows).
        await db.execute(sql`
          UPDATE invite_tokens SET token_hash = ${tokenHash}, expires_at = ${expiresAt.toISOString()} WHERE id = ${pending.id}
        `);
        rowId = pending.id;
        status = 200;
      } else {
        const inserted = rowsOf<{ id: string }>(await db.execute(sql`
          INSERT INTO invite_tokens (tenant_id, email, role, token_hash, expires_at, created_by)
          VALUES (${t.id}, ${email}, ${role}, ${tokenHash}, ${expiresAt.toISOString()}, ${createdBy})
          RETURNING id
        `))[0];
        rowId = inserted.id;
      }

      const inviteUrl = `${FRONTEND_URL()}/invite?token=${raw}`;
      // Dev stand-in for email delivery (no email service exists yet).
      // NOTE: never log the raw token — it is a credential equivalent.
      console.log(`[invite] ${email} (${role}) tenant=${t.slug} id=${rowId}`);
      void rowId;
      return reply.code(status).send({ data: { inviteUrl, email, role, expiresAt: expiresAt.toISOString() } });
    } catch (err) {
      if (isMissingTable(err)) {
        return reply.code(503).send({ error: { code: 'INVITES_BLOCKED', message: 'Invites are unavailable: invite_tokens table pending migration.' } });
      }
      throw err;
    }
  });

  // List invites (pending first, newest first; accepted included, greyed client-side).
  app.get('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    try {
      const rows = rowsOf<InviteRow>(await db.execute(sql`
        SELECT id, tenant_id, email, role, token_hash, expires_at, accepted_at, created_at
        FROM invite_tokens
        WHERE tenant_id = ${t.id}
        ORDER BY (accepted_at IS NULL) DESC, created_at DESC
        LIMIT 500
      `));
      return {
        data: rows.map((r) => ({
          id: r.id,
          email: r.email,
          role: r.role,
          expiresAt: new Date(r.expires_at).toISOString(),
          acceptedAt: r.accepted_at ? new Date(r.accepted_at).toISOString() : null,
        })),
      };
    } catch (err) {
      if (isMissingTable(err)) {
        return reply.code(503).send({ error: { code: 'INVITES_BLOCKED', message: 'Invites are unavailable: invite_tokens table pending migration.' } });
      }
      throw err;
    }
  });

  // Revoke an invite (delete row).
  app.delete('/:id', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const t = tenantOf(req);
    const id = (req.params as { id?: string }).id?.trim();
    if (!id) return reply.code(400).send({ error: { code: 'VALIDATION', message: 'Invite id required.' } });
    try {
      const existing = rowsOf<InviteRow>(await db.execute(sql`
        SELECT id FROM invite_tokens WHERE id = ${id} AND tenant_id = ${t.id} LIMIT 1
      `))[0];
      if (!existing) return reply.code(404).send({ error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found.' } });
      await db.execute(sql`DELETE FROM invite_tokens WHERE id = ${id} AND tenant_id = ${t.id}`);
      return { ok: true };
    } catch (err) {
      if (isMissingTable(err)) {
        return reply.code(503).send({ error: { code: 'INVITES_BLOCKED', message: 'Invites are unavailable: invite_tokens table pending migration.' } });
      }
      throw err;
    }
  });

  // Accept an invite — PUBLIC (no auth required).
  // Stricter rate limit: invite tokens are guessable credentials.
  app.post('/accept', ACCEPT_LIMIT, async (req, reply) => {
    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });

    let invite: InviteRow;
    try {
      const found = rowsOf<InviteRow>(await db.execute(sql`
        SELECT it.id, it.tenant_id, it.email, it.role, it.token_hash, it.expires_at, it.accepted_at, it.created_at,
               tn.slug AS tenant_slug
        FROM invite_tokens it JOIN tenants tn ON tn.id = it.tenant_id
        WHERE it.token_hash = ${sha256(parsed.data.token)}
        LIMIT 1
      `))[0];
      if (!found) return reply.code(400).send({ error: { code: 'INVALID_TOKEN', message: 'This invite link is invalid.' } });
      invite = found;
    } catch (err) {
      if (isMissingTable(err)) {
        return reply.code(503).send({ error: { code: 'INVITES_BLOCKED', message: 'Invites are unavailable: invite_tokens table pending migration.' } });
      }
      throw err;
    }

    if (invite.accepted_at) {
      return reply.code(400).send({ error: { code: 'ALREADY_ACCEPTED', message: 'This invite has already been accepted. Please log in.' } });
    }
    if (new Date(invite.expires_at) < new Date()) {
      return reply.code(400).send({ error: { code: 'EXPIRED_TOKEN', message: 'This invite link has expired. Ask your school Admin for a new one.' } });
    }

    const tenant = await db.select().from(tenants).where(eq(tenants.id, invite.tenant_id)).then((r) => r[0]);
    if (!tenant) return reply.code(400).send({ error: { code: 'INVALID_TOKEN', message: 'This invite link is invalid.' } });

    const attachMembership = async (userId: string) => {
      // Tenant scoping: the membership tenant ALWAYS comes from the invite row
      // (invite.tenant_id), never from client input — a logged-in user cannot
      // redirect this membership into another school. FK-link validation for
      // other modules lives in src/utils/tenantGuard.ts (see its header docs).
      const existing = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, invite.tenant_id)))
        .then((r) => r[0]);
      if (existing) {
        // Already a member: do NOT consume the invite (leave accepted_at alone
        // so the token stays usable by its intended recipient).
        return { ok: true as const, slug: tenant.slug, alreadyMember: true as const };
      }
      await db.insert(memberships).values({ userId, tenantId: invite.tenant_id, role: invite.role });
      await db.execute(sql`UPDATE invite_tokens SET accepted_at = now() WHERE id = ${invite.id} AND accepted_at IS NULL`);
      return { ok: true as const, slug: tenant.slug };
    };

    // Case A: valid Bearer — attach membership to the logged-in user, but ONLY
    // if the logged-in email matches the invited email (prevents invite hijack).
    try {
      await req.jwtVerify();
      const userId = (req.user as { sub: string }).sub;
      const me = await db.select().from(users).where(eq(users.id, userId)).then((r) => r[0]);
      if (!me) return reply.code(401).send({ error: { code: 'NO_USER', message: 'Please log in again.' } });
      if (me.email.toLowerCase() !== invite.email.toLowerCase()) {
        return reply.code(403).send({ error: { code: 'INVITE_EMAIL_MISMATCH', message: 'This invite was sent to a different email address. Please log in with the invited email.' } });
      }
      return attachMembership(userId);
    } catch {
      // Case B: no/invalid auth — fall through to name+password signup.
    }

    const { name, password, email: bodyEmail } = parsed.data;
    if (bodyEmail && bodyEmail.toLowerCase() !== invite.email.toLowerCase()) {
      return reply.code(403).send({ error: { code: 'INVITE_EMAIL_MISMATCH', message: 'This invite was sent to a different email address.' } });
    }
    if (!name || !password) {
      return reply.code(400).send({ error: { code: 'CREDENTIALS_REQUIRED', message: 'Please provide your name and choose a password to join.' } });
    }
    const taken = await db.select().from(users).where(eq(users.email, invite.email)).then((r) => r[0]);
    if (taken) {
      return reply.code(409).send({ error: { code: 'USE_LOGIN', message: 'An account with this email already exists. Please log in, then open the invite link again to join.' } });
    }
    const passwordHash = await hashPassword(password);
    const user = await db.insert(users).values({ email: invite.email, name: name.trim(), passwordHash }).returning().then((r) => r[0]);
    return attachMembership(user.id);
  });
}
