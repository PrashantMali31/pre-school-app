'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, PartyPopper, TriangleAlert } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import { Btn, Err, Field, errStyle, inputCls } from '@/components/ui';
import { api } from '@/lib/api';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 rounded-[22px] bg-[#FFE4E6] p-6 text-center">
        <TriangleAlert size={36} className="mx-auto text-[#B91C1C]" />
        <p className="mt-3 font-black text-[#B91C1C]">Missing reset link</p>
        <p className="mt-1 text-[13px] font-semibold text-[#6B6580]">
          This page needs a <span className="font-black">?token=</span> from your reset email. Please request a new link.
        </p>
        <Link href="/forgot-password" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
          <ArrowLeft size={14} /> Request a new link
        </Link>
      </motion.div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pass.length < 6) {
      setFieldError('Password must be at least 6 characters');
      return;
    }
    if (pass.length > 72) {
      setFieldError('Password is too long');
      return;
    }
    if (pass !== confirm) {
      setFieldError('Passwords do not match');
      return;
    }
    setFieldError(undefined);
    setFormError('');
    setLoading(true);
    try {
      await api<{ ok: true }>('/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ token, password: pass }),
      });
      setDone(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 rounded-[22px] bg-[#DCFCE7] p-6 text-center">
        <PartyPopper size={36} className="mx-auto text-[#15803D]" />
        <p className="mt-3 font-black text-[#15803D]">Password updated 🎉</p>
        <p className="mt-1 text-[13px] font-semibold text-[#6B6580]">You&apos;re all set — log in with your new password.</p>
        <Link href="/login" className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
          Go to login <ArrowLeft size={14} className="rotate-180" />
        </Link>
      </motion.div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <Field label="New password">
        <div className="relative">
          <input type={show ? 'text' : 'password'} className={`${inputCls} pr-12`} style={errStyle(fieldError)} value={pass} onChange={(e) => { setPass(e.target.value); setFieldError(undefined); }} placeholder="••••••••" autoComplete="new-password" />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A93B0] hover:text-black cursor-pointer dark:hover:text-white">
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
      </Field>
      <Field label="Confirm password">
        <input type={show ? 'text' : 'password'} className={inputCls} style={errStyle(fieldError)} value={confirm} onChange={(e) => { setConfirm(e.target.value); setFieldError(undefined); }} placeholder="••••••••" autoComplete="new-password" />
        <Err msg={fieldError} />
      </Field>
      {formError && (
        <p className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{formError}</p>
      )}
      <Btn type="submit" variant="dark" className="w-full !py-3.5 !text-[15px]">
        {loading ? <Loader2 size={17} className="animate-spin" /> : null}
        {loading ? 'Updating…' : 'Set new password'}
      </Btn>
    </form>
  );
}

export default function ResetPage() {
  return (
    <AuthShell>
      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF4CC] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#8A6D00]">
          <KeyRound size={12} /> Password reset
        </p>
        <h1 className="mt-3 text-[30px] font-black tracking-tight">Set a new password 🔒</h1>
        <p className="mt-1 text-[14px] font-medium text-[#8A84A0]">Choose something memorable — at least 6 characters.</p>

        <Suspense fallback={<p className="mt-6 text-[13px] font-bold text-[#8A84A0]">Loading…</p>}>
          <ResetForm />
        </Suspense>

        <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
          <ArrowLeft size={14} /> Back to login
        </Link>
      </motion.div>
    </AuthShell>
  );
}
