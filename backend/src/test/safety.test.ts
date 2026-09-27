import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { buildTestApp, loginAs, setupTestDB, signupSchool, truncateAll } from './helper';

function auth(token: string, slug: string) {
  return { authorization: `Bearer ${token}`, 'x-tenant-slug': slug };
}

/** Create safety tables IF NOT EXISTS so the suite passes even before migrations run. */
async function ensureSafetyTables(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "pickup_contacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "relation" text NOT NULL DEFAULT '',
        "phone" text NOT NULL DEFAULT '',
        "pin_hash" text,
        "is_primary" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "pickup_log" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
        "contact_id" uuid REFERENCES "pickup_contacts"("id") ON DELETE SET NULL,
        "picked_up_at" timestamptz DEFAULT now() NOT NULL,
        "verified_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "note" text,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "incidents" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "student_id" uuid NOT NULL REFERENCES "students"("id") ON DELETE CASCADE,
        "kind" text NOT NULL,
        "severity" text NOT NULL,
        "title" text NOT NULL,
        "detail" text NOT NULL DEFAULT '',
        "occurred_at" date NOT NULL,
        "notified_parent" boolean NOT NULL DEFAULT false,
        "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "timetable_slots" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "class_id" uuid NOT NULL REFERENCES "classes"("id") ON DELETE CASCADE,
        "weekday" integer NOT NULL,
        "start_time" text NOT NULL,
        "end_time" text NOT NULL,
        "activity" text NOT NULL,
        "teacher_id" uuid REFERENCES "teachers"("id") ON DELETE SET NULL,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "bus_routes" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "vehicle_no" text NOT NULL DEFAULT '',
        "driver_name" text NOT NULL DEFAULT '',
        "driver_phone" text NOT NULL DEFAULT '',
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "bus_stops" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "route_id" uuid NOT NULL REFERENCES "bus_routes"("id") ON DELETE CASCADE,
        "name" text NOT NULL,
        "pickup_time" text NOT NULL,
        "order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz DEFAULT now() NOT NULL
      )`);
  } finally {
    await pool.end();
  }
}

async function addMembership(userId: string, tenantId: string, role: 'Teacher' | 'Parent') {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1, $2, $3)`, [userId, tenantId, role]);
  } finally {
    await pool.end();
  }
}

async function linkParent(tenantId: string, userId: string, studentId: string) {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 });
  try {
    await pool.query(`INSERT INTO parent_links (tenant_id, user_id, student_id) VALUES ($1, $2, $3)`, [tenantId, userId, studentId]);
  } finally {
    await pool.end();
  }
}

const studentPayload = {
  name: 'Safety Kid',
  age: 4,
  dob: '2021-05-01',
  gender: 'Girl',
  parent: 'Safety Parent',
  phone: '+911234567890',
  joinedAt: '2026-09-01',
};

async function makeStudent(app: FastifyInstance, token: string, slug: string) {
  const res = await app.inject({ method: 'POST', url: '/students', headers: auth(token, slug), payload: studentPayload });
  expect(res.statusCode).toBe(201);
  return (res.json() as { data: { id: string } }).data.id;
}

async function makeClass(app: FastifyInstance, token: string, slug: string) {
  const res = await app.inject({ method: 'POST', url: '/classes', headers: auth(token, slug), payload: { name: 'Safety Class', capacity: 20 } });
  expect(res.statusCode).toBe(201);
  return (res.json() as { data: { id: string } }).data.id;
}

describe('safety ops', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    await setupTestDB();
    await ensureSafetyTables();
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    app = buildTestApp();
    await app.ready();
  });
  beforeEach(async () => {
    await truncateAll();
    await ensureSafetyTables();
  });

  it('pickup contact CRUD + log + cross-tenant 400', async () => {
    const a = await signupSchool(app, { email: 'safe-a@example.com', schoolName: 'Safe A' });
    const b = await signupSchool(app, { email: 'safe-b@example.com', schoolName: 'Safe B' });
    const sid = await makeStudent(app, a.token, a.tenant.slug);

    const created = await app.inject({
      method: 'POST', url: `/safety/students/${sid}/pickups`, headers: auth(a.token, a.tenant.slug),
      payload: { name: 'Grandma', relation: 'Grandmother', phone: '+911234567891', pin: '1234', isPrimary: true },
    });
    expect(created.statusCode).toBe(201);
    const contact = (created.json() as { data: { id: string; hasPin: boolean } }).data;
    expect(contact.hasPin).toBe(true);

    const list = await app.inject({ method: 'GET', url: `/safety/students/${sid}/pickups`, headers: auth(a.token, a.tenant.slug) });
    expect(list.statusCode).toBe(200);
    expect((list.json() as { data: unknown[] }).data).toHaveLength(1);

    const log = await app.inject({
      method: 'POST', url: `/safety/students/${sid}/pickup`, headers: auth(a.token, a.tenant.slug),
      payload: { contactId: contact.id, note: 'On time' },
    });
    expect(log.statusCode).toBe(201);

    const logList = await app.inject({ method: 'GET', url: `/safety/students/${sid}/pickups/log`, headers: auth(a.token, a.tenant.slug) });
    expect(logList.statusCode).toBe(200);
    expect((logList.json() as { data: unknown[] }).data).toHaveLength(1);

    // Cross-tenant: school B admin operating on school A student -> 400 CROSS_TENANT.
    const cross = await app.inject({
      method: 'POST', url: `/safety/students/${sid}/pickups`, headers: auth(b.token, b.tenant.slug),
      payload: { name: 'Intruder', phone: '+911234567892' },
    });
    expect(cross.statusCode).toBe(400);
    expect(cross.json()).toMatchObject({ error: { code: 'CROSS_TENANT' } });

    const del = await app.inject({ method: 'DELETE', url: `/safety/pickups/${contact.id}`, headers: auth(a.token, a.tenant.slug) });
    expect(del.statusCode).toBe(200);
  });

  it('pickup edit (PUT) + verify PIN rotate + cross-tenant 400', async () => {
    const a = await signupSchool(app, { email: 'edit-a@example.com', schoolName: 'Edit A' });
    const b = await signupSchool(app, { email: 'edit-b@example.com', schoolName: 'Edit B' });
    const sid = await makeStudent(app, a.token, a.tenant.slug);
    const created = await app.inject({
      method: 'POST', url: `/safety/students/${sid}/pickups`, headers: auth(a.token, a.tenant.slug),
      payload: { name: 'Aunt', relation: 'Aunt', phone: '+911234567895', pin: '1111' },
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { data: { id: string } }).data.id;

    const edited = await app.inject({
      method: 'PUT', url: `/safety/pickups/${id}`, headers: auth(a.token, a.tenant.slug),
      payload: { name: 'Auntie', relation: 'Aunt', phone: '+911234567896', pin: '2222' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ data: { name: 'Auntie', phone: '+911234567896', hasPin: true } });

    // Rotated PIN verifies; old PIN does not.
    const okNew = await app.inject({ method: 'POST', url: `/safety/pickups/${id}/verify`, headers: auth(a.token, a.tenant.slug), payload: { pin: '2222' } });
    expect(okNew.json()).toMatchObject({ ok: true });
    const okOld = await app.inject({ method: 'POST', url: `/safety/pickups/${id}/verify`, headers: auth(a.token, a.tenant.slug), payload: { pin: '1111' } });
    expect(okOld.json()).toMatchObject({ ok: false });

    // Empty body 400; bad uuid 400; missing 404.
    const empty = await app.inject({ method: 'PUT', url: `/safety/pickups/${id}`, headers: auth(a.token, a.tenant.slug), payload: {} });
    expect(empty.statusCode).toBe(400);
    const badUuid = await app.inject({ method: 'PUT', url: '/safety/pickups/not-a-uuid', headers: auth(a.token, a.tenant.slug), payload: { name: 'Xy' } });
    expect(badUuid.statusCode).toBe(400);
    const missing = await app.inject({ method: 'PUT', url: '/safety/pickups/00000000-0000-4000-8000-000000000000', headers: auth(a.token, a.tenant.slug), payload: { name: 'Ghost' } });
    expect(missing.statusCode).toBe(404);

    // Cross-tenant edit -> 400 CROSS_TENANT.
    const cross = await app.inject({
      method: 'PUT', url: `/safety/pickups/${id}`, headers: auth(b.token, b.tenant.slug),
      payload: { name: 'Intruder' },
    });
    expect(cross.statusCode).toBe(400);
    expect(cross.json()).toMatchObject({ error: { code: 'CROSS_TENANT' } });
  });

  it('PIN verify true/false + bad pin 400', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'pin-admin@example.com', schoolName: 'Pin School' });
    const sid = await makeStudent(app, token, tenant.slug);
    const created = await app.inject({
      method: 'POST', url: `/safety/students/${sid}/pickups`, headers: auth(token, tenant.slug),
      payload: { name: 'Dad', phone: '+911234567893', pin: '9876' },
    });
    const id = (created.json() as { data: { id: string } }).data.id;

    const ok = await app.inject({ method: 'POST', url: `/safety/pickups/${id}/verify`, headers: auth(token, tenant.slug), payload: { pin: '9876' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ ok: true });

    const bad = await app.inject({ method: 'POST', url: `/safety/pickups/${id}/verify`, headers: auth(token, tenant.slug), payload: { pin: '0000' } });
    expect(bad.statusCode).toBe(200);
    expect(bad.json()).toMatchObject({ ok: false });

    const malformed = await app.inject({ method: 'POST', url: `/safety/pickups/${id}/verify`, headers: auth(token, tenant.slug), payload: { pin: '12' } });
    expect(malformed.statusCode).toBe(400);
  });

  it('incident create/list + Parent forbidden-or-scoped', async () => {
    const admin = await signupSchool(app, { email: 'inc-admin@example.com', schoolName: 'Inc School' });
    const sid = await makeStudent(app, admin.token, admin.tenant.slug);

    const created = await app.inject({
      method: 'POST', url: '/safety/incidents', headers: auth(admin.token, admin.tenant.slug),
      payload: { studentId: sid, kind: 'injury', severity: 'low', title: 'Scraped knee', detail: 'Playground fall', occurredAt: '2026-09-10' },
    });
    expect(created.statusCode).toBe(201);
    const incId = (created.json() as { data: { id: string } }).data.id;

    const patch = await app.inject({
      method: 'PATCH', url: `/safety/incidents/${incId}`, headers: auth(admin.token, admin.tenant.slug),
      payload: { notifiedParent: true },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ data: { notifiedParent: true } });

    // Parent setup: membership + link.
    const parentSignup = await signupSchool(app, { email: 'inc-parent@example.com', schoolName: 'Parent Home' });
    await addMembership(parentSignup.user.id, admin.tenant.id, 'Parent');
    const parentToken = await loginAs(app, 'inc-parent@example.com', 'password123');

    // Unlinked parent: list empty, direct student filter 403, write 403.
    const empty = await app.inject({ method: 'GET', url: '/safety/incidents', headers: auth(parentToken, admin.tenant.slug) });
    expect(empty.statusCode).toBe(200);
    expect((empty.json() as { data: unknown[] }).data).toHaveLength(0);

    const forbidden = await app.inject({ method: 'GET', url: `/safety/incidents?studentId=${sid}`, headers: auth(parentToken, admin.tenant.slug) });
    expect(forbidden.statusCode).toBe(403);

    const writeDenied = await app.inject({
      method: 'POST', url: '/safety/incidents', headers: auth(parentToken, admin.tenant.slug),
      payload: { studentId: sid, kind: 'illness', severity: 'low', title: 'Fever', occurredAt: '2026-09-11' },
    });
    expect(writeDenied.statusCode).toBe(403);

    // Linked parent: can read.
    await linkParent(admin.tenant.id, parentSignup.user.id, sid);
    const scoped = await app.inject({ method: 'GET', url: `/safety/incidents?studentId=${sid}`, headers: auth(parentToken, admin.tenant.slug) });
    expect(scoped.statusCode).toBe(200);
    expect((scoped.json() as { data: unknown[] }).data).toHaveLength(1);
  });

  it('timetable replace-all + validation', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'tt-admin@example.com', schoolName: 'TT School' });
    const cid = await makeClass(app, token, tenant.slug);

    const put = await app.inject({
      method: 'PUT', url: `/safety/classes/${cid}/timetable`, headers: auth(token, tenant.slug),
      payload: { slots: [{ weekday: 1, startTime: '09:00', endTime: '09:45', activity: 'Circle time' }] },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({ method: 'GET', url: `/safety/classes/${cid}/timetable`, headers: auth(token, tenant.slug) });
    expect(get.statusCode).toBe(200);
    expect((get.json() as { data: Array<{ activity: string }> }).data.map((s) => s.activity)).toContain('Circle time');

    // Replace-all with two slots replaces the one.
    const put2 = await app.inject({
      method: 'PUT', url: `/safety/classes/${cid}/timetable`, headers: auth(token, tenant.slug),
      payload: { slots: [
        { weekday: 2, startTime: '09:00', endTime: '09:45', activity: 'Art' },
        { weekday: 3, startTime: '10:00', endTime: '10:45', activity: 'Music' },
      ] },
    });
    expect(put2.statusCode).toBe(200);
    const get2 = await app.inject({ method: 'GET', url: `/safety/classes/${cid}/timetable`, headers: auth(token, tenant.slug) });
    expect((get2.json() as { data: unknown[] }).data).toHaveLength(2);

    const bad = await app.inject({
      method: 'PUT', url: `/safety/classes/${cid}/timetable`, headers: auth(token, tenant.slug),
      payload: { slots: [{ weekday: 9, startTime: '9am', endTime: '10:00', activity: 'X' }] },
    });
    expect(bad.statusCode).toBe(400);
  });

  it('bus route+stop CRUD; anon 401', async () => {
    const { token, tenant } = await signupSchool(app, { email: 'bus-admin@example.com', schoolName: 'Bus School' });
    const h = auth(token, tenant.slug);

    const route = await app.inject({ method: 'POST', url: '/safety/bus/routes', headers: h, payload: { name: 'Route A', vehicleNo: 'KA-01-1234', driverName: 'Ravi', driverPhone: '+911234567894' } });
    expect(route.statusCode).toBe(201);
    const routeId = (route.json() as { data: { id: string } }).data.id;

    const stop = await app.inject({ method: 'POST', url: `/safety/bus/routes/${routeId}/stops`, headers: h, payload: { name: 'Main Gate', pickupTime: '08:00', order: 1 } });
    expect(stop.statusCode).toBe(201);
    const stopId = (stop.json() as { data: { id: string } }).data.id;

    const stops = await app.inject({ method: 'GET', url: `/safety/bus/routes/${routeId}/stops`, headers: h });
    expect(stops.statusCode).toBe(200);
    expect((stops.json() as { data: unknown[] }).data).toHaveLength(1);

    const routes = await app.inject({ method: 'GET', url: '/safety/bus/routes', headers: h });
    expect(routes.statusCode).toBe(200);
    expect((routes.json() as { data: Array<{ id: string }> }).data.map((r) => r.id)).toContain(routeId);

    const patchStop = await app.inject({ method: 'PATCH', url: `/safety/bus/stops/${stopId}`, headers: h, payload: { pickupTime: '08:15' } });
    expect(patchStop.statusCode).toBe(200);

    const delStop = await app.inject({ method: 'DELETE', url: `/safety/bus/stops/${stopId}`, headers: h });
    expect(delStop.statusCode).toBe(200);

    const anon = await app.inject({ method: 'GET', url: '/safety/bus/routes', headers: { 'x-tenant-slug': tenant.slug } });
    expect(anon.statusCode).toBe(401);

    const anonPickup = await app.inject({ method: 'GET', url: '/safety/incidents', headers: { 'x-tenant-slug': tenant.slug } });
    expect(anonPickup.statusCode).toBe(401);
  });
});
