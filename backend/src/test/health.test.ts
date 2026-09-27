import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, setupTestDB, truncateAll } from './helper';

describe('health', () => {
  beforeAll(async () => {
    await setupTestDB();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('GET /health -> 200 {ok:true}', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    await app.close();
  });
});
