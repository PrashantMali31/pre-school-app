'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StoreProvider, SyncBanner } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import MobileNav from '@/components/MobileNav';
import { Skeleton } from '@/components/ui';

function Guard({ children }: { children: React.ReactNode }) {
  const authValue = useAuth();
  const { user, ready, tenant } = authValue;
  const router = useRouter();

  useEffect(() => {
    if (ready && !user) router.replace('/login');
  }, [ready, user, router]);

  // Backend tenants are keyed by slug. Prefer the explicit active slug,
  // fall back to the resolved membership tenant (works with old + new auth shapes).
  // Never fall back to tenant.id: ids are UUIDs and the backend expects the
  // human slug in X-Tenant-Slug. Empty slug forces the school picker below.
  const asRecord = authValue as unknown as Record<string, unknown>;
  const activeSlug = typeof asRecord.activeSlug === 'string' ? (asRecord.activeSlug as string) : null;
  const tenantSlug =
    activeSlug ||
    (tenant as { slug?: string } | undefined)?.slug ||
    (asRecord.tenant as { slug?: string } | undefined)?.slug ||
    '';

  useEffect(() => {
    if (ready && user && !tenantSlug) router.replace('/tenants');
  }, [ready, user, tenantSlug, router]);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen" aria-label="Loading your school">
        <div className="hidden w-[264px] shrink-0 p-4 md:block">
          <div className="h-full rounded-[28px] bg-[#1E1B2E] p-4 dark:bg-[#10101A]">
            <div className="flex items-center gap-3">
              <Skeleton style={{ width: 44, height: 44, borderRadius: 16 }} />
              <div className="flex-1">
                <Skeleton style={{ height: 14, width: '70%' }} />
                <Skeleton className="mt-2" style={{ height: 10, width: '50%' }} />
              </div>
            </div>
            <div className="mt-6 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} style={{ height: 52 }} />
              ))}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 px-3 md:px-5 pt-6">
          <Skeleton style={{ height: 68, borderRadius: 22 }} />
          <Skeleton className="mt-6" style={{ height: 180, borderRadius: 28 }} />
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} style={{ height: 130, borderRadius: 24 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <StoreProvider
      key={tenantSlug}
      tenantSlug={tenantSlug}
      schoolName={tenant?.name}
    >
      <div className="flex w-full">
        <Sidebar />
        <main className="min-w-0 flex-1 px-3 md:px-5 pb-28 md:pb-16 pt-3">
          <Topbar />
          <SyncBanner />
          <div className="mt-6">{children}</div>
        </main>
        <MobileNav />
      </div>
    </StoreProvider>
  );
}

export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <Guard>{children}</Guard>;
}
