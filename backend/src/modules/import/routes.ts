import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/client';
import {
  announcements,
  classes,
  events,
  invoices,
  schoolOptions,
  schoolProfiles,
  students,
  teachers,
  tenants,
} from '../../db/schema';
import { requireAuth, resolveTenant, requireRole, tenantOf } from '../../middlewares/tenant';
import { DEFAULT_OPTIONS } from '../../utils/defaults';

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const phone = z.string().trim().min(6).max(20).regex(/^[+\d][\d\s\-()]*$/, 'Enter a valid phone number');
const optionList = z.array(z.string().trim().min(1).max(60)).min(1).max(40);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  tagline: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
  email: z.string().trim().email().max(100).optional(),
  address: z.string().trim().min(5).max(140).optional(),
  principal: z.string().trim().min(2).max(60).optional(),
});

const optionsSchema = z.object({
  staffRoles: optionList.optional(),
  genders: optionList.optional(),
  eventTypes: optionList.optional(),
  sources: optionList.optional(),
  audiences: optionList.optional(),
  feeTitles: optionList.optional(),
});

const classSchema = z.object({
  name: z.string().trim().min(2).max(60),
  ageGroup: z.string().trim().max(40).optional(),
  capacity: z.number().int().min(1).max(200).optional(),
  room: z.string().trim().max(80).optional(),
  time: z.string().trim().max(40).optional(),
  color: z.string().trim().max(20).optional(),
});

const studentSchema = z.object({
  name: z.string().trim().min(2).max(60),
  age: z.number().int().min(1).max(10),
  dob: z.string().regex(dateRe),
  gender: z.string().trim().min(1).max(60),
  className: z.string().trim().min(1).max(60).optional(),
  parent: z.string().trim().min(2).max(60),
  phone,
  email: z.string().trim().email().max(100).optional().or(z.literal('')),
  address: z.string().trim().max(140).optional(),
  emoji: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  status: z.enum(['active', 'inactive', 'waitlist']).optional(),
  joinedAt: z.string().regex(dateRe).optional(),
  allergies: z.string().max(140).optional(),
  notes: z.string().max(500).optional(),
});

const teacherSchema = z.object({
  name: z.string().trim().min(2).max(60),
  role: z.string().trim().min(2).max(60),
  className: z.string().trim().min(1).max(60).optional(),
  phone,
  email: z.string().trim().email().max(100).optional().or(z.literal('')),
  emoji: z.string().max(10).optional(),
  color: z.string().max(20).optional(),
  status: z.enum(['active', 'leave']).optional(),
  joinedAt: z.string().regex(dateRe).optional(),
});

const invoiceSchema = z.object({
  studentName: z.string().trim().min(1).max(60).optional(),
  studentId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(100),
  amount: z.number().positive().max(1000000),
  dueDate: z.string().regex(dateRe),
  issuedAt: z.string().regex(dateRe).optional(),
  status: z.enum(['paid', 'pending', 'overdue']).optional(),
});

const eventSchema = z.object({
  title: z.string().trim().min(3).max(80),
  date: z.string().regex(dateRe),
  time: z.string().trim().min(3).max(20),
  location: z.string().trim().max(80).optional(),
  type: z.string().trim().min(1).max(60),
  description: z.string().max(500).optional(),
  color: z.string().max(20).optional(),
});

const announcementSchema = z.object({
  title: z.string().trim().min(3).max(80),
  body: z.string().trim().min(5).max(600),
  audience: z.string().trim().min(2).max(60),
  pinned: z.boolean().optional(),
});

const bodySchema = z
  .object({
    profile: profileSchema.optional(),
    options: optionsSchema.optional(),
    classes: z.array(z.unknown()).optional(),
    students: z.array(z.unknown()).optional(),
    teachers: z.array(z.unknown()).optional(),
    invoices: z.array(z.unknown()).optional(),
    events: z.array(z.unknown()).optional(),
    announcements: z.array(z.unknown()).optional(),
  })
  .refine(
    (v) =>
      v.profile !== undefined ||
      v.options !== undefined ||
      v.classes !== undefined ||
      v.students !== undefined ||
      v.teachers !== undefined ||
      v.invoices !== undefined ||
      v.events !== undefined ||
      v.announcements !== undefined,
    { message: 'Provide at least one of: profile, options, classes, students, teachers, invoices, events, announcements.' }
  );

const OPTION_KEYS = ['staffRoles', 'genders', 'eventTypes', 'sources', 'audiences', 'feeTitles'] as const;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values.map((s) => s.trim()).filter(Boolean)) {
    const k = v.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(v);
    }
  }
  return out;
}

function invNumber(): string {
  return `INV-${Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export async function importRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [requireAuth, resolveTenant, requireRole('Admin')] }, async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: { code: 'VALIDATION', message: parsed.error.issues[0]?.message } });
    const t = tenantOf(req);
    const body = parsed.data;
    const today = new Date().toISOString().slice(0, 10);

    try {
    const imported = { classes: 0, students: 0, teachers: 0, invoices: 0, events: 0, announcements: 0 };
    const skipped = { classes: 0, students: 0, teachers: 0, invoices: 0, events: 0, announcements: 0 };
    let profileUpdated = false;
    const optionsUpdated: string[] = [];

    // 1. profile (partial upsert)
    if (body.profile !== undefined) {
      const fields = Object.fromEntries(Object.entries(body.profile).filter(([, v]) => v !== undefined));
      if (Object.keys(fields).length > 0) {
        const existing = await db.select().from(schoolProfiles).where(eq(schoolProfiles.tenantId, t.id)).then((r) => r[0]);
        if (existing) {
          await db.update(schoolProfiles).set(fields).where(eq(schoolProfiles.tenantId, t.id));
        } else {
          await db.insert(schoolProfiles).values({ tenantId: t.id, name: 'School', ...fields });
        }
        if (fields.name) await db.update(tenants).set({ name: fields.name as string }).where(eq(tenants.id, t.id));
        profileUpdated = true;
      }
    }

    // 2. options
    if (body.options !== undefined) {
      let row = await db.select().from(schoolOptions).where(eq(schoolOptions.tenantId, t.id)).then((r) => r[0]);
      if (!row) {
        row = await db.insert(schoolOptions).values({ tenantId: t.id, ...DEFAULT_OPTIONS }).returning().then((r) => r[0]);
      }
      for (const key of OPTION_KEYS) {
        const vals = body.options[key];
        if (vals !== undefined) {
          const cleaned = dedupe(vals);
          if (cleaned.length === 0) continue;
          await db.update(schoolOptions).set({ [key]: cleaned }).where(eq(schoolOptions.tenantId, t.id));
          optionsUpdated.push(key);
        }
      }
    }

    // 3. classes first (name -> id within tenant)
    const classByName = new Map<string, string>();
    const existingClasses = await db.select().from(classes).where(eq(classes.tenantId, t.id)).limit(500);
    for (const c of existingClasses) classByName.set(c.name, c.id);
    for (const raw of body.classes ?? []) {
      const p = classSchema.safeParse(raw);
      if (!p.success) {
        skipped.classes++;
        continue;
      }
      const reuse = classByName.get(p.data.name);
      if (reuse) {
        // Class already exists for this tenant — reuse it without inflating the import count.
        continue;
      }
      const row = await db
        .insert(classes)
        .values({
          tenantId: t.id,
          name: p.data.name,
          ageGroup: p.data.ageGroup ?? '—',
          capacity: p.data.capacity ?? 20,
          room: p.data.room ?? '—',
          time: p.data.time ?? '—',
          color: p.data.color ?? '#7C9DFF',
        })
        .returning()
        .then((r) => r[0]);
      classByName.set(row.name, row.id);
      imported.classes++;
    }

    // student name -> id within tenant (existing + newly imported)
    const studentByName = new Map<string, string>();
    const existingStudents = await db.select().from(students).where(eq(students.tenantId, t.id)).limit(1000);
    for (const s of existingStudents) {
      if (!studentByName.has(s.name)) studentByName.set(s.name, s.id);
    }
    const studentIds = new Set(existingStudents.map((s) => s.id));

    // 4. students
    for (const raw of body.students ?? []) {
      const p = studentSchema.safeParse(raw);
      if (!p.success) {
        skipped.students++;
        continue;
      }
      let classId: string | null = null;
      if (p.data.className) {
        const cid = classByName.get(p.data.className);
        if (!cid) {
          skipped.students++;
          continue;
        }
        classId = cid;
      }
      const row = await db
        .insert(students)
        .values({
          tenantId: t.id,
          classId,
          name: p.data.name,
          age: p.data.age,
          dob: p.data.dob,
          gender: p.data.gender,
          parent: p.data.parent,
          phone: p.data.phone,
          email: p.data.email || null,
          address: p.data.address,
          emoji: p.data.emoji ?? '🧒',
          color: p.data.color ?? '#E4EBFF',
          status: p.data.status ?? 'active',
          joinedAt: p.data.joinedAt ?? today,
          allergies: p.data.allergies,
          notes: p.data.notes,
        })
        .returning()
        .then((r) => r[0]);
      studentByName.set(row.name, row.id);
      studentIds.add(row.id);
      imported.students++;
    }

    // 5. teachers
    for (const raw of body.teachers ?? []) {
      const p = teacherSchema.safeParse(raw);
      if (!p.success) {
        skipped.teachers++;
        continue;
      }
      let classId: string | null = null;
      if (p.data.className) {
        const cid = classByName.get(p.data.className);
        if (!cid) {
          skipped.teachers++;
          continue;
        }
        classId = cid;
      }
      await db.insert(teachers).values({
        tenantId: t.id,
        classId,
        name: p.data.name,
        role: p.data.role,
        phone: p.data.phone,
        email: p.data.email || '',
        emoji: p.data.emoji ?? '🦉',
        color: p.data.color ?? '#E4EBFF',
        status: p.data.status ?? 'active',
        joinedAt: p.data.joinedAt ?? today,
      });
      imported.teachers++;
    }

    // 6. invoices last
    for (const raw of body.invoices ?? []) {
      const p = invoiceSchema.safeParse(raw);
      if (!p.success) {
        skipped.invoices++;
        continue;
      }
      let studentId: string | null = null;
      if (p.data.studentId) {
        if (!studentIds.has(p.data.studentId)) {
          skipped.invoices++;
          continue;
        }
        studentId = p.data.studentId;
      } else if (p.data.studentName) {
        const sid = studentByName.get(p.data.studentName);
        if (!sid) {
          skipped.invoices++;
          continue;
        }
        studentId = sid;
      } else {
        skipped.invoices++;
        continue;
      }
      const status = p.data.status ?? 'pending';
      await db.insert(invoices).values({
        tenantId: t.id,
        number: invNumber(),
        studentId,
        title: p.data.title,
        amountCents: Math.round(p.data.amount * 100),
        dueDate: p.data.dueDate,
        issuedAt: p.data.issuedAt ?? p.data.dueDate,
        status,
        method: status === 'paid' ? 'UPI' : null,
      });
      imported.invoices++;
    }

    // 7. events
    for (const raw of body.events ?? []) {
      const p = eventSchema.safeParse(raw);
      if (!p.success) {
        skipped.events++;
        continue;
      }
      await db.insert(events).values({
        tenantId: t.id,
        title: p.data.title,
        date: p.data.date,
        time: p.data.time,
        location: p.data.location ?? 'School campus',
        type: p.data.type,
        description: p.data.description ?? '',
        color: p.data.color ?? '#7C9DFF',
      });
      imported.events++;
    }

    // 8. announcements
    for (const raw of body.announcements ?? []) {
      const p = announcementSchema.safeParse(raw);
      if (!p.success) {
        skipped.announcements++;
        continue;
      }
      await db.insert(announcements).values({
        tenantId: t.id,
        title: p.data.title,
        body: p.data.body,
        audience: p.data.audience,
        pinned: p.data.pinned ?? false,
      });
      imported.announcements++;
    }

    return { imported, skipped, profileUpdated, optionsUpdated };
    } catch (err) {
      req.log?.error?.(err);
      const message = err instanceof Error ? err.message : 'Unknown import error.';
      return reply.code(500).send({ error: { code: 'IMPORT_FAILED', message: `Import failed partway: ${message}` } });
    }
  });
}
