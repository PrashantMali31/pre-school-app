import { describe, expect, it } from 'vitest';
import {
  announcementFormSchema,
  enquiryFormSchema,
  eventFormSchema,
  forgotSchema,
  invoiceSchema,
  loginSchema,
  profileSchema,
  signupSchema,
  studentFormSchema,
  teacherFormSchema,
  validateFields,
} from '../schemas';

describe('student form', () => {
  const good = { name: 'Aarav Sharma', age: '3', gender: 'Girl', classId: 'c1', parent: 'Rohit Sharma', phone: '+91 99001 11223' };
  it('accepts valid input and coerces age', () => {
    const { errors, value } = validateFields(studentFormSchema, good);
    expect(errors).toEqual({});
    expect(value?.age).toBe(3);
  });
  it('rejects short names, bad ages and bad phones', () => {
    const { errors, value } = validateFields(studentFormSchema, { ...good, name: 'A', age: '99', phone: 'abc' });
    expect(value).toBeNull();
    expect(errors.name).toBeDefined();
    expect(errors.age).toBeDefined();
    expect(errors.phone).toBeDefined();
  });
});

describe('teacher + event + announcement forms', () => {
  it('requires a teacher name and valid phone', () => {
    expect(validateFields(teacherFormSchema, { name: '', role: 'Lead Educator', phone: '12', classId: '' }).value).toBeNull();
  });
  it('rejects malformed event dates', () => {
    const bad = validateFields(eventFormSchema, { title: 'Mango Day', date: 'not-a-date', time: '10:00 AM', location: '', type: 'Celebration' });
    expect(bad.value).toBeNull();
    expect(bad.errors.date).toBeDefined();
  });
  it('caps announcement length', () => {
    const bad = validateFields(announcementFormSchema, { title: 'Hi', body: 'ok', audience: 'All Parents' });
    expect(bad.errors.title).toBeDefined();
    expect(bad.errors.body).toBeDefined();
  });
});

describe('invoice + profile', () => {
  it('requires positive amounts and real dates', () => {
    const bad = validateFields(invoiceSchema, { id: 'INV-1', studentId: 's1', title: 'Tuition', amount: -5, dueDate: '2026-13-99', issuedAt: '2026-09-01', status: 'pending' });
    expect(bad.value).toBeNull();
    expect(bad.errors.amount).toBeDefined();
    expect(bad.errors.dueDate).toBeDefined();
  });
  it('rejects bad school emails', () => {
    const bad = validateFields(profileSchema, { name: 'X', tagline: 'ok', phone: '123', email: 'nope', address: 'here', principal: 'AB' });
    expect(bad.errors.email).toBeDefined();
  });
});

describe('auth forms', () => {
  it('login needs email shape + non-empty password', () => {
    expect(validateFields(loginSchema, { email: 'bad', password: '' }).errors.email).toBeDefined();
    expect(validateFields(loginSchema, { email: 'a@b.in', password: 'x' }).value).toBeTruthy();
  });
  it('signup enforces password match', () => {
    const good = { name: 'Meera K', email: 'm@school.in', role: 'Admin', password: 'secret1', confirm: 'secret1' };
    expect(validateFields(signupSchema, good).value).toBeTruthy();
    const bad = validateFields(signupSchema, { ...good, confirm: 'other' });
    expect(bad.value).toBeNull();
    expect(bad.errors.confirm).toBe('Passwords do not match');
  });
  it('forgot needs an email', () => {
    expect(validateFields(forgotSchema, { email: '' }).value).toBeNull();
  });
});

describe('enquiry form', () => {
  it('validates the admissions pipeline input', () => {
    const good = { childName: 'Aarav S', age: '4', parent: 'Rohit S', phone: '+91 99999 88888', source: 'Walk-in', note: '' };
    expect(validateFields(enquiryFormSchema, good).value).toBeTruthy();
    // sources are per-school configurable — any non-empty value is accepted
    expect(validateFields(enquiryFormSchema, { ...good, source: 'Carrier Pigeon' }).value).toBeTruthy();
    const bad = validateFields(enquiryFormSchema, { ...good, source: '' });
    expect(bad.value).toBeNull();
  });
});
