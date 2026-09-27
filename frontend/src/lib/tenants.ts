/* ------------------------------------------------------------------ */
/* Tenant helpers (API-backed world). This module no longer owns a       */
/* localStorage registry — schools live on the backend and are exposed   */
/* via useAuth(). Only pure helpers + shared types live here.            */
/* ------------------------------------------------------------------ */

export type Plan = 'Starter' | 'Pro' | 'Enterprise';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  plan: Plan;
}

/** Password for the seeded demo logins (demo@<slug>.in). Shown as a UI hint only. */
export const DEMO_PASSWORD = 'sprouts123';

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'school'
  );
}
