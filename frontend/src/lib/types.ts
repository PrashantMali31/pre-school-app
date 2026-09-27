export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half';
export type InvoiceStatus = 'paid' | 'pending' | 'overdue';
export type StudentStatus = 'active' | 'inactive' | 'waitlist';

export interface Student {
  id: string;
  name: string;
  age: number;
  dob: string;
  gender: string;
  classId: string;
  parent: string;
  phone: string;
  email?: string;
  address?: string;
  emoji: string;
  color: string;
  status: StudentStatus;
  joinedAt: string;
  allergies?: string;
  notes?: string;
}

export interface Teacher {
  id: string;
  name: string;
  role: string;
  classId: string;
  phone: string;
  email: string;
  emoji: string;
  color: string;
  status: 'active' | 'leave';
  joinedAt: string;
}

export interface ClassRoom {
  id: string;
  name: string;
  ageGroup: string;
  capacity: number;
  teacherId: string;
  color: string;
  room: string;
  time: string;
}

export interface AttendanceDay {
  date: string; // YYYY-MM-DD
  records: Record<string, AttendanceStatus>;
  note?: string;
}

export interface Invoice {
  id: string;
  studentId: string;
  title: string;
  amount: number;
  dueDate: string;
  issuedAt: string;
  status: InvoiceStatus;
  method?: string;
}

export interface SchoolEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  type: string;
  description: string;
  color: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: string;
  createdAt: string;
  pinned: boolean;
}

export interface SchoolProfile {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  principal: string;
}

/** Per-school configurable dropdowns / masters. Each school edits its own lists. */
export interface SchoolOptions {
  staffRoles: string[];
  genders: string[];
  eventTypes: string[];
  sources: string[];
  audiences: string[];
  feeTitles: string[];
}

export interface DB {
  profile: SchoolProfile;
  students: Student[];
  teachers: Teacher[];
  classes: ClassRoom[];
  attendance: AttendanceDay[];
  invoices: Invoice[];
  events: SchoolEvent[];
  announcements: Announcement[];
  options: SchoolOptions;
}
