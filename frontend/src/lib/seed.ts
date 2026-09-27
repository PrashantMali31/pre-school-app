import { DB, SchoolProfile, Student, Teacher } from './types';
import { DEFAULT_OPTIONS, ensureOptions } from './options';

export const DB_KEY = 'sprouts_db_v1'; // legacy single-school key (used only for migration)

function d(offsetDays = 0) {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 10);
}

export interface SeedProfile {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  principal: string;
  domain: string; // for generating staff emails
}

type StudentRow = [name: string, age: number, gender: 'Boy' | 'Girl', classId: string, parent: string, phone: string, emoji: string, color: string, status: Student['status'], dob: string, joinedAt: string, allergies?: string, notes?: string];
type TeacherRow = [name: string, role: string, classId: string, phone: string, emoji: string, color: string, status: Teacher['status'], joinedAt: string];

const STUDENT_POOLS: StudentRow[][] = [
  [
    ['Aarav Sharma', 3, 'Boy', 'c2', 'Rohit Sharma', '+91 99001 11223', '🚀', '#E0E9FF', 'active', '2022-04-12', '2024-06-10', 'Peanuts', 'Loves building blocks'],
    ['Diya Patel', 4, 'Girl', 'c3', 'Neha Patel', '+91 99002 22334', '🌸', '#FFE4EC', 'active', '2021-11-03', '2024-06-12', undefined, 'Excellent at rhymes'],
    ['Ishaan Gupta', 2, 'Boy', 'c1', 'Amit Gupta', '+91 99003 33445', '🐥', '#FFF4CC', 'active', '2023-08-21', '2025-01-08'],
    ['Myra Singh', 5, 'Girl', 'c4', 'Karan Singh', '+91 99004 44556', '🦋', '#E9D5FF', 'active', '2020-12-15', '2023-07-01', undefined, 'Reading level 2'],
    ['Vihaan Reddy', 4, 'Boy', 'c3', 'Suresh Reddy', '+91 99005 55667', '🦖', '#DFF7E5', 'active', '2021-05-30', '2024-04-02'],
    ['Aanya Das', 3, 'Girl', 'c2', 'Pooja Das', '+91 99006 66778', '🍓', '#FFE4EC', 'active', '2022-09-09', '2024-09-15'],
    ['Kabir Khan', 5, 'Boy', 'c4', 'Imran Khan', '+91 99007 77889', '⚽', '#E0F2FE', 'active', '2020-07-19', '2023-06-20'],
    ['Sara Thomas', 2, 'Girl', 'c1', 'Jincy Thomas', '+91 99008 88990', '🐝', '#FEF3C7', 'waitlist', '2023-03-11', '2025-08-01'],
    ['Advait Joshi', 4, 'Boy', 'c3', 'Nikhil Joshi', '+91 99009 99001', '🎨', '#FCE7F3', 'active', '2021-10-02', '2024-07-22'],
    ['Navya Kapoor', 3, 'Girl', 'c2', 'Ritu Kapoor', '+91 99010 00112', '🌈', '#E0E9FF', 'active', '2022-02-14', '2024-11-05'],
    ['Arjun Mehta', 5, 'Boy', 'c4', 'Vikram Mehta', '+91 99011 11223', '🧸', '#FFEDD5', 'inactive', '2020-09-25', '2022-06-10'],
    ['Zara Ali', 4, 'Girl', 'c3', 'Farah Ali', '+91 99012 22334', '⭐', '#FEF9C3', 'active', '2021-06-17', '2024-08-19'],
  ],
  [
    ['Reyansh Kulkarni', 3, 'Boy', 'c2', 'Sandeep Kulkarni', '+91 99101 11223', '🦁', '#FFEDD5', 'active', '2022-05-20', '2024-07-02', undefined, 'Loves story time'],
    ['Aadhya Bhatt', 4, 'Girl', 'c3', 'Kiran Bhatt', '+91 99102 22334', '🦋', '#E9D5FF', 'active', '2021-08-14', '2024-06-18'],
    ['Vivaan Shah', 2, 'Boy', 'c1', 'Rajesh Shah', '+91 99103 33445', '🐣', '#FFF4CC', 'active', '2023-06-30', '2025-02-01'],
    ['Kiara Menon', 5, 'Girl', 'c4', 'Deepa Menon', '+91 99104 44556', '🌈', '#E0E9FF', 'active', '2020-10-05', '2023-08-11', 'Milk', 'Advanced phonics'],
    ['Arnav Dubey', 4, 'Boy', 'c3', 'Manoj Dubey', '+91 99105 55667', '🚜', '#DFF7E5', 'active', '2021-12-22', '2024-05-09'],
    ['Saanvi Rao', 3, 'Girl', 'c2', 'Lakshmi Rao', '+91 99106 66778', '🍉', '#FFE4EC', 'active', '2022-07-07', '2024-10-03'],
    ['Aditya Nair', 5, 'Boy', 'c4', 'Pradeep Nair', '+91 99107 77889', '🚀', '#E0F2FE', 'active', '2020-09-19', '2023-06-25'],
    ['Pari Jain', 2, 'Girl', 'c1', 'Shweta Jain', '+91 99108 88990', '🐰', '#FEF3C7', 'waitlist', '2023-04-16', '2025-08-20'],
    ['Krishna Yadav', 4, 'Boy', 'c3', 'Ramesh Yadav', '+91 99109 99001', '🎸', '#FCE7F3', 'active', '2021-11-11', '2024-08-14'],
    ['Anvi Chawla', 3, 'Girl', 'c2', 'Simran Chawla', '+91 99110 00112', '🌸', '#E4EBFF', 'active', '2022-03-28', '2024-12-01'],
    ['Rudra Patil', 5, 'Boy', 'c4', 'Sachin Patil', '+91 99111 11223', '⚽', '#FFEDD5', 'inactive', '2020-11-02', '2022-07-15'],
    ['Ira Bose', 4, 'Girl', 'c3', 'Ananya Bose', '+91 99112 22334', '⭐', '#FEF9C3', 'active', '2021-09-09', '2024-09-02'],
  ],
  [
    ['Dev Malhotra', 3, 'Boy', 'c2', 'Ajay Malhotra', '+91 99201 11223', '🦖', '#DFF7E5', 'active', '2022-06-11', '2024-07-20'],
    ['Tara Shetty', 4, 'Girl', 'c3', 'Divya Shetty', '+91 99202 22334', '🦄', '#FCE7F3', 'active', '2021-07-25', '2024-06-28', undefined, 'Shines at dance'],
    ['Yash Thakur', 2, 'Boy', 'c1', 'Vikas Thakur', '+91 99203 33445', '🐥', '#FFF4CC', 'active', '2023-09-02', '2025-01-15'],
    ['Naina Kapoor', 5, 'Girl', 'c4', 'Raj Kapoor', '+91 99204 44556', '🎨', '#E9D5FF', 'active', '2020-08-08', '2023-09-05'],
    ['Om Prakash', 4, 'Boy', 'c3', 'Sunil Prakash', '+91 99205 55667', '🚂', '#E0E9FF', 'active', '2021-10-19', '2024-04-22'],
    ['Pihu Agarwal', 3, 'Girl', 'c2', 'Ritu Agarwal', '+91 99206 66778', '🍓', '#FFE4EC', 'active', '2022-08-30', '2024-11-11'],
    ['Sahil Ahmed', 5, 'Boy', 'c4', 'Javed Ahmed', '+91 99207 77889', '🪁', '#E0F2FE', 'active', '2020-12-01', '2023-07-19'],
    ['Jia Nambiar', 2, 'Girl', 'c1', 'Priya Nambiar', '+91 99208 88990', '🐝', '#FEF3C7', 'waitlist', '2023-05-14', '2025-09-01'],
    ['Ranveer Gill', 4, 'Boy', 'c3', 'Harpreet Gill', '+91 99209 99001', '🦸', '#FFEDD5', 'active', '2021-12-05', '2024-08-08'],
    ['Riya Kulkarni', 3, 'Girl', 'c2', 'Sneha Kulkarni', '+91 99210 00112', '🌈', '#E4EBFF', 'active', '2022-02-20', '2024-10-17'],
    ['Aman Verma', 5, 'Boy', 'c4', 'Alok Verma', '+91 99211 11223', '⚽', '#FFF4CC', 'inactive', '2020-07-14', '2022-08-02'],
    ['Myra Iyer', 4, 'Girl', 'c3', 'Kavya Iyer', '+91 99212 22334', '🌸', '#FEF9C3', 'active', '2021-06-06', '2024-09-25'],
  ],
];

const TEACHER_POOLS: TeacherRow[][] = [
  [
    ['Ananya Rao', 'Lead Educator', 'c1', '+91 98111 22334', '🦊', '#FFE4EC', 'active', '2023-06-12'],
    ['Priya Nair', 'Lead Educator', 'c2', '+91 98222 33445', '🐰', '#E4EBFF', 'active', '2022-07-01'],
    ['Kavya Menon', 'Montessori Guide', 'c3', '+91 98333 44556', '🐼', '#DFF7E5', 'active', '2023-01-15'],
    ['Rahul Verma', 'UKG Coordinator', 'c4', '+91 98444 55667', '🦁', '#FFEEDD', 'active', '2021-08-20'],
    ['Sneha Iyer', 'Music & Movement', 'c2', '+91 98555 66778', '🎵', '#F3E8FF', 'leave', '2024-02-10'],
  ],
  [
    ['Lakshmi Venkat', 'Lead Educator', 'c1', '+91 98111 55667', '🦉', '#FFE4EC', 'active', '2023-03-10'],
    ['Arjun Pillai', 'Lead Educator', 'c2', '+91 98222 66778', '🐯', '#E4EBFF', 'active', '2022-09-01'],
    ['Sana Sheikh', 'Montessori Guide', 'c3', '+91 98333 77889', '🐰', '#DFF7E5', 'active', '2024-01-20'],
    ['Vikram Rao', 'UKG Coordinator', 'c4', '+91 98444 88990', '🦁', '#FFEEDD', 'active', '2021-11-11'],
    ['Tara D’Souza', 'Art & Craft', 'c3', '+91 98555 99001', '🎨', '#F3E8FF', 'active', '2024-05-05'],
  ],
  [
    ['Anita Desai', 'Lead Educator', 'c1', '+91 98111 99001', '🦋', '#FFE4EC', 'active', '2023-08-01'],
    ['Farhan Qureshi', 'Lead Educator', 'c2', '+91 98222 00112', '🐼', '#E4EBFF', 'active', '2022-12-12'],
    ['Pooja Reddy', 'Montessori Guide', 'c3', '+91 98333 11223', '🐥', '#DFF7E5', 'active', '2023-05-18'],
    ['Kiran Joshi', 'UKG Coordinator', 'c4', '+91 98444 22334', '🦊', '#FFEEDD', 'leave', '2021-10-10'],
    ['Devika Sen', 'Music & Movement', 'c4', '+91 98555 33445', '🎵', '#F3E8FF', 'active', '2024-03-22'],
  ],
];

function buildStudents(rows: StudentRow[]): Student[] {
  return rows.map((r, i) => ({
    id: `s${i + 1}`,
    name: r[0], age: r[1], gender: r[2], classId: r[3], parent: r[4], phone: r[5],
    emoji: r[6], color: r[7], status: r[8], dob: r[9], joinedAt: r[10],
    allergies: r[11], notes: r[12],
  }));
}

function buildTeachers(rows: TeacherRow[], domain: string): Teacher[] {
  return rows.map((r, i) => ({
    id: `t${i + 1}`,
    name: r[0], role: r[1], classId: r[2], phone: r[3], emoji: r[4], color: r[5],
    status: r[6], joinedAt: r[7],
    email: `${r[0].split(' ')[0].toLowerCase()}@${domain}`,
  }));
}

const DEFAULT_PROFILE: SeedProfile = {
  name: 'Little Sprouts',
  tagline: 'Where little minds bloom',
  phone: '+91 98765 43210',
  email: 'hello@littlesprouts.in',
  address: '42 Rainbow Street, Sunshine Colony',
  principal: 'Meera Krishnan',
  domain: 'sprouts.in',
};

function toSchoolProfile(p: SeedProfile): SchoolProfile {
  return { name: p.name, tagline: p.tagline, phone: p.phone, email: p.email, address: p.address, principal: p.principal };
}

export function seedDB(profile: Partial<SeedProfile> = {}, pool = 0, options?: Partial<DB['options']>): DB {
  const p: SeedProfile = { ...DEFAULT_PROFILE, ...profile };
  const students = buildStudents(STUDENT_POOLS[pool % STUDENT_POOLS.length]);
  const teachers = buildTeachers(TEACHER_POOLS[pool % TEACHER_POOLS.length], p.domain);
  return {
    profile: toSchoolProfile(p),
    options: ensureOptions(options ?? DEFAULT_OPTIONS),
    classes: [
      { id: 'c1', name: 'Tiny Tots', ageGroup: '1.5 – 2.5 yrs', capacity: 20, teacherId: 't1', color: '#FF8FB1', room: 'Room A · Sunflower', time: '9:00 – 11:30 AM' },
      { id: 'c2', name: 'Little Explorers', ageGroup: '2.5 – 3.5 yrs', capacity: 22, teacherId: 't2', color: '#7C9DFF', room: 'Room B · Rainbow', time: '9:00 – 12:00 PM' },
      { id: 'c3', name: 'Curious Cubs', ageGroup: '3.5 – 4.5 yrs', capacity: 24, teacherId: 't3', color: '#4ADE80', room: 'Room C · Jungle', time: '8:30 – 12:30 PM' },
      { id: 'c4', name: 'Flying Foxes (UKG)', ageGroup: '4.5 – 6 yrs', capacity: 25, teacherId: 't4', color: '#FB923C', room: 'Room D · Sky', time: '8:30 – 1:00 PM' },
    ],
    teachers,
    students,
    attendance: [
      { date: d(-4), records: { s1: 'present', s2: 'present', s3: 'present', s4: 'present', s5: 'late', s6: 'present', s7: 'present', s9: 'absent', s10: 'present', s12: 'present' } },
      { date: d(-3), records: { s1: 'present', s2: 'late', s3: 'present', s4: 'present', s5: 'present', s6: 'absent', s7: 'present', s9: 'present', s10: 'present', s12: 'half' } },
      { date: d(-2), records: { s1: 'present', s2: 'present', s3: 'half', s4: 'present', s5: 'present', s6: 'present', s7: 'late', s9: 'present', s10: 'absent', s12: 'present' } },
      { date: d(-1), records: { s1: 'present', s2: 'present', s3: 'present', s4: 'late', s5: 'present', s6: 'present', s7: 'present', s9: 'present', s10: 'present', s12: 'present' } },
      { date: d(0), records: { s1: 'present', s2: 'present', s3: 'present', s4: 'present', s5: 'present', s6: 'late', s7: 'present', s9: 'absent', s10: 'present' } },
    ],
    invoices: [
      { id: 'INV-2401', studentId: 's1', title: 'Term 2 Tuition · Little Explorers', amount: 18500, dueDate: d(5), issuedAt: d(-10), status: 'pending' },
      { id: 'INV-2402', studentId: 's2', title: 'Term 2 Tuition · Curious Cubs', amount: 19800, dueDate: d(-2), issuedAt: d(-20), status: 'overdue' },
      { id: 'INV-2403', studentId: 's4', title: 'Term 2 Tuition · Flying Foxes', amount: 21500, dueDate: d(-12), issuedAt: d(-30), status: 'paid', method: 'UPI' },
      { id: 'INV-2404', studentId: 's5', title: 'Transport · Sep', amount: 3500, dueDate: d(8), issuedAt: d(-5), status: 'pending' },
      { id: 'INV-2405', studentId: 's7', title: 'Term 2 Tuition · Flying Foxes', amount: 21500, dueDate: d(-15), issuedAt: d(-32), status: 'paid', method: 'Card' },
      { id: 'INV-2406', studentId: 's6', title: 'Admission + Kit', amount: 12000, dueDate: d(-6), issuedAt: d(-25), status: 'overdue' },
      { id: 'INV-2407', studentId: 's10', title: 'Term 2 Tuition · Little Explorers', amount: 18500, dueDate: d(12), issuedAt: d(-2), status: 'pending' },
    ],
    events: [
      { id: 'e1', title: 'Grandparents Day Celebration', date: d(3), time: '10:00 AM', location: 'Main Hall', type: 'Celebration', description: 'Songs, dance and storytelling with grandparents.', color: '#FF8FB1' },
      { id: 'e2', title: 'Farm Field Trip', date: d(7), time: '8:30 AM', location: 'Green Acres Farm', type: 'Field Trip', description: 'Pet animals, pick veggies, tractor ride.', color: '#4ADE80' },
      { id: 'e3', title: 'Parent-Teacher Meet', date: d(10), time: '4:00 PM', location: 'Classrooms', type: 'Meeting', description: 'Progress review for Term 1.', color: '#7C9DFF' },
      { id: 'e4', title: 'Diwali Mela & Art Show', date: d(18), time: '5:00 PM', location: 'Playground', type: 'Festival', description: 'Diyas, rangoli, kids art exhibition.', color: '#FB923C' },
      { id: 'e5', title: 'Rhyme & Rhythm Workshop', date: d(-5), time: '11:00 AM', location: 'Music Room', type: 'Workshop', description: 'Phonics through music with Sneha ma’am.', color: '#C084FC' },
    ],
    announcements: [
      { id: 'a1', title: 'Winter timings from Oct 1', body: 'School starts 30 mins late for Tiny Tots. Buses updated in transport group.', audience: 'All Parents', createdAt: d(-1), pinned: true },
      { id: 'a2', title: 'Bring a fruit Friday', body: 'Every Friday is fruit-sharing day. Please pack one extra fruit for your child.', audience: 'Tiny Tots, Explorers', createdAt: d(-3), pinned: false },
      { id: 'a3', title: 'Flu precautions', body: 'If your child has fever/cold, please rest at home. Share leave note in app.', audience: 'All Parents', createdAt: d(-6), pinned: false },
    ],
  };
}

/** Fresh, empty workspace for a brand-new school (keeps the 4 default classrooms so the app is usable). */
export function emptyDB(profile: Partial<SeedProfile> = {}): DB {
  const full = seedDB(profile, 0);
  return {
    ...full,
    teachers: [],
    students: [],
    attendance: [],
    invoices: [],
    events: [],
    announcements: [],
    classes: full.classes.map((c) => ({ ...c, teacherId: '' })),
  };
}
