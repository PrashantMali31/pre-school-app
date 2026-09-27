'use client';

import { useEffect, useState } from 'react';
import { api } from './api';

/* Admissions pipeline, API-backed per-tenant.
   Hook keeps its sync signature: pages call add/move/remove without await.
   Each op applies an optimistic local update, then syncs in the background
   (rollback + console.error on failure). */

export type EnquiryStage = 'New' | 'Tour' | 'Applied' | 'Enrolled';

export interface Enquiry {
  id: string;
  childName: string;
  age: number;
  parent: string;
  phone: string;
  source: string;
  stage: EnquiryStage;
  note: string;
  createdAt: string;
}

export const STAGES: EnquiryStage[] = ['New', 'Tour', 'Applied', 'Enrolled'];

/** Raw row shape returned by the backend (drizzle camelCase keys). */
interface ServerEnquiry {
  id: string;
  childName: string;
  age: number;
  parent: string;
  phone: string;
  source: string;
  stage: EnquiryStage;
  note: string;
  createdAt: string;
}

function toEnquiry(row: ServerEnquiry): Enquiry {
  return {
    id: row.id,
    childName: row.childName,
    age: Number(row.age),
    parent: row.parent,
    phone: row.phone,
    source: row.source,
    stage: row.stage,
    note: row.note ?? '',
    createdAt: typeof row.createdAt === 'string' ? row.createdAt.slice(0, 10) : String(row.createdAt).slice(0, 10),
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function useEnquiries(tenantSlug: string) {
  const [items, setItems] = useState<Enquiry[]>([]);
  const [ready, setReady] = useState(!tenantSlug);

  useEffect(() => {
    if (!tenantSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset when school unselected
      setItems([]);
      setReady(true);
      return;
    }
    let live = true;
    setReady(false);
    api<{ data: ServerEnquiry[] }>('/enquiries', { tenantSlug })
      .then((res) => {
        if (live) setItems((res.data ?? []).map(toEnquiry));
      })
      .catch((err) => {
        console.error('[enquiries] load failed', err);
        if (live) setItems([]);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [tenantSlug]);

  return {
    items,
    ready,
    add: (e: Omit<Enquiry, 'id' | 'createdAt' | 'stage'>) => {
      const optimistic: Enquiry = { ...e, id: uid('enq'), stage: 'New', createdAt: today() };
      setItems((p) => [optimistic, ...p]);
      // background sync: replace temp row with the server row, rollback on error
      api<{ data: ServerEnquiry }>('/enquiries', {
        method: 'POST',
        tenantSlug,
        body: JSON.stringify({
          childName: e.childName,
          age: e.age,
          parent: e.parent,
          phone: e.phone,
          source: e.source,
          note: e.note ?? '',
        }),
      })
        .then((res) => {
          if (res?.data) {
            const saved = toEnquiry(res.data);
            setItems((p) => p.map((it) => (it.id === optimistic.id ? saved : it)));
          }
        })
        .catch((err) => {
          console.error('[enquiries] add failed', err);
          setItems((p) => p.filter((it) => it.id !== optimistic.id));
        });
    },
    move: (id: string, dir: 1 | -1) => {
      let prev: Enquiry[] = [];
      setItems((p) => {
        prev = p;
        return p.map((e) => {
          if (e.id !== id) return e;
          const i = STAGES.indexOf(e.stage);
          const n = Math.max(0, Math.min(STAGES.length - 1, i + dir));
          return { ...e, stage: STAGES[n] };
        });
      });
      api<{ ok: boolean; data: { stage: EnquiryStage } }>(`/enquiries/${id}/move`, {
        method: 'POST',
        tenantSlug,
        body: JSON.stringify({ dir }),
      })
        .then((res) => {
          const stage = res?.data?.stage;
          if (stage && STAGES.includes(stage)) {
            setItems((p) => p.map((e) => (e.id === id ? { ...e, stage } : e)));
          }
        })
        .catch((err) => {
          console.error('[enquiries] move failed', err);
          setItems(prev);
        });
    },
    edit: (id: string, patch: Partial<Pick<Enquiry, 'childName' | 'age' | 'parent' | 'phone' | 'source' | 'note'>>) => {
      let prev: Enquiry[] = [];
      setItems((p) => {
        prev = p;
        return p.map((e) => (e.id === id ? { ...e, ...patch } : e));
      });
      api<{ ok: boolean; data: ServerEnquiry }>(`/enquiries/${id}`, {
        method: 'PUT',
        tenantSlug,
        body: JSON.stringify(patch),
      })
        .then((res) => {
          if (res?.data) {
            const saved = toEnquiry(res.data);
            setItems((p) => p.map((e) => (e.id === id ? saved : e)));
          }
        })
        .catch((err) => {
          console.error('[enquiries] edit failed', err);
          setItems(prev);
        });
    },
    remove: (id: string) => {
      let prev: Enquiry[] = [];
      setItems((p) => {
        prev = p;
        return p.filter((e) => e.id !== id);
      });
      api<{ ok: boolean }>(`/enquiries/${id}`, { method: 'DELETE', tenantSlug }).catch((err) => {
        console.error('[enquiries] remove failed', err);
        setItems(prev);
      });
    },
  };
}
