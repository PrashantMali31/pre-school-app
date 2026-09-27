import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/* Enums — system-level, fixed. Per-school dropdowns (roles, genders, …) stay TEXT. */
export const planEnum = pgEnum('plan', ['Starter', 'Pro', 'Enterprise']);
export const roleEnum = pgEnum('role', ['Admin', 'Teacher', 'Parent']);
export const studentStatusEnum = pgEnum('student_status', ['active', 'inactive', 'waitlist']);
export const teacherStatusEnum = pgEnum('teacher_status', ['active', 'leave']);
export const attendanceEnum = pgEnum('attendance_status', ['present', 'absent', 'late', 'half']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['paid', 'pending', 'overdue']);
export const enquiryStageEnum = pgEnum('enquiry_stage', ['New', 'Tour', 'Applied', 'Enrolled']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['active', 'past_due', 'canceled', 'expired']);
export const billingCycleEnum = pgEnum('billing_cycle', ['monthly', 'yearly', 'custom']);
export const billingPaymentStatusEnum = pgEnum('billing_payment_status', ['paid', 'failed', 'pending']);

const ts = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const tsUpd = () => timestamp('updated_at', { withTimezone: true }).defaultNow().notNull();

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    tagline: text('tagline').notNull().default('A happy place to grow'),
    plan: planEnum('plan').notNull().default('Starter'),
    demo: boolean('demo').notNull().default(false),
    seedPool: integer('seed_pool'),
    createdAt: ts(),
    updatedAt: tsUpd(),
  },
  (t) => [uniqueIndex('tenants_slug_uq').on(t.slug)]
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull(), // stored lowercased
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: ts(),
    updatedAt: tsUpd(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)]
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('Admin'),
    createdAt: ts(),
  },
  (t) => [
    uniqueIndex('memberships_user_tenant_uq').on(t.userId, t.tenantId),
    index('memberships_tenant_idx').on(t.tenantId),
  ]
);

export const schoolProfiles = pgTable('school_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }).unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull().default(''),
  phone: text('phone').notNull().default(''),
  email: text('email').notNull().default(''),
  address: text('address').notNull().default(''),
  principal: text('principal').notNull().default(''),
  createdAt: ts(),
  updatedAt: tsUpd(),
});

export const schoolOptions = pgTable('school_options', {
  id: uuid('id').defaultRandom().primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }).unique(),
  staffRoles: text('staff_roles').array().notNull(),
  genders: text('genders').array().notNull(),
  eventTypes: text('event_types').array().notNull(),
  sources: text('sources').array().notNull(),
  audiences: text('audiences').array().notNull(),
  feeTitles: text('fee_titles').array().notNull(),
  createdAt: ts(),
  updatedAt: tsUpd(),
});

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    ageGroup: text('age_group').notNull().default('—'),
    capacity: integer('capacity').notNull().default(20),
    teacherId: uuid('teacher_id'),
    color: text('color').notNull().default('#7C9DFF'),
    room: text('room').notNull().default('—'),
    time: text('time').notNull().default('—'),
    createdAt: ts(),
    updatedAt: tsUpd(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('classes_tenant_idx').on(t.tenantId)]
);

export const students = pgTable(
  'students',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    age: integer('age').notNull(),
    dob: date('dob').notNull(),
    gender: text('gender').notNull(),
    parent: text('parent').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    address: text('address'),
    emoji: text('emoji').notNull().default('🧒'),
    color: text('color').notNull().default('#E4EBFF'),
    status: studentStatusEnum('status').notNull().default('active'),
    joinedAt: date('joined_at').notNull(),
    allergies: text('allergies'),
    notes: text('notes'),
    createdAt: ts(),
    updatedAt: tsUpd(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('students_tenant_idx').on(t.tenantId), index('students_class_idx').on(t.classId)]
);

export const teachers = pgTable(
  'teachers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    role: text('role').notNull(),
    phone: text('phone').notNull(),
    email: text('email').notNull().default(''),
    emoji: text('emoji').notNull().default('🦉'),
    color: text('color').notNull().default('#E4EBFF'),
    status: teacherStatusEnum('status').notNull().default('active'),
    joinedAt: date('joined_at').notNull(),
    createdAt: ts(),
    updatedAt: tsUpd(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('teachers_tenant_idx').on(t.tenantId)]
);

export const attendanceDays = pgTable(
  'attendance_days',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    note: text('note'),
    createdAt: ts(),
  },
  (t) => [uniqueIndex('attendance_tenant_date_uq').on(t.tenantId, t.date)]
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    dayId: uuid('day_id').notNull().references(() => attendanceDays.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    status: attendanceEnum('status').notNull(),
  },
  (t) => [uniqueIndex('attendance_day_student_uq').on(t.dayId, t.studentId)]
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    number: text('number').notNull(), // human INV-XXXX, unique per tenant
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    amountCents: integer('amount_cents').notNull(),
    dueDate: date('due_date').notNull(),
    issuedAt: date('issued_at').notNull(),
    status: invoiceStatusEnum('status').notNull().default('pending'),
    method: text('method'),
    createdAt: ts(),
    updatedAt: tsUpd(),
  },
  (t) => [
    uniqueIndex('invoices_tenant_number_uq').on(t.tenantId, t.number),
    index('invoices_tenant_idx').on(t.tenantId),
    index('invoices_student_idx').on(t.studentId),
  ]
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    date: date('date').notNull(),
    time: text('time').notNull(),
    location: text('location').notNull().default('School campus'),
    type: text('type').notNull(),
    description: text('description').notNull().default(''),
    color: text('color').notNull().default('#7C9DFF'),
    createdAt: ts(),
    updatedAt: tsUpd(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('events_tenant_date_idx').on(t.tenantId, t.date)]
);

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull(),
    audience: text('audience').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: ts(),
    updatedAt: tsUpd(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('announcements_tenant_idx').on(t.tenantId)]
);

export const enquiries = pgTable(
  'enquiries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    childName: text('child_name').notNull(),
    age: integer('age').notNull(),
    parent: text('parent').notNull(),
    phone: text('phone').notNull(),
    source: text('source').notNull(),
    stage: enquiryStageEnum('stage').notNull().default('New'),
    note: text('note').notNull().default(''),
    createdAt: ts(),
    updatedAt: tsUpd(),
  },
  (t) => [index('enquiries_tenant_idx').on(t.tenantId)]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: ts(),
  },
  (t) => [index('refresh_user_idx').on(t.userId)]
);

export const passwordResets = pgTable(
  'password_resets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => [index('password_resets_user_idx').on(t.userId)]
);

export const parentLinks = pgTable(
  'parent_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    createdAt: ts(),
  },
  (t) => [
    uniqueIndex('parent_links_user_student_uq').on(t.userId, t.studentId),
    index('parent_links_tenant_user_idx').on(t.tenantId, t.userId),
  ]
);

export const inviteTokens = pgTable(
  'invite_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(), // stored lowercased
    role: roleEnum('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: ts(),
  },
  (t) => [index('invite_tokens_tenant_idx').on(t.tenantId)]
);

/* Parent communication: delivery log + reminder runs (append-only addition).
   Channels/statuses/kinds are plain TEXT (enum-string) so no new pg enums. */
export const messageDeliveries = pgTable(
  'message_deliveries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    announcementId: uuid('announcement_id').references(() => announcements.id, { onDelete: 'set null' }),
    channel: text('channel').notNull(), // inapp | sms | whatsapp
    recipient: text('recipient').notNull(), // phone number or userId
    status: text('status').notNull().default('queued'), // queued | sent | failed
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    createdAt: ts(),
  },
  (t) => [
    index('message_deliveries_tenant_idx').on(t.tenantId),
    index('message_deliveries_announcement_idx').on(t.announcementId),
  ]
);

export const reminderRuns = pgTable(
  'reminder_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // fee | attendance
    targetCount: integer('target_count').notNull().default(0),
    sentCount: integer('sent_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts(),
  },
  (t) => [index('reminder_runs_tenant_idx').on(t.tenantId)]
);

/* Fee-money handling: one row per cash/card/UPI/bank collection against an
   invoice. Refunds are NOT negative rows — a refund/correction is recorded by
   setting voidedAt on the original payment (void records). amountCents > 0.
   NOTE: invoice_status enum stays paid|pending|overdue (no 'partial'); partial
   is derived (0 < paid < total) and exposed as balanceCents in responses. */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    amountCents: integer('amount_cents').notNull(),
    method: text('method').notNull(), // Cash | UPI | Card | Bank (validated in routes)
    reference: text('reference'),
    receivedAt: date('received_at').notNull(), // YYYY-MM-DD
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts(),
    updatedAt: tsUpd(),
  },
  (t) => [index('payments_tenant_idx').on(t.tenantId), index('payments_invoice_idx').on(t.invoiceId)]
);

/* Trust: append-only audit trail (who did what, per tenant).
   Writers use writeAudit() in src/utils/audit.ts — never insert directly from
   route handlers so the call shape stays uniform (tenantId, userId, action,
   entity, entityId, summary). Reads are Admin+Teacher via GET /audit. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // e.g. students.create, payments.void, auth.rotate-demo
    entity: text('entity').notNull(), // e.g. students, invoices, tenant
    entityId: text('entity_id'),
    summary: text('summary').notNull().default(''),
    createdAt: ts(),
  },
  (t) => [index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt)]
);

/* Safety ops (append-only): pickup authorization, health/incident log,
   class timetable, transport. Kinds/severities stay TEXT enum-strings. */
export const pickupContacts = pgTable(
  'pickup_contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    relation: text('relation').notNull().default(''),
    phone: text('phone').notNull().default(''),
    pinHash: text('pin_hash'),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: ts(),
  },
  (t) => [index('pickup_contacts_tenant_student_idx').on(t.tenantId, t.studentId)]
);

export const pickupLog = pgTable(
  'pickup_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => pickupContacts.id, { onDelete: 'set null' }),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }).defaultNow().notNull(),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: ts(),
  },
  (t) => [index('pickup_log_tenant_student_idx').on(t.tenantId, t.studentId)]
);

export const incidents = pgTable(
  'incidents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // injury | illness | allergy | behavior | other
    severity: text('severity').notNull(), // low | medium | high
    title: text('title').notNull(),
    detail: text('detail').notNull().default(''),
    occurredAt: date('occurred_at').notNull(),
    notifiedParent: boolean('notified_parent').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts(),
  },
  (t) => [index('incidents_tenant_student_idx').on(t.tenantId, t.studentId)]
);

export const timetableSlots = pgTable(
  'timetable_slots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(), // 0-6
    startTime: text('start_time').notNull(), // HH:MM
    endTime: text('end_time').notNull(), // HH:MM
    activity: text('activity').notNull(),
    teacherId: uuid('teacher_id').references(() => teachers.id, { onDelete: 'set null' }),
    createdAt: ts(),
  },
  (t) => [index('timetable_tenant_class_idx').on(t.tenantId, t.classId)]
);

export const busRoutes = pgTable(
  'bus_routes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    vehicleNo: text('vehicle_no').notNull().default(''),
    driverName: text('driver_name').notNull().default(''),
    driverPhone: text('driver_phone').notNull().default(''),
    createdAt: ts(),
  },
  (t) => [index('bus_routes_tenant_idx').on(t.tenantId)]
);

export const busStops = pgTable(
  'bus_stops',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    routeId: uuid('route_id')
      .notNull()
      .references(() => busRoutes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    pickupTime: text('pickup_time').notNull(), // HH:MM
    order: integer('order').notNull().default(0),
    createdAt: ts(),
  },
  (t) => [index('bus_stops_route_idx').on(t.routeId)]
);

/* Staff leave + payroll (append-only): leave requests, salary structures,
   payroll runs, payslips. Kinds/statuses stay TEXT enum-strings. */
export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // sick | casual | earned | unpaid
    fromDate: date('from_date').notNull(), // YYYY-MM-DD
    toDate: date('to_date').notNull(), // YYYY-MM-DD
    days: integer('days').notNull(),
    reason: text('reason').notNull().default(''),
    status: text('status').notNull().default('pending'), // pending | approved | rejected
    decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => [index('leave_requests_tenant_idx').on(t.tenantId)]
);

export const salaryStructures = pgTable(
  'salary_structures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    basicCents: integer('basic_cents').notNull().default(0),
    allowancesCents: integer('allowances_cents').notNull().default(0),
    effectiveFrom: date('effective_from').notNull(),
    createdAt: ts(),
    updatedAt: tsUpd(),
  },
  (t) => [
    uniqueIndex('salary_structures_teacher_uq').on(t.teacherId),
    index('salary_structures_tenant_idx').on(t.tenantId),
  ]
);

export const payrollRuns = pgTable(
  'payroll_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    month: text('month').notNull(), // YYYY-MM
    status: text('status').notNull().default('draft'), // draft | finalized | paid
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts(),
  },
  (t) => [uniqueIndex('payroll_runs_tenant_month_uq').on(t.tenantId, t.month)]
);

export const payslips = pgTable(
  'payslips',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => payrollRuns.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => teachers.id, { onDelete: 'cascade' }),
    basicCents: integer('basic_cents').notNull(),
    allowancesCents: integer('allowances_cents').notNull(),
    unpaidLeaveDays: integer('unpaid_leave_days').notNull().default(0),
    leaveDeductionCents: integer('leave_deduction_cents').notNull().default(0),
    netCents: integer('net_cents').notNull(),
    status: text('status').notNull().default('pending'), // pending | paid
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidMethod: text('paid_method'),
    reference: text('reference'),
  },
  (t) => [index('payslips_run_idx').on(t.runId)]
);

/* Subscription billing (SaaS revenue): plan catalog + per-tenant subscription
 * lifecycle + append-only payment ledger. Money moves in test mode
 * (provider 'test'); a real gateway later only adds provider + webhook
 * handling around the same rows. Kinds stay TEXT enum-strings. */
export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(), // starter | pro | enterprise
    name: text('name').notNull(),
    tagline: text('tagline').notNull().default(''),
    priceMonthlyCents: integer('price_monthly_cents').notNull().default(0),
    priceYearlyCents: integer('price_yearly_cents'), // null = custom quote
    maxStudents: integer('max_students'), // null = unlimited
    maxTeachers: integer('max_teachers'),
    features: text('features').array().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    sort: integer('sort').notNull().default(0),
    createdAt: ts(),
    updatedAt: tsUpd(),
  },
  (t) => [uniqueIndex('subscription_plans_code_uq').on(t.code)]
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    cycle: billingCycleEnum('cycle').notNull().default('monthly'),
    periodStart: timestamp('period_start', { withTimezone: true }).defaultNow().notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }), // null = never expires (free plan)
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: ts(),
    updatedAt: tsUpd(),
  },
  (t) => [index('subscriptions_tenant_idx').on(t.tenantId)]
);

export const billingPayments = pgTable(
  'billing_payments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('INR'),
    kind: text('kind').notNull().default('subscription'), // subscription | renewal | plan_change
    status: billingPaymentStatusEnum('status').notNull().default('paid'),
    provider: text('provider').notNull().default('test'),
    providerRef: text('provider_ref'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts(),
  },
  (t) => [index('billing_payments_tenant_idx').on(t.tenantId), index('billing_payments_subscription_idx').on(t.subscriptionId)]
);
