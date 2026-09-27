'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft, Building2, Check, Copy, LogIn, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Btn, Card, ConfirmDialog, Err, Field, Modal, PageHeader, Pill, errStyle, inputCls, type PendingConfirm } from '@/components/ui';
import { FieldErrors, schoolFormSchema, validateFields } from '@/lib/schemas';
import { DEMO_PASSWORD, type Plan, type Tenant } from '@/lib/tenants';

const PLAN_COLORS: Record<Plan, string> = {
  Starter: '#4ADE80',
  Pro: '#7C9DFF',
  Enterprise: '#C084FC',
};

/** Demo schools are normal logins (password sprouts123). */
const DEMO_EMAILS: Record<string, string> = {
  'little-sprouts': 'demo@little-sprouts.in',
  'sunshine-kids': 'demo@sunshine-kids.in',
  'rainbow-preschool': 'demo@rainbow-preschool.in',
};

interface Invite {
  id: string;
  email: string;
  role: 'Teacher' | 'Parent';
  expiresAt: string;
  acceptedAt: string | null;
}

function InviteSection({ slug }: { slug: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Teacher' | 'Parent'>('Teacher');
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [listErr, setListErr] = useState('');
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');

  const load = async () => {
    setLoading(true);
    setLink('');
    setSendErr('');
    try {
      setListErr('');
      const res = await api<{ data: Invite[] }>('/invites', { tenantSlug: slug });
      setInvites(res.data ?? []);
    } catch (e) {
      setListErr(e instanceof Error ? e.message : 'Could not load invites.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional per-school invite fetch on slug change
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const send = async () => {
    const trimmed = email.trim();
    if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setSendErr('Enter a valid email address.');
      return;
    }
    setSending(true);
    setSendErr('');
    try {
      const res = await api<{ data: { inviteUrl: string } }>('/invites', {
        method: 'POST',
        tenantSlug: slug,
        body: JSON.stringify({ email: trimmed, role }),
      });
      setLink(res.data.inviteUrl);
      setCopied(false);
      setEmail('');
      await load();
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : 'Could not send invite.');
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSendErr('Copy failed — select the link manually.');
    }
  };

  const doRevoke = async (id: string) => {
    try {
      await api(`/invites/${encodeURIComponent(id)}`, { method: 'DELETE', tenantSlug: slug });
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      setListErr(e instanceof Error ? e.message : 'Could not revoke invite.');
    }
  };

  const askRevoke = (invite: Invite) => {
    setConfirm({
      title: `Revoke invite for ${invite.email}?`,
      message: `Revoke the invite for "${invite.email}"? The link will stop working.`,
      confirmLabel: 'Delete',
      onConfirm: () => doRevoke(invite.id),
    });
  };

  const startEdit = (invite: Invite) => {
    setEditingId(invite.id);
    setEditEmail(invite.email);
    setEditErr('');
  };

  const saveEdit = async (invite: Invite) => {
    const trimmed = editEmail.trim().toLowerCase();
    if (!trimmed || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setEditErr('Enter a valid email address.');
      return;
    }
    if (trimmed === invite.email.toLowerCase()) {
      setEditingId(null);
      return;
    }
    // No update endpoint (and the token must rotate when the recipient changes,
    // otherwise the old link still works): create the corrected invite first so
    // a failed create never loses the original, then revoke the old one.
    setEditBusy(true);
    setEditErr('');
    try {
      const res = await api<{ data: { inviteUrl: string } }>('/invites', {
        method: 'POST',
        tenantSlug: slug,
        body: JSON.stringify({ email: trimmed, role: invite.role }),
      });
      let revokeFailed = false;
      try {
        await api(`/invites/${encodeURIComponent(invite.id)}`, { method: 'DELETE', tenantSlug: slug });
      } catch {
        revokeFailed = true;
      }
      await load();
      setLink(res.data.inviteUrl);
      setCopied(false);
      setEditingId(null);
      if (revokeFailed) setListErr('New invite created, but the old one could not be revoked — revoke it manually.');
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Could not update invite.');
    } finally {
      setEditBusy(false);
    }
  };

  const pending = invites.filter((i) => !i.acceptedAt);
  const accepted = invites.filter((i) => i.acceptedAt);

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-9 w-9 place-items-center rounded-2xl bg-[#EEF2FF] text-[#4F46E5]"><Send size={16} /></span>
        <div>
          <h2 className="text-[16px] font-black">Invite to {slug} ✉️</h2>
          <p className="text-[12px] font-bold text-[#8A84A0]">Teachers & parents join with the role you choose · links expire in 7 days</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_auto]">
        <Field label="Email address">
          <input className={inputCls} style={errStyle(sendErr)} value={email} onChange={(e) => { setEmail(e.target.value); setSendErr(''); }} placeholder="teacher@school.in" autoComplete="email" />
        </Field>
        <Field label="Role">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as 'Teacher' | 'Parent')}>
            <option value="Teacher">Teacher</option>
            <option value="Parent">Parent</option>
          </select>
        </Field>
        <div className="flex items-end">
          <Btn variant="dark" onClick={send}><Send size={15} /> {sending ? 'Sending…' : 'Send invite'}</Btn>
        </div>
      </div>
      {sendErr && <p className="mt-3 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{sendErr}</p>}

      {link && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[#EAFBEF] px-4 py-3">
          <p className="min-w-0 flex-1 break-all text-[12px] font-bold text-[#15803D]">{link}</p>
          <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl bg-[#1E1B2E] px-3 py-2 text-[12px] font-black text-white cursor-pointer hover:bg-black">
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      <div className="mt-4">
        <p className="text-[12px] font-black uppercase tracking-widest text-[#9A93B0]">Pending ({pending.length})</p>
        {loading && <p className="mt-2 text-[13px] font-bold text-[#8A84A0]">Loading invites…</p>}
        {listErr && <p className="mt-2 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{listErr}</p>}
        {!loading && pending.length === 0 && <p className="mt-2 text-[13px] font-bold text-[#8A84A0]">No pending invites — send one above. ✨</p>}
        <ul className="mt-2 space-y-2">
          {pending.map((i) => (
            <li key={i.id} className="rounded-2xl border border-[#F1E6D8] px-4 py-2.5">
              {editingId === i.id ? (
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className={`${inputCls} min-w-0 flex-1`}
                      value={editEmail}
                      onChange={(e) => { setEditEmail(e.target.value); setEditErr(''); }}
                      placeholder="corrected@email.in"
                      autoComplete="email"
                      aria-label="Corrected invite email"
                    />
                    <button onClick={() => saveEdit(i)} disabled={editBusy} className="rounded-xl bg-[#1E1B2E] px-3.5 py-2 text-[12px] font-black text-white cursor-pointer hover:bg-black disabled:opacity-50">
                      {editBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingId(null)} disabled={editBusy} className="rounded-xl bg-[#F6F0E6] px-3.5 py-2 text-[12px] font-black cursor-pointer hover:bg-[#EFE3D0] disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                  {editErr && <p className="mt-1.5 text-[12px] font-bold text-[#E11D48]">{editErr}</p>}
                  <p className="mt-1.5 text-[11px] font-semibold text-[#9A93B0]">Saving issues a new link and revokes the old one.</p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-black">{i.email}</span>
                  <Pill color="#EEF2FF" text="#4F46E5">{i.role}</Pill>
                  <span className="text-[11px] font-bold text-[#9A93B0]">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                  <button onClick={() => startEdit(i)} title={`Edit invite for ${i.email}`} aria-label={`Edit invite for ${i.email}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => askRevoke(i)} title={`Revoke invite for ${i.email}`} aria-label={`Revoke invite for ${i.email}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFE9EF] text-[#E11D48] cursor-pointer hover:bg-[#FFD6E3]">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {accepted.length > 0 && (
          <>
            <p className="mt-4 text-[12px] font-black uppercase tracking-widest text-[#9A93B0]">Accepted ({accepted.length})</p>
            <ul className="mt-2 space-y-2">
              {accepted.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-black/5 px-4 py-2.5 opacity-60 dark:bg-white/5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-black line-through">{i.email}</span>
                  <Pill color="#E5E7EB" text="#6B7280">{i.role}</Pill>
                  <span className="text-[11px] font-bold text-[#9A93B0]">✓ accepted</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </Card>
  );
}

export default function SchoolsPage() {
  const { tenants, tenant, activeSlug, switchTenant, createSchool, deleteSchool, login, ready } = useAuth();
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [plan, setPlan] = useState<Plan>('Starter');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formErr, setFormErr] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const create = async () => {
    const { errors: errs, value } = validateFields(schoolFormSchema, { name, plan });
    if (!value) {
      setErrors(errs);
      return;
    }
    const err = await createSchool(value.name, value.plan);
    if (err) {
      setFormErr(err);
      return;
    }
    setShow(false);
    setName('');
    setPlan('Starter');
    setErrors({});
    setFormErr('');
  };

  const doRemove = async (t: Tenant) => {
    const err = await deleteSchool(t.slug);
    if (err) setActionErr(err);
    else setActionErr('');
  };

  const askRemove = (t: Tenant) => {
    // Client-side guard: never delete the school you're currently in.
    if (t.slug === activeSlug) {
      setActionErr(`You're currently in ${t.name}. Switch to another school before deleting it.`);
      return;
    }
    setConfirm({
      title: `Delete ${t.name}?`,
      message: `Delete "${t.name}"? All its data will be removed.`,
      confirmLabel: 'Delete',
      onConfirm: () => doRemove(t),
    });
  };

  const explore = async (t: Tenant) => {
    const email = DEMO_EMAILS[t.slug];
    if (!email) return;
    setActionErr('');
    const err = await login(email, DEMO_PASSWORD);
    if (err) {
      setActionErr(err);
      return;
    }
    switchTenant(t.slug);
  };

  return (
    <div>
      <PageHeader
        title="Schools 🏫"
        sub={`${tenants.length} schools on this platform · each fully isolated`}
        right={<Btn variant="dark" onClick={() => setShow(true)}><Plus size={16} /> New school</Btn>}
      />

      {!ready && <p className="mb-4 text-[13px] font-bold text-[#8A84A0]">Loading schools…</p>}
      {actionErr && <p className="mb-4 rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{actionErr}</p>}

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {tenants.map((t, i) => {
          const active = t.slug === activeSlug;
          const demoEmail = DEMO_EMAILS[t.slug];
          return (
            <motion.div key={t.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <Card className={`card-hover p-5 relative overflow-hidden ${active ? '!border-[#7C9DFF] ring-4 ring-[#7C9DFF]/15' : ''}`}>
                <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-15" style={{ background: PLAN_COLORS[t.plan] }} />
                <div className="flex items-start gap-3">
                  <div className="grid shrink-0 place-items-center rounded-2xl text-2xl font-black text-white" style={{ width: 52, height: 52, background: `linear-gradient(135deg, ${PLAN_COLORS[t.plan]}, #FF8FB1)` }}>
                    {t.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-black truncate flex items-center gap-2">{t.name} {active && <span className="text-[10px] font-black uppercase tracking-widest text-[#7C9DFF]">· active</span>}</p>
                    <p className="text-[12px] font-bold text-[#8A84A0]">/{t.slug} · {t.tagline}</p>
                  </div>
                  <Pill color={`${PLAN_COLORS[t.plan]}22`} text={PLAN_COLORS[t.plan]}><Building2 size={11} />{t.plan}</Pill>
                </div>

                <div className="mt-4 flex gap-2">
                  {!active ? (
                    <button onClick={() => switchTenant(t.slug)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1E1B2E] py-2.5 text-[12px] font-black text-white cursor-pointer hover:bg-black">
                      <ArrowRightLeft size={13} /> Switch
                    </button>
                  ) : (
                    <span className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#EAFBEF] py-2.5 text-[12px] font-black text-[#16A34A]">
                      ✓ You&apos;re here
                    </span>
                  )}
                  {!active && (
                    <button onClick={() => askRemove(t)} title={`Delete ${t.name}`} aria-label={`Delete ${t.name}`} className="grid h-10 w-10 place-items-center rounded-xl bg-[#FFE9EF] text-[#E11D48] cursor-pointer hover:bg-[#FFD6E3]">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {demoEmail && !active && (
                  <button onClick={() => explore(t)} className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#EEF2FF] py-2.5 text-[12px] font-black text-[#4F46E5] cursor-pointer hover:bg-[#E0E7FF]">
                    <LogIn size={13} /> Explore demo ({demoEmail})
                  </button>
                )}
                {demoEmail && <p className="mt-2.5 text-center text-[11px] font-bold text-[#9A93B0]">Demo school — explorable with one click · password {DEMO_PASSWORD}</p>}
              </Card>
            </motion.div>
          );
        })}
      </div>

      {tenant?.role === 'Admin' && activeSlug && <InviteSection key={activeSlug} slug={activeSlug} />}

      <Modal open={show} onClose={() => setShow(false)} label="Open a new school">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-[18px] font-black">Open a new school 🏫</h3>
            <button onClick={() => setShow(false)} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button>
          </div>
          <p className="mt-1 text-[13px] font-medium text-[#8A84A0]">Fresh isolated workspace · you become its Admin.</p>
          <div className="mt-4 space-y-3">
            <Field label="School name">
              <input data-autofocus className={inputCls} style={errStyle(errors.name)} value={name} onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }} placeholder="e.g. Sunshine Kids" />
              <Err msg={errors.name} />
            </Field>
            <Field label="Plan">
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Plan">
                {(['Starter', 'Pro', 'Enterprise'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={plan === p}
                    onClick={() => setPlan(p)}
                    className={`rounded-2xl border-2 px-2 py-3 text-[12px] font-black cursor-pointer transition ${plan === p ? 'border-[#1E1B2E] bg-[#1E1B2E] text-white' : 'border-[#F1E6D8] bg-white'}`}
                  >
                    <span className="mx-auto mb-1 block h-2.5 w-2.5 rounded-full" style={{ background: PLAN_COLORS[p] }} />
                    {p}
                  </button>
                ))}
              </div>
            </Field>
            {formErr && <p className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{formErr}</p>}
            <Btn className="w-full" variant="dark" onClick={create}>Create school ✨</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
