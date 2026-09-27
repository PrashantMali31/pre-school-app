/* Audit + backup client — thin wrappers over GET /audit and GET /audit/export.
   Both endpoints are tenant-scoped via the X-Tenant-Slug header (see lib/api). */

import { api } from './api';

export interface AuditUser {
  id: string;
  name: string;
  email: string;
}

export interface AuditLog {
  id: string;
  tenantId: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  createdAt: string;
  user: AuditUser | null;
}

export interface AuditPage {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export async function fetchAuditLogs(tenantSlug: string, page = 1, limit = 50): Promise<AuditPage> {
  return api<AuditPage>(`/audit?page=${page}&limit=${limit}`, { tenantSlug });
}

/** Full tenant dump for backup (profile, options, classes, students, teachers,
 *  attendance, invoices, payments, events, announcements, enquiries). Admin only. */
export async function fetchBackup(tenantSlug: string): Promise<Record<string, unknown>> {
  const res = await api<{ data: Record<string, unknown> }>('/audit/export', { tenantSlug });
  return res.data;
}

/** Download a JSON backup file (used by Settings → Backup → Export from server). */
export function downloadBackup(tenantSlug: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${tenantSlug || 'school'}-server-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
