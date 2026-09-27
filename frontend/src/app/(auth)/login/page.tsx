'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Loader2, LogIn, Sparkles } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import { Btn, Err, Field, errStyle, inputCls } from '@/components/ui';
import { FieldErrors, loginSchema, validateFields } from '@/lib/schemas';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    // Zod first: catch malformed input before touching auth
    const { errors: errs, value } = validateFields(loginSchema, { email, password: pass });
    if (!value) {
      setFieldErrors(errs);
      return;
    }
    setLoading(true);
    setErr('');
    const error = await login(value.email, value.password);
    setLoading(false);
    if (error) setErr(error);
    else router.push('/home');
  };

  return (
    <AuthShell>
      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF1E6] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#B45309]">
          <Sparkles size={12} /> Welcome back
        </p>
        <h1 className="mt-3 text-[30px] font-black tracking-tight">Log in 🌱</h1>
        <p className="mt-1 text-[14px] font-medium text-[#8A84A0]">
          New here?{' '}
          <Link href="/signup" className="font-black text-[#7C9DFF] hover:underline">
            Create an account
          </Link>
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Email address">
            <input type="email" className={inputCls} style={errStyle(fieldErrors.email)} value={email} onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: undefined })); }} placeholder="you@school.in" autoComplete="email" />
            <Err msg={fieldErrors.email} />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input type={show ? 'text' : 'password'} className={`${inputCls} pr-12`} style={errStyle(fieldErrors.password)} value={pass} onChange={(e) => { setPass(e.target.value); setFieldErrors((p) => ({ ...p, password: undefined })); }} placeholder="••••••••" autoComplete="current-password" />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A93B0] hover:text-black cursor-pointer dark:hover:text-white">
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <Err msg={fieldErrors.password} />
          </Field>

          <div className="flex items-center justify-between text-[13px]">
            <label className="flex items-center gap-2 font-bold text-[#6B6580] cursor-pointer">
              <input type="checkbox" defaultChecked className="h-4 w-4 accent-[#7C9DFF]" /> Remember me
            </label>
            <Link href="/forgot-password" className="font-black text-[#7C9DFF] hover:underline">
              Forgot password?
            </Link>
          </div>

          <AnimatePresence>
            {err && (
              <motion.p
                key={err}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: [0, -6, 6, -3, 3, 0] }}
                exit={{ opacity: 0 }}
                className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]"
              >
                {err}
              </motion.p>
            )}
          </AnimatePresence>

          <Btn type="submit" variant="dark" className="w-full !py-3.5 !text-[15px]">
            {loading ? <Loader2 size={17} className="animate-spin" /> : <LogIn size={17} />}
            {loading ? 'Signing you in…' : 'Log in'}
          </Btn>
        </form>

        <p className="mt-6 text-center text-[11px] font-semibold text-[#9A93B0]">
          <Link href="/" className="inline-flex items-center gap-1 font-black text-[#7C9DFF] hover:underline">
            <ArrowLeft size={12} /> Back to home
          </Link>
          <span className="mx-2">·</span>
          Secure sign-in · powered by your school&apos;s backend 🔒
        </p>
      </motion.div>
    </AuthShell>
  );
}
