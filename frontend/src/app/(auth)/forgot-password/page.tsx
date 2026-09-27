'use client';
import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, KeyRound, Loader2, MailCheck } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import { Btn, Err, Field, errStyle, inputCls } from '@/components/ui';
import { forgotSchema } from '@/lib/schemas';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [emailError, setEmailError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = forgotSchema.safeParse({ email });
    if (!res.success) {
      setEmailError(res.error.issues[0]?.message ?? 'Invalid email');
      return;
    }
    setEmailError(undefined);
    setFormError('');
    setLoading(true);
    try {
      await api<{ ok: true }>('/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ email: res.data.email }),
      });
      setSent(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF4CC] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#8A6D00]">
          <KeyRound size={12} /> Password reset
        </p>
        <h1 className="mt-3 text-[30px] font-black tracking-tight">Forgot password? 🔑</h1>
        <p className="mt-1 text-[14px] font-medium text-[#8A84A0]">Enter your account email and we&apos;ll send a reset link.</p>

        {sent ? (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 rounded-[22px] bg-[#FFF4CC] p-6 text-center">
            <MailCheck size={36} className="mx-auto text-[#8A6D00]" />
            <p className="mt-3 font-black text-[#8A6D00]">Check your inbox 📬</p>
            <p className="mt-1 text-[13px] font-semibold text-[#6B6580]">
              If an account exists, a reset link was sent. It expires in 1 hour.
            </p>
          </motion.div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email address">
              <input type="email" className={inputCls} style={errStyle(emailError)} value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(undefined); }} placeholder="you@school.in" autoComplete="email" />
              <Err msg={emailError} />
            </Field>
            {formError && (
              <p className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{formError}</p>
            )}
            <Btn type="submit" variant="dark" className="w-full !py-3.5 !text-[15px]">
              {loading ? <Loader2 size={17} className="animate-spin" /> : null}
              {loading ? 'Sending…' : 'Send reset link'}
            </Btn>
          </form>
        )}

        <Link href="/login" className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-black text-[#7C9DFF] hover:underline">
          <ArrowLeft size={14} /> Back to login
        </Link>
      </motion.div>
    </AuthShell>
  );
}
