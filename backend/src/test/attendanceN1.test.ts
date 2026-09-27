import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, setupTestDB, signupSchool, truncateAll } from './helper';

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

const studentPayload = {
  name: 'N1 Kid',
  age: 4,
  dob: '2021-05-01',
  gender: 'Girl',
  parent: 'N1 Parent',
  phone: '+911234567890',
  joinedAt: '2026-09-01',
};

describe('attendance N+1 regression', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    app = buildTestApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('GET /attendance batches records; export matches', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'n1-admin@example.com', schoolName: 'N1 School' });
    const h = auth(token, tenant.slug);

    const s1 = (await app.inject({ method: 'POST', url: '/students', headers: h, payload: studentPayload }).then((r) => {
      expect(r.statusCode).toBe(201);
      return r.json() as { data: { id: string } };
    })).data.id;
    const s2 = (await app.inject({ method: 'POST', url: '/students', headers: h, payload: { ...studentPayload, name: 'N1 Kid 2' } }).then((r) => {
      expect(r.statusCode).toBe(201);
      return r.json() as { data: { id: string } };
    })).data.id;

    const dates = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05'];
    for (const date of dates) {
      const put = await app.inject({
        method: 'PUT',
        url: `/attendance/${date}`,
        headers: h,
        payload: { records: { [s1]: 'present', [s2]: 'absent' } },
      });
      expect(put.statusCode).toBe(200);
    }

    const t0 = performance.now();
    const res = await app.inject({ method: 'GET', url: '/attendance?page=1&limit=50', headers: h });
    const elapsed = performance.now() - t0;
    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ date: string; records: Record<string, string> }>; total: number };
    expect(body.total).toBe(5);
    expect(body.data).toHaveLength(5);
    // Same sort as handler: ascending by date string.
    expect(body.data.map((d) => d.date)).toEqual([...dates].sort());
    for (const day of body.data) {
      expect(Object.keys(day.records)).toHaveLength(2);
      expect(day.records[s1]).toBe('present');
      expect(day.records[s2]).toBe('absent');
    }
    // eslint-disable-next-line no-console
    console.log(`GET /attendance (5 days) took ${elapsed.toFixed(2)}ms`);

    const paged = await app.inject({ method: 'GET', url: '/attendance?page=1&limit=2', headers: h });
    expect(paged.statusCode).toBe(200);
    const pagedBody = paged.json() as { data: unknown[]; total: number };
    expect(pagedBody.total).toBe(5);
    expect(pagedBody.data).toHaveLength(2);

    const exp = await app.inject({ method: 'GET', url: '/audit/export', headers: h });
    expect(exp.statusCode).toBe(200);
    const expBody = exp.json() as { data: { attendance: Array<{ date: string; records: Record<string, string> }> } };
    expect(expBody.data.attendance).toHaveLength(5);
    for (const day of expBody.data.attendance) {
      expect(Object.keys(day.records)).toHaveLength(2);
      expect(day.records[s1]).toBe('present');
      expect(day.records[s2]).toBe('absent');
    }
    // Export attendance matches GET /attendance record maps.
    const byDate = new Map(body.data.map((d) => [d.date, d.records]));
    for (const day of expBody.data.attendance) {
      expect(day.records).toEqual(byDate.get(day.date));
    }
  });
});
