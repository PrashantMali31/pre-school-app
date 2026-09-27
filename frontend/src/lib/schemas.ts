import { z } from 'zod';

/* ---------- shared primitives ---------- */

export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .email('Please enter a valid email address')
  .max(100, 'Email is too long');

export const phoneField = z
  .string()
  .trim()
  .min(6, 'Phone looks too short')
  .max(20, 'Phone looks too long')
  .regex(/^[+\d][\d\s\-()]*$/, 'Enter a valid phone number');

export const personName = (label: string) =>
  z.string().trim().min(2, `${label} must be at least 2 characters`).max(60, `${label} is too long`);

export const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
  .refine((v) => !Number.isNaN(new Date(`${v}T12:00:00`).getTime()), 'Pick a valid date');

/* System roles for login — fixed. Staff designations are per-school in db.options.staffRoles. */
export const GENDERS = ['Boy', 'Girl'] as const;
export const ROLES = ['Admin', 'Teacher', 'Parent'] as const;
export const EVENT_TYPES = ['Celebration', 'Field Trip', 'Meeting', 'Festival', 'Holiday', 'Workshop'] as const;
export const ATTENDANCE = ['present', 'absent', 'late', 'half'] as const;
export const INVOICE_STATUS = ['paid', 'pending', 'overdue'] as const;

/* Free-text option value: schools define their own lists under db.options. */
export const optionValue = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(60, `${label} is too long`);

export const optionListSchema = z.array(z.string().trim().min(1).max(60)).min(1, 'Keep at least one option').max(40, 'Too many options (40 max)');

/* ---------- app forms ---------- */

export const studentFormSchema = z.object({
  name: personName('Child name'),
  age: z.coerce.number().int('Age must be a whole number').min(1, 'Age must be at least 1').max(10, 'Age must be 10 or less'),
  gender: optionValue('Gender'),
  classId: z.string(),
  parent: personName('Parent name'),
  phone: phoneField,
});

export const teacherFormSchema = z.object({
  name: personName('Name'),
  role: z.string().trim().min(2, 'Pick a role'),
  phone: phoneField,
  classId: z.string(),
});

export const eventFormSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(80, 'Title is too long'),
  date: dateField,
  time: z.string().trim().min(3, 'Add a time (e.g. 10:00 AM)').max(20),
  location: z.string().trim().max(80, 'Location is too long'),
  type: optionValue('Event type'),
});

export const invoiceSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1, 'Pick a student'),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(100),
  amount: z.coerce.number().positive('Amount must be greater than 0').max(1000000, 'Amount looks too large'),
  dueDate: dateField,
  issuedAt: dateField,
  status: z.enum(INVOICE_STATUS),
});

export const announcementFormSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(80, 'Title is too long'),
  body: z.string().trim().min(5, 'Message must be at least 5 characters').max(600, 'Message is too long (600 max)'),
  audience: z.string().trim().min(2, 'Pick an audience'),
});

export const profileSchema = z.object({
  name: personName('School name'),
  tagline: z.string().trim().min(2, 'Tagline is too short').max(80, 'Tagline is too long'),
  phone: phoneField,
  email: emailField,
  address: z.string().trim().min(5, 'Address is too short').max(140, 'Address is too long'),
  principal: personName('Principal name'),
});

export const attendanceDateSchema = dateField;

export const SOURCES = ['Walk-in', 'Referral', 'Instagram', 'Google', 'Flyer', 'Other'] as const;

export const enquiryFormSchema = z.object({
  childName: personName('Child name'),
  age: z.coerce.number().int('Age must be a whole number').min(1, 'Age must be at least 1').max(10, 'Age must be 10 or less'),
  parent: personName('Parent name'),
  phone: phoneField,
  source: optionValue('Source'),
  note: z.string().trim().max(200, 'Note is too long (200 max)'),
});

export const PLANS = ['Starter', 'Pro', 'Enterprise'] as const;

export const schoolFormSchema = z.object({
  name: z.string().trim().min(2, 'School name must be at least 2 characters').max(60, 'School name is too long'),
  plan: z.enum(PLANS),
});

/* ---------- auth forms ---------- */

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z
  .object({
    name: personName('Name'),
    email: emailField,
    role: z.enum(ROLES),
    password: z.string().min(6, 'Password must be at least 6 characters').max(72, 'Password is too long'),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] });

export const forgotSchema = z.object({
  email: emailField,
});

/* ---------- helpers ---------- */

export type FieldErrors = Record<string, string | undefined>;

export function toFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (key && out[key] === undefined) out[key] = issue.message;
  }
  return out;
}

/** Validate unknown data against a schema. Returns field errors or null when valid. */
export function validateFields<T>(schema: z.ZodType<T>, data: unknown): { errors: FieldErrors; value: T | null } {
  const res = (schema as z.ZodTypeAny).safeParse(data);
  if (res.success) return { errors: {}, value: res.data as T };
  return { errors: toFieldErrors(res.error), value: null };
}

export type StudentForm = z.infer<typeof studentFormSchema>;
export type TeacherForm = z.infer<typeof teacherFormSchema>;
export type EventForm = z.infer<typeof eventFormSchema>;
export type AnnouncementForm = z.infer<typeof announcementFormSchema>;
export type ProfileForm = z.infer<typeof profileSchema>;
export type LoginForm = z.infer<typeof loginSchema>;
export type SignupForm = z.infer<typeof signupSchema>;
