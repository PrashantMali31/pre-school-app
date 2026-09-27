'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Eye, EyeOff, Loader2, PartyPopper } from 'lucide-react';
import AuthShell from '@/components/AuthShell';
import { Btn, Err, Field, errStyle, inputCls } from '@/components/ui';
import { FieldErrors, signupSchema, validateFields } from '@/lib/schemas';
import { useAuth } from '@/lib/auth';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [schoolName, setSchoolName] = useState('');
  const [loading, setLoading] = useState(false);

  const clear = (k: string) => setFieldErrors((p) => ({ ...p, [k]: undefined }));

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!schoolName.trim() || schoolName.trim().length < 2) {
      setFieldErrors((p) => ({ ...p, schoolName: 'Give your school a name (min 2 characters)' }));
      return;
    }
    // Zod validates everything incl. password === confirm (role fixed: founders join as Admin)
    const { errors: errs, value } = validateFields(signupSchema, { name, email, role: 'Admin', password: pass, confirm });
    if (!value) {
      setFieldErrors(errs);
      return;
    }
    setLoading(true);
    setErr('');
    const error = await signup(value.name, value.email, value.password, schoolName.trim());
    setLoading(false);
    if (error) setErr(error);
    else router.push('/home');
  };

  return (
    <AuthShell>
      <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-[#EAFBEF] px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-[#15803D]">
          🌱 Join the garden
        </p>
        <h1 className="mt-3 text-[30px] font-black tracking-tight">Create account 🎈</h1>
        <p className="mt-1 text-[14px] font-medium text-[#8A84A0]">
          Already have one?{' '}
          <Link href="/login" className="font-black text-[#7C9DFF] hover:underline">
            Log in
          </Link>
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="School name">
            <input className={inputCls} style={errStyle(fieldErrors.schoolName)} value={schoolName} onChange={(e) => { setSchoolName(e.target.value); clear('schoolName'); }} placeholder="e.g. Sunshine Kids" autoComplete="organization" />
            <Err msg={fieldErrors.schoolName} />
          </Field>
          <Field label="Full name">
            <input className={inputCls} style={errStyle(fieldErrors.name)} value={name} onChange={(e) => { setName(e.target.value); clear('name'); }} placeholder="e.g. Meera Krishnan" autoComplete="name" />
            <Err msg={fieldErrors.name} />
          </Field>
          <Field label="Email address">
            <input type="email" className={inputCls} style={errStyle(fieldErrors.email)} value={email} onChange={(e) => { setEmail(e.target.value); clear('email'); }} placeholder="you@school.in" autoComplete="email" />
            <Err msg={fieldErrors.email} />
          </Field>
          <p className="-mt-1 text-[11.5px] font-bold text-[#9A93B0]">You join as Admin 👑 · your school starts on the Starter plan.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Password">
              <div className="relative">
                <input type={show ? 'text' : 'password'} className={`${inputCls} pr-11`} style={errStyle(fieldErrors.password)} value={pass} onChange={(e) => { setPass(e.target.value); clear('password'); }} placeholder="Min 6 chars" autoComplete="new-password" />
                <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A93B0] hover:text-black cursor-pointer dark:hover:text-white">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <Err msg={fieldErrors.password} />
            </Field>
            <Field label="Confirm">
              <input type={show ? 'text' : 'password'} className={inputCls} style={errStyle(fieldErrors.confirm)} value={confirm} onChange={(e) => { setConfirm(e.target.value); clear('confirm'); }} placeholder="Repeat it" autoComplete="new-password" />
              <Err msg={fieldErrors.confirm} />
            </Field>
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
            {loading ? <Loader2 size={17} className="animate-spin" /> : <PartyPopper size={17} />}
            {loading ? 'Planting your account…' : 'Sign up free'}
          </Btn>
        </form>

        <p className="mt-6 text-center text-[11px] font-semibold text-[#9A93B0]">
          <Link href="/" className="inline-flex items-center gap-1 font-black text-[#7C9DFF] hover:underline">
            <ArrowLeft size={12} /> Back to home
          </Link>
        </p>
      </motion.div>
    </AuthShell>
  );
}
