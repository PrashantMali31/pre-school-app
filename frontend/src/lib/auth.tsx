'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '@/lib/api';

export type Role = 'Admin' | 'Teacher' | 'Parent';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface MembershipTenant {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  plan: 'Starter' | 'Pro' | 'Enterprise';
  role: Role;
  demo?: boolean;
}

interface AuthCtx {
  user: SessionUser | null;
  ready: boolean;
  tenant: MembershipTenant | undefined;
  tenants: MembershipTenant[];
  activeSlug: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  signup: (name: string, email: string, password: string, schoolName: string) => Promise<string | null>;
  logout: () => void;
  switchTenant: (slug: string) => void;
  createSchool: (schoolName: string, plan: 'Starter' | 'Pro' | 'Enterprise') => Promise<string | null>;
  deleteSchool: (slug: string) => Promise<string | null>;
  refresh: () => Promise<void>;
}

const ACTIVE_SLUG_KEY = 'saas_active_slug';

function readStoredSlug(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SLUG_KEY);
  } catch {
    return null;
  }
}

function writeStoredSlug(slug: string | null) {
  try {
    if (slug) localStorage.setItem(ACTIVE_SLUG_KEY, slug);
    else localStorage.removeItem(ACTIVE_SLUG_KEY);
  } catch {}
}

/** Backend rows carry extra columns (demo, seedPool, timestamps…) — keep only the contract shape. */
function normalizeTenant(row: Record<string, unknown>): MembershipTenant {
  return {
    id: String(row.id ?? ''),
    slug: String(row.slug ?? ''),
    name: String(row.name ?? ''),
    tagline: typeof row.tagline === 'string' ? row.tagline : '',
    plan: (row.plan as MembershipTenant['plan']) ?? 'Starter',
    role: (row.role as Role) ?? 'Admin',
    demo: row.demo === true,
  };
}

function pickActive(memberships: MembershipTenant[], preferred: string | null): string | null {
  if (preferred && memberships.some((m) => m.slug === preferred)) return preferred;
  return memberships[0]?.slug ?? null;
}

function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.';
}

const Ctx = createContext<AuthCtx>({
  user: null,
  ready: false,
  tenant: undefined,
  tenants: [],
  activeSlug: null,
  login: async () => 'Not ready',
  signup: async () => 'Not ready',
  logout: () => {},
  switchTenant: () => {},
  createSchool: async () => 'Not ready',
  deleteSchool: async () => 'Not ready',
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [tenants, setTenants] = useState<MembershipTenant[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const applySession = useCallback((u: SessionUser | null, memberships: MembershipTenant[]) => {
    setUser(u);
    setTenants(memberships);
    if (!u || memberships.length === 0) {
      setActiveSlug(null);
      writeStoredSlug(null);
      return;
    }
    const next = pickActive(memberships, readStoredSlug());
    setActiveSlug(next);
    writeStoredSlug(next);
  }, []);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setTenants([]);
      setActiveSlug(null);
      setReady(true);
      return;
    }
    try {
      const me = await api<{ user: SessionUser | null; memberships: Record<string, unknown>[] }>('/auth/me');
      if (!me.user) {
        setToken(null);
        applySession(null, []);
      } else {
        applySession(me.user, (me.memberships ?? []).filter(Boolean).map(normalizeTenant));
      }
    } catch {
      setToken(null);
      applySession(null, []);
    } finally {
      setReady(true);
    }
  }, [applySession]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional session fetch on mount
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      ready,
      tenant: tenants.find((t) => t.slug === activeSlug),
      tenants,
      activeSlug,
      login: async (email, password) => {
        try {
          const res = await api<{
            accessToken: string;
            user: SessionUser;
            tenants: Record<string, unknown>[];
          }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: email.trim(), password }),
          });
          setToken(res.accessToken);
          applySession(res.user, (res.tenants ?? []).map(normalizeTenant));
          return null;
        } catch (e) {
          return errMsg(e);
        }
      },
      signup: async (name, email, password, schoolName) => {
        if (!schoolName.trim() || schoolName.trim().length < 2) {
          return 'Give your school a name (min 2 characters).';
        }
        try {
          const res = await api<{
            accessToken: string;
            user: SessionUser;
            tenant: Record<string, unknown>;
          }>('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim(), email: email.trim(), password, schoolName: schoolName.trim() }),
          });
          setToken(res.accessToken);
          applySession(res.user, [{ ...normalizeTenant(res.tenant), role: 'Admin' }]);
          return null;
        } catch (e) {
          return errMsg(e);
        }
      },
      logout: () => {
        // best-effort server logout (clears refresh cookie); never block local logout
        try {
          void api('/auth/logout', { method: 'POST' }).catch(() => {});
        } catch {}
        setToken(null);
        setUser(null);
        setTenants([]);
        setActiveSlug(null);
        writeStoredSlug(null);
      },
      switchTenant: (slug) => {
        if (slug === activeSlug) return;
        if (!tenants.some((t) => t.slug === slug)) return;
        setActiveSlug(slug);
        writeStoredSlug(slug);
      },
      createSchool: async (schoolName, plan) => {
        if (!schoolName.trim() || schoolName.trim().length < 2) {
          return 'Give your school a name (min 2 characters).';
        }
        try {
          const res = await api<{ data: Record<string, unknown> }>('/tenants', {
            method: 'POST',
            body: JSON.stringify({ name: schoolName.trim(), plan }),
          });
          const created: MembershipTenant = { ...normalizeTenant(res.data), role: 'Admin' };
          const next = [...tenants, created];
          setTenants(next);
          setActiveSlug(created.slug);
          writeStoredSlug(created.slug);
          return null;
        } catch (e) {
          return errMsg(e);
        }
      },
      deleteSchool: async (slug) => {
        if (slug === activeSlug) return 'Switch to another school before deleting this one.';
        try {
          await api(`/tenants/${encodeURIComponent(slug)}`, { method: 'DELETE' });
          setTenants((prev) => {
            const next = prev.filter((t) => t.slug !== slug);
            // active slug is never the deleted one (blocked above), so no slug change needed
            void next;
            return next;
          });
          return null;
        } catch (e) {
          return errMsg(e);
        }
      },
      refresh,
    }),
    [user, ready, tenants, activeSlug, applySession, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  return useContext(Ctx);
}

/** Best-effort sync session read (email only) — decoded from the stored access token. */
export function getSession(): { email: string } | null {
  try {
    const token = getToken();
    if (!token) return null;
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { email?: unknown };
    return typeof json.email === 'string' && json.email ? { email: json.email } : null;
  } catch {
    return null;
  }
}
