import { api } from '@/lib/api';

export type LeaveKind = 'sick' | 'casual' | 'earned' | 'unpaid';
export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export const LEAVE_KINDS: LeaveKind[] = ['sick', 'casual', 'earned', 'unpaid'];
export const LEAVE_STATUSES: LeaveStatus[] = ['pending', 'approved', 'rejected'];

export interface StaffLeave {
  id: string;
  teacherId: string;
  kind: LeaveKind;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface LeaveBalance {
  allowed?: number;
  used: number;
  left?: number;
}

export interface LeaveBalances {
  sick: LeaveBalance;
  casual: LeaveBalance;
  earned: LeaveBalance;
  unpaid: LeaveBalance;
}

export interface Salary {
  basicCents: number;
  allowancesCents: number;
}

export interface PayrollRun {
  id: string;
  month: string;
  status: string;
  createdAt?: string;
  finalizedAt?: string | null;
}

export interface Payslip {
  id: string;
  teacherId: string;
  basicCents: number;
  allowancesCents: number;
  unpaidLeaveDays: number;
  leaveDeductionCents: number;
  netCents: number;
  status: string;
  paidAt: string | null;
  paidMethod: string | null;
}

export interface PayrollRunDetail extends PayrollRun {
  slips: Payslip[];
}

export interface TeacherLite {
  id: string;
  name: string;
}

export const STAFF_PAY_METHODS = ['Cash', 'UPI', 'Card', 'Bank'] as const;
export type StaffPayMethod = (typeof STAFF_PAY_METHODS)[number];

/** Format integer cents as en-IN rupees. */
export const rupees = (cents: number) => `₹${(cents / 100).toLocaleString('en-IN')}`;

function listData<T>(res: { data?: T[] } | T[]): T[] {
  if (Array.isArray(res)) return res;
  return res.data ?? [];
}

function qs(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function listTeachersLite(slug: string): Promise<TeacherLite[]> {
  const res = await api<{ data: TeacherLite[] } | TeacherLite[]>('/teachers?limit=200', { tenantSlug: slug });
  return listData(res);
}

export async function listLeaves(
  slug: string,
  filter: { teacherId?: string; status?: string } = {}
): Promise<StaffLeave[]> {
  const res = await api<{ data: StaffLeave[]; total?: number } | StaffLeave[]>(
    `/staff/leaves${qs({ teacherId: filter.teacherId, status: filter.status })}`,
    { tenantSlug: slug }
  );
  return listData(res);
}

export interface CreateLeaveInput {
  teacherId: string;
  kind: LeaveKind;
  fromDate: string;
  toDate: string;
  reason?: string;
}

export async function createLeave(slug: string, input: CreateLeaveInput): Promise<StaffLeave> {
  const res = await api<{ data: StaffLeave }>('/staff/leaves', {
    method: 'POST',
    tenantSlug: slug,
    body: JSON.stringify({
      teacherId: input.teacherId,
      kind: input.kind,
      fromDate: input.fromDate,
      toDate: input.toDate,
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    }),
  });
  return res.data;
}

export async function updateLeave(
  slug: string,
  id: string,
  patch: Partial<{ teacherId: string; kind: LeaveKind; fromDate: string; toDate: string; reason: string }>
): Promise<StaffLeave> {
  const res = await api<{ data: StaffLeave }>(`/staff/leaves/${encodeURIComponent(id)}`, {
    method: 'PUT',
    tenantSlug: slug,
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function approveLeave(slug: string, id: string): Promise<StaffLeave> {
  const res = await api<{ data: StaffLeave }>(`/staff/leaves/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    tenantSlug: slug,
  });
  return res.data;
}

export async function rejectLeave(slug: string, id: string): Promise<StaffLeave> {
  const res = await api<{ data: StaffLeave }>(`/staff/leaves/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    tenantSlug: slug,
  });
  return res.data;
}

export async function getLeaveBalances(
  slug: string,
  opts: { teacherId: string; year?: string }
): Promise<LeaveBalances> {
  const res = await api<{ data: LeaveBalances }>(
    `/staff/leaves/balances${qs({ teacherId: opts.teacherId, year: opts.year })}`,
    { tenantSlug: slug }
  );
  return res.data;
}

export async function getSalary(slug: string, teacherId: string): Promise<Salary | null> {
  const res = await api<{ data: Salary | null }>(`/staff/salary${qs({ teacherId })}`, {
    tenantSlug: slug,
  });
  return res.data ?? null;
}

export async function putSalary(
  slug: string,
  input: { teacherId: string; basicCents: number; allowancesCents: number }
): Promise<Salary> {
  const res = await api<{ data: Salary }>('/staff/salary', {
    method: 'PUT',
    tenantSlug: slug,
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function listPayrollRuns(slug: string): Promise<PayrollRun[]> {
  const res = await api<{ data: PayrollRun[] } | PayrollRun[]>('/staff/payroll/runs', {
    tenantSlug: slug,
  });
  return listData(res);
}

export async function createPayrollRun(slug: string, month: string): Promise<PayrollRun> {
  const res = await api<{ data: PayrollRun }>('/staff/payroll/runs', {
    method: 'POST',
    tenantSlug: slug,
    body: JSON.stringify({ month }),
  });
  return res.data;
}

export async function getPayrollRun(slug: string, id: string): Promise<PayrollRunDetail> {
  const res = await api<{ data: PayrollRunDetail }>(`/staff/payroll/runs/${encodeURIComponent(id)}`, {
    tenantSlug: slug,
  });
  return res.data;
}

export async function finalizePayrollRun(slug: string, id: string): Promise<PayrollRun> {
  const res = await api<{ data: PayrollRun }>(`/staff/payroll/runs/${encodeURIComponent(id)}/finalize`, {
    method: 'POST',
    tenantSlug: slug,
  });
  return res.data;
}

export async function payPayslip(slug: string, id: string, method: string): Promise<Payslip> {
  const res = await api<{ data: Payslip }>(`/staff/payslips/${encodeURIComponent(id)}/pay`, {
    method: 'POST',
    tenantSlug: slug,
    body: JSON.stringify({ method }),
  });
  return res.data;
}
