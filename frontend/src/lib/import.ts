/* Bulk-import shape-mapping helpers.
   Transforms an in-memory/export-shaped DB (uuid/temp-id FKs) into the
   POST /import contract shape (human-readable name FKs):
     { profile?, options?, classes?[{name,...}], students?[{...,className}],
       teachers?[{...,className}], invoices?[{studentName?,...}], events?, announcements? }
   Amounts are already rupees — passed through untouched.
   Server-only fields (id, invoice number) are dropped.
*/

import type { DB } from './types';

export interface ImportPayload {
  profile?: Record<string, unknown>;
  options?: Record<string, string[]>;
  classes?: Record<string, unknown>[];
  students?: Record<string, unknown>[];
  teachers?: Record<string, unknown>[];
  invoices?: Record<string, unknown>[];
  events?: Record<string, unknown>[];
  announcements?: Record<string, unknown>[];
}

export interface ImportResult {
  imported: Record<string, number>;
  skipped: Record<string, number>;
  profileUpdated: boolean;
  optionsUpdated: string[];
}

type Row = Record<string, unknown>;

const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
const num = (v: unknown, fb = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

function asRows(v: unknown): Row[] {
  return Array.isArray(v) ? (v.filter((r) => r && typeof r === 'object') as Row[]) : [];
}

/** Coerce unknown parsed JSON (export-shaped DB, possibly import-shaped) into a DB-like object. */
export function normalizeImportInput(parsed: unknown): DB {
  const root = (parsed ?? {}) as Row;
  // Allow a { db: {...} } wrapper just in case.
  const src = (root.db && typeof root.db === 'object' ? (root.db as Row) : root) as Row;
  // If the doc is already import-shaped (rows carry className/studentName), resolve
  // those back to ids so the single buildImportPayload path works.
  const classes = asRows(src.classes);
  const classIdByName = new Map(classes.map((c) => [str(c.name).toLowerCase(), str(c.id)]));
  const students = asRows(src.students);
  const studentIdByName = new Map(students.map((s) => [str(s.name).toLowerCase(), str(s.id)]));
  return {
    profile: (src.profile ?? {}) as DB['profile'],
    options: (src.options ?? {}) as DB['options'],
    classes: classes as unknown as DB['classes'],
    students: students.map((s) =>
      s.classId
        ? s
        : { ...s, classId: classIdByName.get(str(s.className).toLowerCase()) ?? s.classId },
    ) as unknown as DB['students'],
    teachers: asRows(src.teachers).map((t) =>
      t.classId
        ? t
        : { ...t, classId: classIdByName.get(str(t.className).toLowerCase()) ?? t.classId },
    ) as unknown as DB['teachers'],
    attendance: [],
    invoices: asRows(src.invoices).map((i) =>
      i.studentId
        ? i
        : { ...i, studentId: studentIdByName.get(str(i.studentName).toLowerCase()) ?? i.studentId },
    ) as unknown as DB['invoices'],
    events: asRows(src.events) as unknown as DB['events'],
    announcements: asRows(src.announcements) as unknown as DB['announcements'],
  };
}

/** Build the POST /import payload from an in-memory DB. FK uuids -> names via lookup. */
export function buildImportPayload(db: DB): ImportPayload {
  const classNameById = new Map((db.classes ?? []).map((c) => [c.id, c.name]));
  const teacherNameById = new Map((db.teachers ?? []).map((t) => [t.id, t.name]));
  const studentNameById = new Map((db.students ?? []).map((s) => [s.id, s.name]));
  const payload: ImportPayload = {};

  if (db.profile && typeof db.profile === 'object') {
    payload.profile = {
      name: str(db.profile.name),
      tagline: str(db.profile.tagline),
      phone: str(db.profile.phone),
      email: str(db.profile.email),
      address: str(db.profile.address),
      principal: str(db.profile.principal),
    };
  }

  if (db.options && typeof db.options === 'object') {
    const options: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(db.options as unknown as Record<string, unknown>)) {
      if (Array.isArray(v)) options[k] = (v as unknown[]).map(String);
    }
    if (Object.keys(options).length > 0) payload.options = options;
  }

  if (arr(db.classes).length > 0) {
    payload.classes = (db.classes ?? []).filter((c) => c && str(c.name)).map((c) => {
      const out: Row = {
        name: c.name,
        ageGroup: c.ageGroup,
        capacity: num(c.capacity, 20),
        room: c.room,
        time: c.time,
        color: c.color,
      };
      // Teacher link as a name (contract has no teacherId on import rows).
      const teacherName =
        teacherNameById.get(c.teacherId) ?? (c as unknown as Row).teacherName;
      if (typeof teacherName === 'string' && teacherName) out.teacherName = teacherName;
      return out;
    });
  }

  if (arr(db.students).length > 0) {
    payload.students = (db.students ?? []).filter((s) => s && str(s.name)).map((s) => {
      const out: Row = {
        name: s.name,
        age: num(s.age),
        dob: str(s.dob),
        gender: str(s.gender),
        parent: str(s.parent),
        phone: str(s.phone),
        emoji: str(s.emoji, '🧒'),
        color: str(s.color, '#E4EBFF'),
        status: str(s.status, 'active'),
        joinedAt: str(s.joinedAt),
      };
      const className = classNameById.get(s.classId) ?? (s as unknown as Row).className;
      if (typeof className === 'string' && className) out.className = className;
      if (s.email) out.email = s.email;
      if (s.address) out.address = s.address;
      if (s.allergies) out.allergies = s.allergies;
      if (s.notes) out.notes = s.notes;
      return out;
    });
  }

  if (arr(db.teachers).length > 0) {
    payload.teachers = (db.teachers ?? []).filter((t) => t && str(t.name)).map((t) => {
      const out: Row = {
        name: t.name,
        role: str(t.role),
        phone: str(t.phone),
        email: str(t.email),
        emoji: str(t.emoji, '🦉'),
        color: str(t.color, '#E4EBFF'),
        status: str(t.status, 'active'),
        joinedAt: str(t.joinedAt),
      };
      const className = classNameById.get(t.classId) ?? (t as unknown as Row).className;
      if (typeof className === 'string' && className) out.className = className;
      return out;
    });
  }

  if (arr(db.invoices).length > 0) {
    payload.invoices = (db.invoices ?? [])
      .filter((i) => i && str(i.title))
      .map((i) => {
        const out: Row = {
          title: i.title,
          amount: num(i.amount), // already rupees — no conversion
          dueDate: str(i.dueDate),
          issuedAt: str(i.issuedAt),
          status: str(i.status, 'pending'),
        };
        const studentName = studentNameById.get(i.studentId) ?? (i as unknown as Row).studentName;
        if (typeof studentName === 'string' && studentName) out.studentName = studentName;
        if (i.method) out.method = i.method;
        return out;
      });
  }

  if (arr(db.events).length > 0) {
    payload.events = (db.events ?? []).filter((e) => e && str(e.title)).map((e) => ({
      title: e.title,
      date: str(e.date),
      time: str(e.time),
      location: str(e.location),
      type: str(e.type),
      description: str(e.description),
      color: str(e.color, '#7C9DFF'),
    }));
  }

  if (arr(db.announcements).length > 0) {
    payload.announcements = (db.announcements ?? [])
      .filter((a) => a && str(a.title))
      .map((a) => ({
        title: a.title,
        body: str(a.body),
        audience: str(a.audience),
        pinned: a.pinned === true,
        createdAt: str(a.createdAt),
      }));
  }

  return payload;
}
