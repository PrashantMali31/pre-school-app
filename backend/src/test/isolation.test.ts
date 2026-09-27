import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, setupTestDB, signupSchool, truncateAll } from './helper';

describe('tenant isolation', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    app = buildTestApp();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it("user A cannot read school B (403 NOT_A_MEMBER); unknown slug -> 404", async () => {
    const a = await signupSchool(app, { email: 'iso-a@example.com', schoolName: 'Iso School A' });
    const b = await signupSchool(app, { email: 'iso-b@example.com', schoolName: 'Iso School B' });
    expect(a.tenant.slug).not.toBe(b.tenant.slug);

    const cross = await app.inject({
      method: 'GET',
      url: '/students',
      headers: { authorization: `Bearer ${a.token}`, 'x-tenant-slug': b.tenant.slug },
    });
    expect(cross.statusCode).toBe(403);
    expect(cross.json()).toMatchObject({ error: { code: 'NOT_A_MEMBER' } });

    const unknown = await app.inject({
      method: 'GET',
      url: '/students',
      headers: { authorization: `Bearer ${a.token}`, 'x-tenant-slug': 'no-such-school-xyz' },
    });
    expect(unknown.statusCode).toBe(404);
  });
});
