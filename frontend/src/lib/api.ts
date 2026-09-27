/* SaaS API client — replaces direct localStorage access.
   Usage: api('/students', { tenantSlug }) etc. Token stored in memory + localStorage. */

function resolveBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (!env && typeof console !== 'undefined') {
    const flag = globalThis as { __saasApiUrlWarned?: boolean };
    if (!flag.__saasApiUrlWarned) {
      flag.__saasApiUrlWarned = true;
      console.warn('[api] NEXT_PUBLIC_API_URL is not set — falling back to http://localhost:4000');
    }
  }
  return env ?? 'http://localhost:4000';
}

const BASE = resolveBase();

const TOKEN_KEY = 'saas_access_token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

interface ApiOpts extends RequestInit {
  token?: string;
  tenantSlug?: string;
}

/** Single-flight refresh: N parallel 401s share one /auth/refresh call. */
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const r = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!r.ok) {
        setToken(null);
        throw new Error('Session expired — please log in again.');
      }
      const { accessToken } = (await r.json()) as { accessToken: string };
      setToken(accessToken);
      return accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function api<T>(path: string, opts: ApiOpts = {}, retried = false, netAttempt = 0): Promise<T> {
  const token = opts.token ?? getToken();
  // Only send a JSON content-type when there is actually a body:
  // several endpoints (pin/pay/delete/refresh-style POSTs) take no body,
  // and servers reject `Content-Type: application/json` with an empty body.
  const hasBody = opts.body !== undefined && opts.body !== null;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...opts,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.tenantSlug ? { 'X-Tenant-Slug': opts.tenantSlug } : {}),
        ...(opts.headers ?? {}),
      },
      credentials: 'include', // refresh cookie
    });
  } catch (e) {
    // Transient network abort (server hot-reload, laptop sleep/wake killing
    // keep-alive sockets, HMR reload, flaky wifi) surfaces as TypeError
    // "Failed to fetch" with no status. Retry with backoff for idempotent
    // methods (covers ~7s of outage). POST creates stay single-shot —
    // a blind retry could double-create rows.
    const method = (opts.method ?? 'GET').toUpperCase();
    const backoff = [800, 2000, 4000];
    if (
      !netAttempt ||
      (e instanceof TypeError &&
        (method === 'GET' || method === 'PUT' || method === 'DELETE') &&
        netAttempt < backoff.length)
    ) {
      if (e instanceof TypeError && (method === 'GET' || method === 'PUT' || method === 'DELETE') && netAttempt < backoff.length) {
        await new Promise((r) => setTimeout(r, backoff[netAttempt]));
        return api<T>(path, opts, retried, netAttempt + 1);
      }
    }
    throw e;
  }
  if (res.status === 401 && !retried) {
    // try silent refresh once (deduped across concurrent callers)
    try {
      const accessToken = await refreshAccessToken();
      return api<T>(path, { ...opts, token: accessToken }, true);
    } catch {
      setToken(null);
    }
  }
  // 204 No Content (e.g. DELETE / logout): no body to parse.
  if (res.status === 204) return null as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: { message?: string } }).error?.message ?? `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}
