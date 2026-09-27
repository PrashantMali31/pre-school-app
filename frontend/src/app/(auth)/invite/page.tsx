'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Loader2, MailPlus, PartyPopper, TriangleAlert } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import { Btn, Err, Field, errStyle, inputCls } from '@/components/ui';
import { getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';

function resolveBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (!env && typeof console !== 'undefined') {
    const flag = globalThis as { __saasApiUrlWarned?: boolean };
    if (!flag.__saasApiUrlWarned) {
      flag.__saasApiUrlWarned = true;
      console.warn('[invite] NEXT_PUBLIC_API_URL is not set — falling back to http://localhost:4000');
    }
  }
  return env ?? 'http://localhost:4000';
}

// Public invite-accept stays on raw fetch (no tenant slug) with the same fallback as api.ts.
const BASE = resolveBase();

interface AcceptError {
  code?: string;
  message: string;
}

async function acceptInvite(token: string, body: Record<string, string>): Promise<{ ok: true; slug: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  } catch {}
  const res = await fetch(`${BASE}/invites/accept`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ token, ...body }),
  });
  // 204/empty bodies carry no JSON — treat as success without a slug.
  if (res.status === 204) return { ok: true, slug: '' };
  const text = await res.text().catch(() => '');
  const data = text ? (JSON.parse(text) as unknown) : {};
  if (!res.ok) {
    const err = (data as { error?: AcceptError }).error;
    const e = new Error(err?.message ?? `Request failed (${res.status})`) as Error & { code?: string };
    e.code = err?.code;
    throw e;
  }
  return data as { ok: true; slug: string };
}

function friendlyMessage(e: unknown): { code?: string; message: string } {
  const code = (e as { code?: string })?.code;
  const message = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
  return { code, message };
}

function InviteForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, ready, refresh } = useAuth();
  const token = params.get('token') ?? '';

  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<{ code?: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ slug: string } | null>(null);

  // Logged-out success -> redirect to /login with hint (carries ?invited=1).
  useEffect(() => {
    if (!done || user) return;
    const t = setTimeout(() => router.push('/login?invited=1'), 3500);
    return () => clearTimeout(t);
  }, [done, user, router]);

  if (!token) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 rounded-[22px] bg-[#FFE4E6] p-6 text-center">
        <TriangleAlert size={36} className="mx-auto text-[#B91C1C]" />
        <p className="mt-3 font-black text-[#B91C1C]">Missing invite link</p>
        <p className="mt-1 text-[13px] font-semibold text-[#6B6580]">
          This page needs a <span className="font-black">?token=</span> from your school invite. Ask your school Admin for a new link.
        </p>
        <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
          <ArrowLeft size={14} /> Back to login
        </Link>
      </motion.div>
    );
  }

  const goToSchool = async (slug: string) => {
    try {
      localStorage.setItem('saas_active_slug', slug);
    } catch {}
    await refresh();
    router.push('/home');
  };

  const acceptLoggedIn = async () => {
    setLoading(true);
    setFormError(null);
    try {
      const res = await acceptInvite(token, {});
      await goToSchool(res.slug);
    } catch (e) {
      setFormError(friendlyMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const acceptNewAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setFieldError('Name must be at least 2 characters');
      return;
    }
    if (pass.length < 6) {
      setFieldError('Password must be at least 6 characters');
      return;
    }
    if (pass.length > 72) {
      setFieldError('Password is too long');
      return;
    }
    setFieldError(undefined);
    setFormError(null);
    setLoading(true);
    try {
      const res = await acceptInvite(token, { name: name.trim(), password: pass });
      setDone({ slug: res.slug });
    } catch (err) {
      setFormError(friendlyMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (done && !user) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 rounded-[22px] bg-[#DCFCE7] p-6 text-center">
        <PartyPopper size={36} className="mx-auto text-[#15803D]" />
        <p className="mt-3 font-black text-[#15803D]">You&apos;re in! 🎉</p>
        <p className="mt-1 text-[13px] font-semibold text-[#6B6580]">
          Your account was created and joined <span className="font-black">{done.slug}</span>. Taking you to login…
        </p>
        <Link href="/login?invited=1" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
          Continue to login <ArrowLeft size={14} className="rotate-180" />
        </Link>
      </motion.div>
    );
  }

  const stateHint = (code?: string) => {
    switch (code) {
      case 'ALREADY_ACCEPTED':
        return 'This invite was already used — just log in to enter your school.';
      case 'EXPIRED_TOKEN':
        return 'This invite expired — ask your school Admin for a fresh link.';
      case 'INVALID_TOKEN':
        return 'This invite link looks wrong — check the full URL or ask for a new link.';
      case 'USE_LOGIN':
        return 'Tip: log in first, then open the invite link again to join in one click.';
      default:
        return null;
    }
  };

  return (
    <div className="mt-6">
      {!ready ? (
        <p className="text-[13px] font-bold text-[#8A84A0]">Loading…</p>
      ) : user ? (
        <div className="space-y-4">
          <p className="text-[14px] font-medium text-[#8A84A0]">
            Logged in as <span className="font-black text-black dark:text-white">{user.email}</span> — one click joins your school.
          </p>
          {formError && (
            <div className="rounded-[22px] bg-[#FFE4E6] p-5 text-center">
              <TriangleAlert size={30} className="mx-auto text-[#B91C1C]" />
              <p className="mt-2 font-black text-[#B91C1C]">{formError.message}</p>
              {stateHint(formError.code) && <p className="mt-1 text-[13px] font-semibold text-[#6B6580]">{stateHint(formError.code)}</p>}
              {formError.code === 'ALREADY_ACCEPTED' && (
                <Link href="/home" className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
                  Go to your school <ArrowLeft size={14} className="rotate-180" />
                </Link>
              )}
            </div>
          )}
          <Btn variant="dark" className="w-full !py-3.5 !text-[15px]" onClick={acceptLoggedIn}>
            {loading ? <Loader2 size={17} className="animate-spin" /> : null}
            {loading ? 'Joining…' : 'Accept invite & join ✨'}
          </Btn>
        </div>
      ) : (
        <form onSubmit={acceptNewAccount} className="space-y-4">
          <p className="text-[14px] font-medium text-[#8A84A0]">You&apos;ve been invited! Pick a name + password to join your school.</p>
          <Field label="Your name">
            <input className={inputCls} style={errStyle(fieldError)} value={name} onChange={(e) => { setName(e.target.value); setFieldError(undefined); }} placeholder="e.g. Priya Sharma" autoComplete="name" />
          </Field>
          <Field label="Choose a password">
            <div className="relative">
              <input type={show ? 'text' : 'password'} className={`${inputCls} pr-12`} style={errStyle(fieldError)} value={pass} onChange={(e) => { setPass(e.target.value); setFieldError(undefined); }} placeholder="••••••••" autoComplete="new-password" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A93B0] hover:text-black cursor-pointer dark:hover:text-white">
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <Err msg={fieldError} />
          </Field>
          {formError && (
            <div className="rounded-2xl bg-[#FFE4E6] px-4 py-3">
              <p className="text-[13px] font-bold text-[#B91C1C]">{formError.message}</p>
              {stateHint(formError.code) && <p className="mt-1 text-[12px] font-semibold text-[#6B6580]">{stateHint(formError.code)}</p>}
              {formError.code === 'USE_LOGIN' && (
                <Link href="/login" className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
                  Go to login <ArrowLeft size={14} className="rotate-180" />
                </Link>
              )}
            </div>
          )}
          <Btn type="submit" variant="dark" className="w-full !py-3.5 !text-[15px]">
            {loading ? <Loader2 size={17} className="animate-spin" /> : null}
            {loading ? 'Joining…' : 'Create account & join ✨'}
          </Btn>
        </form>
      )}
    </div>
  );
}

export default function InvitePage() {
  return (
    <AuthShell>
      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[#EAFBEF] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#15803D]">
          <MailPlus size={12} /> School invite
        </p>
        <h1 className="mt-3 text-[30px] font-black tracking-tight">Join your school 🏫</h1>
        <p className="mt-1 text-[14px] font-medium text-[#8A84A0]">Accept your invite to get the role your Admin chose for you.</p>

        <Suspense fallback={<p className="mt-6 text-[13px] font-bold text-[#8A84A0]">Loading…</p>}>
          <InviteForm />
        </Suspense>

        <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
          <ArrowLeft size={14} /> Back to login
        </Link>
      </motion.div>
    </AuthShell>
  );
}
