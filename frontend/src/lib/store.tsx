'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Announcement,
  AttendanceDay,
  ClassRoom,
  DB,
  Invoice,
  SchoolEvent,
  SchoolProfile,
  SchoolOptions,
  Student,
  Teacher,
} from './types';
import { api } from './api';
import { OPTION_KEYS, OptionKey, ensureOptions } from './options';
import { emptyDB } from './seed';
import { buildImportPayload, normalizeImportInput, type ImportResult } from './import';

/* ------------------------------------------------------------------ */
/* Backend-synced store (sync-by-diff).                                */
/*                                                                     */
/* Pages keep the exact same interface: they call                      */
/*   const { db, update, reset, exportJSON, importJSON } = useDB()      */
/* and mutate via update((prev: DB) => next: DB) synchronously.        */
/*                                                                     */
/* Sync policy: every update() applies locally *immediately*, then     */
/* diffs prev vs next per collection and fires the matching API calls  */
/* fire-and-forget. Failures are logged (console.error) and surface    */
/* via `error`; local state is NOT rolled back (last-write-wins,       */
/* local-first). The next successful fetch (slug change / reset)       */
/* reconciles from the server, which is the source of truth.           */
/*                                                                     */
/* Added records are POSTed with their client temp id stripped; when   */
/* the server uuid comes back we swap the id locally AND remap every   */
/* reference to it (students -> attendance/invoices, teachers ->       */
/* classes, classes -> students/teachers), firing follow-up PUTs/POSTs */
/* for the remapped rows.                                              */
/* ------------------------------------------------------------------ */

/** Backfill per-school options for DBs saved before the Options feature. */
export function migrateDB(parsed: DB): DB {
  return { ...parsed, options: ensureOptions((parsed as Partial<DB>).options) };
}

interface StoreCtx {
  db: DB;
  loading: boolean;
  tenantSlug: string;
  /** @deprecated alias of tenantSlug — kept so older readers keep compiling. */
  tenantId: string;
  /** last sync/fetch error (null when healthy). Fetch retries on slug change / reset(). */
  error: string | null;
  /** durable failed-sync markers (localStorage `sprouts_pending_ops`, cap 200) for the active tenant. */
  pendingCount: number;
  /** last background-sync failure (null when the last sync was clean). Cleared by retrySync(). */
  lastSyncError: string | null;
  update: (fn: (prev: DB) => DB) => void;
  reset: () => void;
  /** Re-run the last load (same as reset) — lets UI offer a retry after a sync/fetch error. */
  retry: () => void;
  /** Reconcile with the server (refetch = source of truth) and clear this tenant's
   *  pending markers on success. Resolves true when the retry succeeded. */
  retrySync: () => Promise<boolean>;
  exportJSON: () => void;
  importJSON: (json: string) => boolean;
}

const Ctx = createContext<StoreCtx | null>(null);

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Server invoice `number` (human INV-XXXX) by invoice uuid. Display helper only — no UI depends on it. */
const invoiceNumbers = new Map<string, string>();
export function getInvoiceNumber(id: string): string | undefined {
  return invoiceNumbers.get(id);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);
/** Server FK columns accept uuid|null. Client temp ids ('s_x…', 'c1', '') are NOT valid — send null. */
const uuidOrNull = (v: string | null | undefined): string | null => (isUuid(v) ? (v as string) : null);
/** Runtime null from the server (unassigned class/teacher). Cast only — pages use find/=== which are null-safe. */
const nullId = (v: unknown): string => (v == null ? (null as unknown as string) : String(v));

const str = (v: unknown, fb = ''): string => (typeof v === 'string' ? v : fb);
const num = (v: unknown, fb = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb);
const optStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

/* ------------------------- server -> local ------------------------ */

type SRow = Record<string, unknown>;

function mapProfile(r: SRow): SchoolProfile {
  return {
    name: str(r.name),
    tagline: str(r.tagline),
    phone: str(r.phone),
    email: str(r.email),
    address: str(r.address),
    principal: str(r.principal),
  };
}

function mapClass(r: SRow): ClassRoom {
  return {
    id: str(r.id),
    name: str(r.name),
    ageGroup: str(r.ageGroup, '—'),
    capacity: num(r.capacity, 20),
    teacherId: nullId(r.teacherId),
    color: str(r.color, '#7C9DFF'),
    room: str(r.room, '—'),
    time: str(r.time, '—'),
  };
}

function mapStudent(r: SRow): Student {
  return {
    id: str(r.id),
    name: str(r.name),
    age: num(r.age),
    dob: str(r.dob),
    gender: str(r.gender),
    classId: nullId(r.classId),
    parent: str(r.parent),
    phone: str(r.phone),
    email: optStr(r.email),
    address: optStr(r.address),
    emoji: str(r.emoji, '🧒'),
    color: str(r.color, '#E4EBFF'),
    status: (str(r.status, 'active') as Student['status']) || 'active',
    joinedAt: str(r.joinedAt),
    allergies: optStr(r.allergies),
    notes: optStr(r.notes),
  };
}

function mapTeacher(r: SRow): Teacher {
  return {
    id: str(r.id),
    name: str(r.name),
    role: str(r.role),
    classId: nullId(r.classId),
    phone: str(r.phone),
    email: str(r.email),
    emoji: str(r.emoji, '🦉'),
    color: str(r.color, '#E4EBFF'),
    status: (str(r.status, 'active') as Teacher['status']) || 'active',
    joinedAt: str(r.joinedAt),
  };
}

function mapAttendance(r: SRow): AttendanceDay {
  const recs = (r.records ?? {}) as Record<string, unknown>;
  const records: AttendanceDay['records'] = {};
  for (const [k, v] of Object.entries(recs)) {
    if (v === 'present' || v === 'absent' || v === 'late' || v === 'half') records[k] = v;
  }
  const day: AttendanceDay = { date: str(r.date), records };
  if (typeof r.note === 'string' && r.note) day.note = r.note;
  return day;
}

function mapInvoice(r: SRow): Invoice {
  const id = str(r.id);
  if (typeof r.number === 'string' && r.number) invoiceNumbers.set(id, r.number);
  const inv: Invoice = {
    id,
    studentId: str(r.studentId),
    title: str(r.title),
    amount: num(r.amountCents, 0) / 100,
    dueDate: str(r.dueDate),
    issuedAt: str(r.issuedAt),
    status: (str(r.status, 'pending') as Invoice['status']) || 'pending',
  };
  if (typeof r.method === 'string' && r.method) inv.method = r.method;
  return inv;
}

function mapEvent(r: SRow): SchoolEvent {
  return {
    id: str(r.id),
    title: str(r.title),
    date: str(r.date),
    time: str(r.time),
    location: str(r.location, 'School campus'),
    type: str(r.type),
    description: str(r.description),
    color: str(r.color, '#7C9DFF'),
  };
}

function mapAnnouncement(r: SRow): Announcement {
  return {
    id: str(r.id),
    title: str(r.title),
    body: str(r.body),
    audience: str(r.audience),
    createdAt: str(r.createdAt).slice(0, 10),
    pinned: r.pinned === true,
  };
}

/** Fetch every page of a paginated list ({data,total,page,limit}); tolerates the old bare-array shape. */
async function fetchAllPages(path: string, slug: string): Promise<SRow[]> {
  const all: SRow[] = [];
  let page = 1;
  const limit = 200;
  for (;;) {
    const sep = path.includes('?') ? '&' : '?';
    const res = await api<{ data: SRow[]; total?: number } | SRow[]>(
      `${path}${sep}page=${page}&limit=${limit}`,
      { tenantSlug: slug }
    );
    // Old bare-array shape (endpoint not paginated yet): treat as one page.
    if (Array.isArray(res)) return [...all, ...res];
    const rows = res.data ?? [];
    // Paginated envelope without total (shouldn't happen): treat as one page.
    if (typeof res.total !== 'number') return [...all, ...rows];
    all.push(...rows);
    if (all.length >= res.total || rows.length === 0) break;
    page += 1;
    if (page > 500) break; // safety cap
  }
  return all;
}

async function fetchDB(slug: string): Promise<DB> {
  const opts = { tenantSlug: slug };
  const [profileRes, optionsRes, classesRows, studentsRows, teachersRows, attendanceRows, invoicesRows, eventsRows, announcementsRows] =
    await Promise.all([
      api<{ data: SRow }>('/tenants/profile', opts),
      api<{ data: SRow }>('/options', opts),
      fetchAllPages('/classes', slug),
      fetchAllPages('/students', slug),
      fetchAllPages('/teachers', slug),
      fetchAllPages('/attendance', slug),
      fetchAllPages('/invoices', slug),
      fetchAllPages('/events', slug),
      fetchAllPages('/announcements', slug),
    ]);
  const options = ensureOptions(optionsRes.data as Partial<SchoolOptions>);
  return migrateDB({
    profile: mapProfile(profileRes.data ?? {}),
    options,
    classes: classesRows.map(mapClass),
    students: studentsRows.map(mapStudent),
    teachers: teachersRows.map(mapTeacher),
    attendance: attendanceRows.map(mapAttendance),
    invoices: invoicesRows.map(mapInvoice),
    events: eventsRows.map(mapEvent),
    announcements: announcementsRows.map(mapAnnouncement),
  });
}

/* ------------------------- local -> server ------------------------ */

const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface CollectionDiff<T extends { id: string }> {
  added: T[];
  deleted: T[];
  changed: T[];
}

function diffById<T extends { id: string }>(prev: T[], next: T[]): CollectionDiff<T> {
  const pMap = new Map(prev.map((r) => [r.id, r]));
  const nMap = new Map(next.map((r) => [r.id, r]));
  return {
    added: next.filter((r) => !pMap.has(r.id)),
    deleted: prev.filter((r) => !nMap.has(r.id)),
    changed: next.filter((r) => {
      const p = pMap.get(r.id);
      return p !== undefined && !sameJSON(p, r);
    }),
  };
}

function studentPayload(s: Student): SRow {
  const out: SRow = {
    name: s.name,
    age: s.age,
    dob: s.dob,
    gender: s.gender,
    classId: uuidOrNull(s.classId),
    parent: s.parent,
    phone: s.phone,
    emoji: s.emoji,
    color: s.color,
    status: s.status,
    joinedAt: s.joinedAt,
  };
  if (s.email) out.email = s.email;
  if (s.address) out.address = s.address;
  if (s.allergies) out.allergies = s.allergies;
  if (s.notes) out.notes = s.notes;
  return out;
}

function teacherPayload(t: Teacher): SRow {
  const out: SRow = {
    name: t.name,
    role: t.role,
    classId: uuidOrNull(t.classId),
    phone: t.phone,
    emoji: t.emoji,
    color: t.color,
    status: t.status,
    joinedAt: t.joinedAt,
  };
  if (t.email) out.email = t.email;
  return out;
}

function classPayload(c: ClassRoom): SRow {
  return {
    name: c.name,
    ageGroup: c.ageGroup,
    capacity: c.capacity,
    room: c.room,
    time: c.time,
    color: c.color,
    teacherId: uuidOrNull(c.teacherId),
  };
}

function eventPayload(e: SchoolEvent): SRow {
  return {
    title: e.title,
    date: e.date,
    time: e.time,
    location: e.location,
    type: e.type,
    description: e.description,
    color: e.color,
  };
}

function announcementPayload(a: Announcement): SRow {
  return { title: a.title, body: a.body, audience: a.audience };
}

/** PUT /announcements/:id accepts content fields + pinned (pin-only flips still use POST /:id/pin). */
function announcementPutPayload(a: Announcement): SRow {
  return { ...announcementPayload(a), pinned: a.pinned };
}

/** PATCH /invoices/:id body for fields that differ (amount already in rupees). Empty = no-op. */
function invoicePatch(
  prev: Pick<Invoice, 'title' | 'amount' | 'dueDate' | 'issuedAt' | 'status'> & { method?: string },
  cur: Invoice
): SRow {
  const patch: SRow = {};
  if (prev.title !== cur.title) patch.title = cur.title;
  if (prev.amount !== cur.amount) patch.amount = cur.amount;
  if (prev.dueDate !== cur.dueDate) patch.dueDate = cur.dueDate;
  if (prev.issuedAt !== cur.issuedAt) patch.issuedAt = cur.issuedAt;
  if (prev.status !== cur.status) patch.status = cur.status;
  if ((prev.method ?? '') !== (cur.method ?? '')) patch.method = cur.method;
  return patch;
}

/** Attendance PUT accepts only server-known student uuids — temp ids are stripped (re-synced after id swap). */
function attendancePayload(d: AttendanceDay): SRow {
  const records: Record<string, string> = {};
  for (const [k, v] of Object.entries(d.records)) {
    if (isUuid(k)) records[k] = v;
  }
  const out: SRow = { records };
  if (d.note !== undefined) out.note = d.note;
  return out;
}

/* ----------------- durable pending-ops queue (sync reliability) ---- */

/* The sync layer is local-first fire-and-forget: every update() applies
 * immediately, then diffs prev vs next and fires API calls. When a batch
 * partially/totally fails we record ONE marker per failed batch here —
 * persisted in localStorage (`sprouts_pending_ops`, capped at 200) so the
 * "unsynced changes" signal survives reloads and can be shown in SyncBanner.
 *
 * Honest limitation: markers are failure *signals*, not replayable payloads.
 * Diffs are state-based and cumulative, so while the tab lives a later clean
 * sync provably heals earlier failures (current memory == server) and stale
 * markers are dropped. After a reload, unsynced in-memory edits are gone by
 * design (server is the source of truth) — retrySync() then reconciles by
 * refetching and clears the markers. Mount <SyncBanner/> inside the provider
 * (e.g. in (app)/layout.tsx) to make this visible. */

const PENDING_KEY = 'sprouts_pending_ops';
const MAX_PENDING_OPS = 200;

interface PendingOp {
  id: string;
  ts: string;
  slug: string;
  label: string;
  failed: number;
}

function readPendingOps(): PendingOp[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is PendingOp =>
        typeof o === 'object' && o !== null && typeof (o as PendingOp).id === 'string' && typeof (o as PendingOp).slug === 'string'
    );
  } catch {
    return [];
  }
}

function writePendingOps(ops: PendingOp[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(ops.slice(-MAX_PENDING_OPS)));
  } catch {}
}

/* ------------------------------- store ---------------------------- */

interface StoreProps {
  children: React.ReactNode;
  tenantSlug: string;
  /** @deprecated — use tenantSlug. Accepted so older callers keep compiling. */
  tenantId?: string;
  /** accepted but ignored (server is seeded); kept for prop compatibility. */
  seedPool?: number | null;
  schoolName?: string;
}

type SwappableCollection = 'classes' | 'students' | 'teachers' | 'events' | 'announcements' | 'invoices';

export function StoreProvider({ children, tenantSlug: slugProp, tenantId: legacyId, schoolName }: StoreProps) {
  const tenantSlug = slugProp || legacyId || '';
  const [db, setDb] = useState<DB>(() => emptyDB({ name: schoolName ?? 'My School', principal: '' }));
  const [loading, setLoading] = useState(() => Boolean(tenantSlug));
  const [error, setError] = useState<string | null>(null);
  // Sync-reliability state: durable failed-batch markers + last sync failure.
  const [pendingOps, setPendingOps] = useState<PendingOp[]>(() => readPendingOps());
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  // Markers for the active tenant only (queue may hold other tenants' markers).
  const pendingCount = useMemo(
    () => pendingOps.filter((op) => !tenantSlug || op.slug === tenantSlug).length,
    [pendingOps, tenantSlug]
  );

  const slugRef = useRef(tenantSlug);
  useEffect(() => {
    slugRef.current = tenantSlug;
  }, [tenantSlug]);
  const dbRef = useRef(db);
  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  const load = useCallback(
    async (slug: string, signal?: { cancelled: boolean }) => {
      setLoading(true);
      setError(null);
      try {
        const fetched = await fetchDB(slug);
        if (signal?.cancelled) return;
        dbRef.current = fetched;
        setDb(fetched);
      } catch (e) {
        if (signal?.cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load school data.';
        console.error('[store] fetch failed:', msg);
        setError(msg);
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!tenantSlug) {
      return;
    }
    const signal = { cancelled: false };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch-on-tenant-change: load() only sets state from the async server response
    void load(tenantSlug, signal);
    return () => {
      signal.cancelled = true;
    };
  }, [tenantSlug, load]);

  /** Swap a client temp id for the server uuid + remap every reference, then fire follow-up syncs. */
  const adoptServerId = useCallback(
    (collection: SwappableCollection, tempId: string, serverId: string, posted?: SRow) => {
      const slug = slugRef.current;
      if (!slug || tempId === serverId) return;
      const prev = dbRef.current;
      const swap = <T extends { id: string }>(arr: T[]): T[] =>
        arr.map((r) => (r.id === tempId ? { ...r, id: serverId } : r));

      const next: DB = {
        ...prev,
        classes: swap(prev.classes).map((c) =>
          collection === 'teachers' && c.teacherId === tempId ? { ...c, teacherId: serverId } : c
        ),
        students: swap(prev.students).map((s) =>
          collection === 'classes' && s.classId === tempId ? { ...s, classId: serverId } : s
        ),
        teachers: swap(prev.teachers).map((t) =>
          collection === 'classes' && t.classId === tempId ? { ...t, classId: serverId } : t
        ),
        invoices: swap(prev.invoices).map((i) =>
          collection === 'students' && i.studentId === tempId ? { ...i, studentId: serverId } : i
        ),
        attendance: prev.attendance.map((d) => {
          if (collection !== 'students' || !(tempId in d.records)) return d;
          const records = { ...d.records };
          records[serverId] = records[tempId];
          delete records[tempId];
          return { ...d, records };
        }),
        events: collection === 'events' ? swap(prev.events) : prev.events,
        announcements: collection === 'announcements' ? swap(prev.announcements) : prev.announcements,
      };
      dbRef.current = next;
      setDb(next);

      const call = (p: Promise<unknown>) =>
        p.catch((e) => console.error('[store] follow-up sync failed:', e instanceof Error ? e.message : e));

      // 1. Rapid edits made while the POST was in flight: push the newest state (collections that support PUT/PATCH).
      if (posted) {
        const putPath =
          collection === 'students'
            ? '/students'
            : collection === 'teachers'
              ? '/teachers'
              : collection === 'classes'
                ? '/classes'
                : collection === 'events'
                  ? '/events'
                  : collection === 'announcements'
                    ? '/announcements'
                    : null;
        if (putPath) {
          const cur =
            collection === 'students'
              ? next.students.find((r) => r.id === serverId)
              : collection === 'teachers'
                ? next.teachers.find((r) => r.id === serverId)
                : collection === 'classes'
                  ? next.classes.find((r) => r.id === serverId)
                  : collection === 'events'
                    ? next.events.find((r) => r.id === serverId)
                    : next.announcements.find((r) => r.id === serverId);
          const payload = !cur
            ? null
            : collection === 'students'
              ? studentPayload(cur as Student)
              : collection === 'teachers'
                ? teacherPayload(cur as Teacher)
                : collection === 'classes'
                  ? classPayload(cur as ClassRoom)
                  : collection === 'events'
                    ? eventPayload(cur as SchoolEvent)
                    : announcementPutPayload(cur as Announcement);
          if (payload && !sameJSON(payload, posted)) {
            void call(api(`${putPath}/${serverId}`, { method: 'PUT', tenantSlug: slug, body: JSON.stringify(payload) }));
          }
        } else if (collection === 'invoices') {
          // POST body shape has no status/method — the fresh row is pending with no method.
          const cur = next.invoices.find((r) => r.id === serverId);
          if (cur) {
            const patch = invoicePatch(
              {
                title: str(posted.title),
                amount: num(posted.amount),
                dueDate: str(posted.dueDate),
                issuedAt: str(posted.issuedAt),
                status: 'pending' as Invoice['status'],
              },
              cur as Invoice
            );
            // A flip to paid is recorded by the pay flow below (section 4) — don't PATCH status:'paid'.
            if ((patch.status as string) === 'paid') delete patch.status;
            if (Object.keys(patch).length > 0) {
              void call(
                api(`/invoices/${serverId}`, { method: 'PATCH', tenantSlug: slug, body: JSON.stringify(patch) })
              );
            }
          }
        }
      }

      // 2. Remapped FK links were POSTed/PUT as null (temp id invalid) — push the restored uuid link.
      if (collection === 'classes') {
        for (const s of next.students) {
          if (isUuid(s.id) && s.classId === serverId)
            void call(
              api(`/students/${s.id}`, { method: 'PUT', tenantSlug: slug, body: JSON.stringify(studentPayload(s)) })
            );
        }
        for (const t of next.teachers) {
          if (isUuid(t.id) && t.classId === serverId)
            void call(
              api(`/teachers/${t.id}`, { method: 'PUT', tenantSlug: slug, body: JSON.stringify(teacherPayload(t)) })
            );
        }
      }
      if (collection === 'teachers') {
        for (const c of next.classes) {
          if (isUuid(c.id) && c.teacherId === serverId)
            void call(
              api(`/classes/${c.id}`, { method: 'PUT', tenantSlug: slug, body: JSON.stringify(classPayload(c)) })
            );
        }
      }

      // 3. Student swap: attendance rows + invoices that referenced the temp id.
      if (collection === 'students') {
        for (const d of next.attendance) {
          if (serverId in d.records)
            void call(
              api(`/attendance/${d.date}`, { method: 'PUT', tenantSlug: slug, body: JSON.stringify(attendancePayload(d)) })
            );
        }
        for (const inv of next.invoices) {
          if (!isUuid(inv.id) && inv.studentId === serverId)
            void postInvoice(slug, inv, (t, s, p) => adoptServerIdRef.current('invoices', t, s, p));
        }
      }

      // 4. Invoice that was flipped to paid before its POST resolved: record the payment now.
      if (collection === 'invoices') {
        const cur = next.invoices.find((r) => r.id === serverId);
        if (cur?.status === 'paid')
          void call(api(`/invoices/${serverId}/pay`, { method: 'POST', tenantSlug: slug }));
      }
    },
    []
  );
  // adoptServerId is []-stable so the ref is always fresh — never reassign it
  // (react-hooks/immutability forbids mutating hook-passed values).
  const adoptServerIdRef = useRef(adoptServerId);

  const syncDiff = useCallback(
    async (slug: string, prev: DB, next: DB) => {
      const outcomes: Promise<boolean>[] = [];
      const call = (path: string, init: RequestInit) =>
        outcomes.push(
          api(path, { ...init, tenantSlug: slug }).then(
            () => true,
            (e) => {
              console.error(`[store] sync ${init.method ?? 'GET'} ${path} failed:`, e instanceof Error ? e.message : e);
              return false;
            }
          )
        );

      if (!sameJSON(prev.profile, next.profile)) {
        call('/tenants/profile', { method: 'PUT', body: JSON.stringify(next.profile) });
      }

      for (const key of OPTION_KEYS) {
        const k = key as OptionKey;
        if (!sameJSON(prev.options[k], next.options[k])) {
          call(`/options/${k}`, { method: 'PUT', body: JSON.stringify({ values: next.options[k] }) });
        }
      }

      const syncCollection = <T extends { id: string }>(
        base: string,
        payload: (r: T) => SRow,
        d: CollectionDiff<T>,
        opts?: { put?: boolean }
      ) => {
        for (const r of d.added) {
          outcomes.push(
            (async () => {
              try {
                const res = await api<{ data: SRow }>(base, {
                  method: 'POST',
                  tenantSlug: slug,
                  body: JSON.stringify(payload(r)),
                });
                const serverId = str(res.data?.id);
                if (serverId && serverId !== r.id) {
                  if (base === '/invoices' && typeof res.data?.number === 'string')
                    invoiceNumbers.set(serverId, res.data.number as string);
                  adoptServerIdRef.current(base.slice(1) as SwappableCollection, r.id, serverId, payload(r));
                }
                return true;
              } catch (e) {
                console.error(`[store] sync POST ${base} failed:`, e instanceof Error ? e.message : e);
                return false;
              }
            })()
          );
        }
        for (const r of d.deleted) {
          // temp ids never reached the server — nothing to delete.
          if (!isUuid(r.id)) continue;
          call(`${base}/${r.id}`, { method: 'DELETE' });
        }
        if (opts?.put !== false) {
          for (const r of d.changed) {
            // not on the server yet (POST in flight) — adoptServerId pushes newest state after swap.
            if (!isUuid(r.id)) continue;
            call(`${base}/${r.id}`, { method: 'PUT', body: JSON.stringify(payload(r)) });
          }
        }
      };

      syncCollection<ClassRoom>('/classes', classPayload, diffById(prev.classes, next.classes));
      syncCollection<Student>('/students', studentPayload, diffById(prev.students, next.students));
      syncCollection<Teacher>('/teachers', teacherPayload, diffById(prev.teachers, next.teachers));

      // Events: POST + PUT /events/:id (partial; full payload is a valid partial) + DELETE.
      {
        const d = diffById(prev.events, next.events);
        syncCollection<SchoolEvent>('/events', eventPayload, { ...d, changed: [] }, { put: false });
        for (const r of d.changed) {
          // not on the server yet (POST in flight) — adoptServerId pushes newest state after swap.
          if (!isUuid(r.id)) continue;
          call(`/events/${r.id}`, { method: 'PUT', body: JSON.stringify(eventPayload(r)) });
        }
      }

      // Announcements: POST + PUT /:id for content edits; POST /:id/pin only for pure pin flips + DELETE.
      {
        const d = diffById(prev.announcements, next.announcements);
        syncCollection<Announcement>('/announcements', announcementPayload, { ...d, changed: [] }, { put: false });
        const prevById = new Map(prev.announcements.map((a) => [a.id, a]));
        for (const r of d.changed) {
          if (!isUuid(r.id)) continue;
          const p = prevById.get(r.id);
          if (!p) continue;
          const contentChanged = p.title !== r.title || p.body !== r.body || p.audience !== r.audience;
          if (contentChanged) {
            // PUT covers pinned too — never also hit /pin here (it toggles, so it would double-flip).
            call(`/announcements/${r.id}`, { method: 'PUT', body: JSON.stringify(announcementPutPayload(r)) });
          } else if (p.pinned !== r.pinned) {
            call(`/announcements/${r.id}/pin`, { method: 'POST' });
          }
        }
      }

      // Invoices: POST + PATCH /:id for field edits + POST /:id/pay for paying + DELETE.
      // Paying keeps the dedicated /pay call; un-paying (paid -> pending/overdue) is PATCH {status}.
      {
        const d = diffById(prev.invoices, next.invoices);
        const prevById = new Map(prev.invoices.map((i) => [i.id, i]));
        for (const r of d.added) {
          if (!isUuid(r.studentId)) {
            console.error('[store] invoice skipped: student is not synced yet:', r.id);
            continue;
          }
          outcomes.push(postInvoice(slug, r, (t, s, p) => adoptServerIdRef.current('invoices', t, s, p)));
        }
        for (const r of d.deleted) {
          if (!isUuid(r.id)) continue; // never reached the server (or POST still in flight)
          call(`/invoices/${r.id}`, { method: 'DELETE' });
        }
        for (const r of d.changed) {
          const p = prevById.get(r.id);
          if (!p || !isUuid(r.id)) continue;
          if (p.status !== 'paid' && r.status === 'paid') {
            // Paying: dedicated endpoint. If other fields changed too, PATCH them first.
            const patch = invoicePatch(p, r);
            delete patch.status;
            if (Object.keys(patch).length > 0) {
              call(`/invoices/${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
            }
            call(`/invoices/${r.id}/pay`, { method: 'POST' });
          } else {
            const patch = invoicePatch(p, r);
            if (Object.keys(patch).length > 0) {
              call(`/invoices/${r.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
            }
          }
        }
      }

      // Attendance: PUT per changed/new date; DELETE /attendance/:date per removed day.
      {
        const prevByDate = new Map(prev.attendance.map((d) => [d.date, d]));
        const nextDates = new Set(next.attendance.map((d) => d.date));
        for (const d of next.attendance) {
          const p = prevByDate.get(d.date);
          if (!p || !sameJSON(p.records, d.records) || (p.note ?? '') !== (d.note ?? '')) {
            const payload = attendancePayload(d);
            if (!p && Object.keys(payload.records as Record<string, string>).length === 0 && !d.note) continue;
            call(`/attendance/${d.date}`, { method: 'PUT', body: JSON.stringify(payload) });
          }
        }
        for (const d of prev.attendance) {
          if (!nextDates.has(d.date)) {
            call(`/attendance/${d.date}`, { method: 'DELETE' });
          }
        }
      }

      if (outcomes.length > 0) {
        const results = await Promise.all(outcomes);
        if (results.some((ok) => !ok)) {
          const msg = 'Some changes failed to sync — they are kept locally and will retry on your next edit.';
          setError(msg);
          setLastSyncError(msg);
          // Durable marker: one entry per failed batch (cap 200). setState
          // setters are stable so this []-memoized callback stays lint-clean.
          const nextQ = [
            ...readPendingOps(),
            { id: uid('op'), ts: new Date().toISOString(), slug, label: 'sync-batch', failed: results.filter((r) => !r).length },
          ].slice(-MAX_PENDING_OPS);
          writePendingOps(nextQ);
          setPendingOps(nextQ);
        } else {
          // A clean sync clears a previous sync-failure notice (fetch errors are set by load()).
          setError((prev) => (prev !== null && prev.startsWith('Some changes failed') ? null : prev));
          // Diffs are cumulative: a clean sync proves current memory == server,
          // so earlier failure markers for this tenant are healed — drop them.
          setLastSyncError(null);
          const remaining = readPendingOps().filter((op) => op.slug !== slug);
          writePendingOps(remaining);
          setPendingOps(remaining);
        }
      }
    },
    []
  );
  const syncDiffRef = useRef(syncDiff);
  useEffect(() => {
    syncDiffRef.current = syncDiff;
  }, [syncDiff]);

  const update = useCallback((fn: (prev: DB) => DB) => {
    // Synchronous local apply (keeps the page-level contract), then fire-and-forget diff sync.
    // dbRef (not the setDb updater) is used so React StrictMode double-invoking updaters can't double-POST.
    const prev = dbRef.current;
    const next = migrateDB(fn(migrateDB(prev)));
    dbRef.current = next;
    setDb(next);
    const slug = slugRef.current;
    if (!slug || sameJSON(prev, next)) return;
    void syncDiffRef.current(slug, prev, next);
  }, []);

  /**
   * Manual sync retry for SyncBanner / error states: refetch the server (the
   * source of truth) into memory and, on success, clear this tenant's pending
   * markers. Resolves true when the retry reconciled cleanly.
   */
  const retrySync = useCallback(async (): Promise<boolean> => {
    const slug = slugRef.current;
    if (!slug) return false;
    setLastSyncError(null);
    try {
      const fetched = await fetchDB(slug);
      dbRef.current = fetched;
      setDb(fetched);
      setError(null);
      const remaining = readPendingOps().filter((op) => op.slug !== slug);
      writePendingOps(remaining);
      setPendingOps(remaining);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sync retry failed.';
      console.error('[store] retrySync failed:', msg);
      setLastSyncError(msg);
      return false;
    }
  }, []);

  /**
   * Bulk import via POST /import: maps the file (export-shaped or
   * import-shaped JSON) to name-keyed rows, POSTs, then refetches from the
   * server. The (json: string) => boolean contract is synchronous, so false
   * means the file didn't parse / holds nothing importable / no tenant, and
   * true means the payload was dispatched (the server result lands via
   * refetch). Network failures are logged + surfaced via `error`.
   */
  const importJSON = useCallback(
    (json: string): boolean => {
      const slug = slugRef.current;
      if (!slug) {
        console.error('[store] importJSON: no tenant selected.');
        return false;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch (e) {
        console.error('[store] importJSON: invalid JSON:', e instanceof Error ? e.message : e);
        return false;
      }
      let payload;
      try {
        payload = buildImportPayload(normalizeImportInput(parsed));
      } catch (e) {
        console.error('[store] importJSON: could not map payload:', e instanceof Error ? e.message : e);
        return false;
      }
      const rowKeys = ['classes', 'students', 'teachers', 'invoices', 'events', 'announcements'] as const;
      const hasRows =
        rowKeys.some((k) => (payload[k] ?? []).length > 0) || payload.profile !== undefined || payload.options !== undefined;
      if (!hasRows) {
        console.error('[store] importJSON: nothing importable found in file.');
        return false;
      }
      void (async () => {
        try {
          const res = await api<ImportResult>('/import', {
            method: 'POST',
            tenantSlug: slug,
            body: JSON.stringify(payload),
          });
          console.info('[store] import ok — imported:', res?.imported, 'skipped:', res?.skipped);
          await load(slug);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Import failed.';
          console.error('[store] import failed:', msg);
          setError(`Import failed: ${msg}`);
        }
      })();
      return true;
    },
    [load]
  );

  const value = useMemo<StoreCtx>(
    () => ({
      db,
      loading,
      tenantSlug,
      tenantId: tenantSlug, // deprecated alias
      error,
      pendingCount,
      lastSyncError,
      update,
      reset: () => {
        // Server is the source of truth now — reload it.
        if (tenantSlug) void load(tenantSlug);
      },
      retry: () => {
        // Explicit retry after a fetch/sync error surfaced via `error`.
        setError(null);
        if (tenantSlug) void load(tenantSlug);
      },
      retrySync,
      exportJSON: () => {
        const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tenantSlug || 'school'}-backup-${todayISO()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      },
      importJSON,
    }),
    [db, loading, tenantSlug, error, pendingCount, lastSyncError, update, load, importJSON, retrySync]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** POST one invoice (rupees in, uuid out); adopt swaps the temp id (pay follow-up included). Resolves false when the POST fails. */
async function postInvoice(
  slug: string,
  inv: Invoice,
  adopt: (tempId: string, serverId: string, posted?: SRow) => void
): Promise<boolean> {
  if (isUuid(inv.id) || !isUuid(inv.studentId)) return true;
  const body: SRow = {
    studentId: inv.studentId,
    title: inv.title,
    amount: inv.amount,
    dueDate: inv.dueDate,
    issuedAt: inv.issuedAt,
  };
  try {
    const res = await api<{ data: SRow }>('/invoices', {
      method: 'POST',
      tenantSlug: slug,
      body: JSON.stringify(body),
    });
    const serverId = str(res.data?.id);
    if (typeof res.data?.number === 'string' && serverId) invoiceNumbers.set(serverId, res.data.number as string);
    if (serverId && serverId !== inv.id) adopt(inv.id, serverId, body);
    return true;
  } catch (e) {
    console.error('[store] sync POST /invoices failed:', e instanceof Error ? e.message : e);
    return false;
  }
}

export function useDB() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDB must be used inside StoreProvider');
  return v;
}

/* Non-blocking sync-reliability banner. Render once inside <StoreProvider>
 * (e.g. in (app)/layout.tsx above the page content) — it returns null when
 * healthy and otherwise floats a dismissible bar with a Retry button wired
 * to retrySync(). Purely presentational: no navigation, no blocking. */
export function SyncBanner() {
  const { pendingCount, lastSyncError, retrySync } = useDB();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const err = lastSyncError && lastSyncError !== dismissed ? lastSyncError : null;
  if (pendingCount === 0 && !err) return null;
  const onRetry = async () => {
    setBusy(true);
    try {
      await retrySync();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      role="status"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#FFE1A8] bg-[#FFF7E6] px-4 py-2.5 shadow-lg"
    >
      <span className="text-[13px] font-bold text-[#8A6D00]">
        {pendingCount > 0
          ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} not synced yet.`
          : ''}{pendingCount > 0 && err ? ' ' : ''}{err ?? ''}
      </span>
      <button
        onClick={onRetry}
        disabled={busy}
        className="shrink-0 rounded-xl bg-[#1E1B2E] px-3 py-1.5 text-[12px] font-black text-white hover:bg-black disabled:opacity-60"
      >
        {busy ? 'Retrying…' : 'Retry'}
      </button>
      {err && (
        <button
          onClick={() => setDismissed(err)}
          aria-label="Dismiss sync error"
          className="shrink-0 rounded-lg px-2 py-1 text-[13px] font-black text-[#8A6D00]/60 hover:text-[#8A6D00]"
        >
          ✕
        </button>
      )}
    </div>
  );
}

export function useLocalBool(key: string, initial: boolean) {
  const [val, setVal] = useState<boolean>(() => {
    try {
      const r = localStorage.getItem(key);
      return r !== null ? r === '1' : initial;
    } catch {
      return initial;
    }
  });
  const set = (b: boolean) => {
    setVal(b);
    try {
      localStorage.setItem(key, b ? '1' : '0');
    } catch {}
  };
  return [val, set] as const;
}
