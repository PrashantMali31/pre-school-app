'use client';
import { api } from '@/lib/api';

export interface PickupContact {
  id: string;
  studentId: string;
  name: string;
  relation: string;
  phone: string;
  isPrimary: boolean;
  hasPin: boolean;
  createdAt?: string;
}

export interface PickupLogEntry {
  id: string;
  studentId: string;
  contactId: string | null;
  pickedUpAt: string;
  verifiedBy: string | null;
  note: string | null;
}

export type IncidentKind = 'injury' | 'illness' | 'allergy' | 'behavior' | 'other';
export type IncidentSeverity = 'low' | 'medium' | 'high';

export interface Incident {
  id: string;
  studentId: string;
  kind: IncidentKind;
  severity: IncidentSeverity;
  title: string;
  detail: string;
  occurredAt: string;
  notifiedParent: boolean;
  createdAt?: string;
}

export interface TimetableSlot {
  id: string;
  classId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  activity: string;
  teacherId: string | null;
}

export interface BusRoute {
  id: string;
  name: string;
  vehicleNo: string;
  driverName: string;
  driverPhone: string;
}

export interface BusStop {
  id: string;
  routeId: string;
  name: string;
  pickupTime: string;
  order: number;
}

export interface LiteStudent { id: string; name: string; classId?: string | null }
export interface LiteClass { id: string; name: string }

function listData<T>(res: { data?: T[] } | T[]): T[] {
  if (Array.isArray(res)) return res;
  return res.data ?? [];
}

export async function listStudentsLite(slug: string): Promise<LiteStudent[]> {
  const res = await api<{ data: LiteStudent[] }>('/students?limit=200', { tenantSlug: slug });
  return listData(res);
}

export async function listClassesLite(slug: string): Promise<LiteClass[]> {
  const res = await api<{ data: LiteClass[] }>('/classes?limit=200', { tenantSlug: slug });
  return listData(res);
}

export async function listPickupContacts(slug: string, studentId: string): Promise<PickupContact[]> {
  const res = await api<{ data: PickupContact[] }>(`/safety/students/${studentId}/pickups`, { tenantSlug: slug });
  return listData(res);
}

export async function createPickupContact(slug: string, studentId: string, input: { name: string; relation?: string; phone?: string; pin?: string; isPrimary?: boolean }): Promise<PickupContact> {
  const res = await api<{ data: PickupContact }>(`/safety/students/${studentId}/pickups`, {
    method: 'POST', tenantSlug: slug, body: JSON.stringify(input),
  });
  return res.data;
}

export async function updatePickupContact(slug: string, id: string, patch: { name?: string; relation?: string; phone?: string; pin?: string | null }): Promise<PickupContact> {
  const res = await api<{ data: PickupContact }>(`/safety/pickups/${id}`, {
    method: 'PUT', tenantSlug: slug, body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deletePickupContact(slug: string, id: string): Promise<void> {
  await api(`/safety/pickups/${id}`, { method: 'DELETE', tenantSlug: slug });
}

export async function verifyPickupPin(slug: string, id: string, pin: string): Promise<boolean> {
  const res = await api<{ ok: boolean }>(`/safety/pickups/${id}/verify`, {
    method: 'POST', tenantSlug: slug, body: JSON.stringify({ pin }),
  });
  return res.ok;
}

export async function logPickup(slug: string, studentId: string, input: { contactId?: string | null; note?: string }): Promise<PickupLogEntry> {
  const res = await api<{ data: PickupLogEntry }>(`/safety/students/${studentId}/pickup`, {
    method: 'POST', tenantSlug: slug, body: JSON.stringify(input),
  });
  return res.data;
}

export async function listPickupLog(slug: string, studentId: string): Promise<PickupLogEntry[]> {
  const res = await api<{ data: PickupLogEntry[] }>(`/safety/students/${studentId}/pickups/log`, { tenantSlug: slug });
  return listData(res);
}

export async function listIncidents(slug: string, studentId?: string): Promise<Incident[]> {
  const q = studentId ? `?studentId=${encodeURIComponent(studentId)}` : '';
  const res = await api<{ data: Incident[] }>(`/safety/incidents${q}`, { tenantSlug: slug });
  return listData(res);
}

export async function createIncident(slug: string, input: { studentId: string; kind: IncidentKind; severity: IncidentSeverity; title: string; detail?: string; occurredAt: string }): Promise<Incident> {
  const res = await api<{ data: Incident }>('/safety/incidents', {
    method: 'POST', tenantSlug: slug, body: JSON.stringify(input),
  });
  return res.data;
}

export async function patchIncident(slug: string, id: string, patch: Partial<{ kind: IncidentKind; severity: IncidentSeverity; title: string; detail: string; occurredAt: string; notifiedParent: boolean }>): Promise<Incident> {
  const res = await api<{ data: Incident }>(`/safety/incidents/${id}`, {
    method: 'PATCH', tenantSlug: slug, body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deleteIncident(slug: string, id: string): Promise<void> {
  await api(`/safety/incidents/${id}`, { method: 'DELETE', tenantSlug: slug });
}

export async function getTimetable(slug: string, classId: string): Promise<TimetableSlot[]> {
  const res = await api<{ data: TimetableSlot[] }>(`/safety/classes/${classId}/timetable`, { tenantSlug: slug });
  return listData(res);
}

export async function putTimetable(slug: string, classId: string, slots: Array<{ weekday: number; startTime: string; endTime: string; activity: string; teacherId?: string | null }>): Promise<TimetableSlot[]> {
  const res = await api<{ data: TimetableSlot[] }>(`/safety/classes/${classId}/timetable`, {
    method: 'PUT', tenantSlug: slug, body: JSON.stringify({ slots }),
  });
  return res.data ?? [];
}

export async function listBusRoutes(slug: string): Promise<BusRoute[]> {
  const res = await api<{ data: BusRoute[] }>('/safety/bus/routes', { tenantSlug: slug });
  return listData(res);
}

export async function createBusRoute(slug: string, input: { name: string; vehicleNo?: string; driverName?: string; driverPhone?: string }): Promise<BusRoute> {
  const res = await api<{ data: BusRoute }>('/safety/bus/routes', {
    method: 'POST', tenantSlug: slug, body: JSON.stringify(input),
  });
  return res.data;
}

export async function patchBusRoute(slug: string, id: string, patch: Partial<{ name: string; vehicleNo: string; driverName: string; driverPhone: string }>): Promise<BusRoute> {
  const res = await api<{ data: BusRoute }>(`/safety/bus/routes/${id}`, {
    method: 'PATCH', tenantSlug: slug, body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deleteBusRoute(slug: string, id: string): Promise<void> {
  await api(`/safety/bus/routes/${id}`, { method: 'DELETE', tenantSlug: slug });
}

export async function listBusStops(slug: string, routeId: string): Promise<BusStop[]> {
  const res = await api<{ data: BusStop[] }>(`/safety/bus/routes/${routeId}/stops`, { tenantSlug: slug });
  return listData(res);
}

export async function createBusStop(slug: string, routeId: string, input: { name: string; pickupTime: string; order?: number }): Promise<BusStop> {
  const res = await api<{ data: BusStop }>(`/safety/bus/routes/${routeId}/stops`, {
    method: 'POST', tenantSlug: slug, body: JSON.stringify(input),
  });
  return res.data;
}

export async function patchBusStop(slug: string, stopId: string, patch: Partial<{ name: string; pickupTime: string; order: number }>): Promise<BusStop> {
  const res = await api<{ data: BusStop }>(`/safety/bus/stops/${stopId}`, {
    method: 'PATCH', tenantSlug: slug, body: JSON.stringify(patch),
  });
  return res.data;
}

export async function deleteBusStop(slug: string, stopId: string): Promise<void> {
  await api(`/safety/bus/stops/${stopId}`, { method: 'DELETE', tenantSlug: slug });
}

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
