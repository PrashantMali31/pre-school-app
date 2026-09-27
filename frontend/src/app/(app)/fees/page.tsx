'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { BadgeCheck, Pencil, Plus, Printer, ReceiptText, X } from 'lucide-react';
import { useDB, todayISO, uid, getInvoiceNumber } from '@/lib/store';
import { useAuth } from '@/lib/auth';
import { Avatar, Btn, Card, ConfirmDialog, Empty, Err, Field, Modal, PageHeader, Pager, PendingConfirm, Pill, errStyle, inputCls } from '@/components/ui';
import { FieldErrors, invoiceSchema, validateFields } from '@/lib/schemas';
import { ensureOptions } from '@/lib/options';
import { PAYMENT_METHODS, listInvoicePayments, recordPayment, rupees, voidPayment, type Payment, type PaymentMethod } from '@/lib/payments';
import { Invoice } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PayCache {
  data: Payment[];
  totalPaidCents: number;
  balanceCents: number;
  loading: boolean;
  error: string;
}

export default function FeesPage() {
  const { db, update, tenantSlug } = useDB();
  const { tenant } = useAuth();
  const isAdmin = tenant?.role === 'Admin';
  const options = ensureOptions((db as { options?: unknown }).options);
  const [filter, setFilter] = useState('all');
  const [showBill, setShowBill] = useState(false);
  const [billTitle, setBillTitle] = useState(options.feeTitles[0] ?? 'Monthly Tuition');
  const [billStudent, setBillStudent] = useState('');
  const [billAmount, setBillAmount] = useState('6500');
  const [billError, setBillError] = useState('');

  // --- edit invoice (title/amount/dueDate via PATCH flow) ---
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editDueDate, setEditDueDate] = useState(todayISO());
  const [editErrors, setEditErrors] = useState<FieldErrors>({});
  const [editError, setEditError] = useState('');

  const editSchema = invoiceSchema.pick({ title: true, amount: true, dueDate: true });

  const openEdit = (inv: Invoice) => {
    setEditId(inv.id);
    setEditTitle(inv.title);
    setEditAmount(String(inv.amount));
    setEditDueDate(inv.dueDate);
    setEditErrors({});
    setEditError('');
    setShowEdit(true);
    void fetchPayments(inv.id);
  };

  const resetEdit = () => {
    setEditId(null);
    setEditTitle('');
    setEditAmount('');
    setEditDueDate(todayISO());
    setEditErrors({});
    setEditError('');
  };

  const saveEdit = () => {
    const { errors: errs, value } = validateFields(editSchema, { title: editTitle, amount: editAmount, dueDate: editDueDate });
    if (!value) {
      setEditErrors(errs);
      return;
    }
    if (!editId) return;
    const paidCents = payCache[editId]?.totalPaidCents ?? 0;
    const nextCents = Math.round(value.amount * 100);
    if (paidCents > 0 && nextCents < paidCents) {
      setEditError(`Amount cannot go below the already-paid ${rupees(paidCents)}.`);
      return;
    }
    const id = editId;
    update((p) => ({
      ...p,
      invoices: p.invoices.map((x) => x.id === id
        ? { ...x, title: value.title, amount: value.amount, dueDate: value.dueDate }
        : x),
    }));
    setShowEdit(false);
    resetEdit();
  };

  // --- payments (real backend money handling) ---
  const [expanded, setExpanded] = useState<string | null>(null);
  const [payCache, setPayCache] = useState<Record<string, PayCache>>({});
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('UPI');
  const [payRef, setPayRef] = useState('');
  const [payDate, setPayDate] = useState(todayISO());
  const [payError, setPayError] = useState('');
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [receiptFor, setReceiptFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const list = useMemo(() => db.invoices.filter((i) => filter === 'all' ? true : i.status === filter).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [db.invoices, filter]);
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  // Derived (no effect): reset to page 1 when filters change the list or data shrinks below the page start.
  const safePage = (page - 1) * PAGE_SIZE >= list.length ? 1 : page;
  const paged = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const due = db.invoices.filter((i) => i.status !== 'paid').reduce((a, b) => a + b.amount, 0);
  const paid = db.invoices.filter((i) => i.status === 'paid').reduce((a, b) => a + b.amount, 0);
  const activeStudents = useMemo(() => db.students.filter((s) => s.status === 'active'), [db.students]);

  const markPaid = (id: string) => update((p) => ({ ...p, invoices: p.invoices.map((x) => x.id === id ? { ...x, status: 'paid', method: 'UPI' } : x) }));
  // Show who actually needs a nudge instead of a dead demo alert.
  const remind = () => { setFilter('overdue'); setPage(1); };

  const openBill = () => {
    setBillTitle(options.feeTitles[0] ?? 'Monthly Tuition');
    setBillStudent('');
    setBillAmount('6500');
    setBillError('');
    setShowBill(true);
  };

  const addBill = () => {
    // Require an explicit student choice — never bill an arbitrary first student.
    const s = db.students.find((x) => x.id === billStudent && x.status === 'active');
    if (!s) {
      setBillError('Pick a student to bill.');
      return;
    }
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const candidate = {
      id: uid('INV'),
      studentId: s.id,
      title: billTitle.trim() || options.feeTitles[0] || 'Monthly Tuition',
      amount: Number(billAmount) || 6500,
      dueDate: dueDate.toISOString().slice(0, 10),
      issuedAt: todayISO(),
      status: 'pending' as const,
    };
    // Zod-guard the shape before it ever touches the store
    const parsed = invoiceSchema.safeParse(candidate);
    if (!parsed.success) {
      setBillError(parsed.error.issues[0]?.message ?? 'That bill looks invalid — check title and amount.');
      return;
    }
    setBillError('');
    update((p) => ({ ...p, invoices: [parsed.data, ...p.invoices] }));
    setShowBill(false);
  };

  const stu = (id: string) => db.students.find((s) => s.id === id);

  const fetchPayments = async (invoiceId: string) => {
    if (!tenantSlug) {
      setPayCache((p) => ({ ...p, [invoiceId]: { data: [], totalPaidCents: 0, balanceCents: 0, loading: false, error: 'No school selected.' } }));
      return;
    }
    if (!UUID_RE.test(invoiceId)) {
      setPayCache((p) => ({ ...p, [invoiceId]: { data: [], totalPaidCents: 0, balanceCents: 0, loading: false, error: 'Bill is still syncing — payments unlock once it has a server id.' } }));
      return;
    }
    setPayCache((p) => ({ ...p, [invoiceId]: { data: p[invoiceId]?.data ?? [], totalPaidCents: 0, balanceCents: 0, loading: true, error: '' } }));
    try {
      const res = await listInvoicePayments(tenantSlug, invoiceId);
      setPayCache((p) => ({ ...p, [invoiceId]: { data: res.data, totalPaidCents: res.totalPaidCents, balanceCents: res.balanceCents, loading: false, error: '' } }));
    } catch (e) {
      setPayCache((p) => ({ ...p, [invoiceId]: { data: [], totalPaidCents: 0, balanceCents: 0, loading: false, error: e instanceof Error ? e.message : 'Could not load payments.' } }));
    }
  };

  const toggleExpand = (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    setPayAmount('');
    setPayRef('');
    setPayDate(todayISO());
    setPayMethod('UPI');
    setPayError('');
    void fetchPayments(id);
  };

  useEffect(() => {
    if (expanded && !payCache[expanded] && tenantSlug) void fetchPayments(expanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, tenantSlug]);

  const submitPayment = async (invoiceId: string, invoiceTotalCents: number) => {
    if (!isAdmin) {
      setPayError('Only Admins can record payments.');
      return;
    }
    if (!UUID_RE.test(invoiceId)) {
      setPayError('Bill is still syncing — wait a moment and try again.');
      return;
    }
    const cache = payCache[invoiceId];
    const balanceCents = cache ? cache.balanceCents : invoiceTotalCents;
    const amt = Number(payAmount);
    if (!payAmount.trim() || !Number.isFinite(amt) || amt <= 0) {
      setPayError('Enter an amount greater than ₹0.');
      return;
    }
    const cents = Math.round(amt * 100);
    if (cents > balanceCents) {
      setPayError(`Amount exceeds the balance of ${rupees(balanceCents)}.`);
      return;
    }
    if (!PAYMENT_METHODS.includes(payMethod)) {
      setPayError('Pick a payment method.');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
      setPayError('Pick a valid received date (YYYY-MM-DD).');
      return;
    }
    if (!tenantSlug) {
      setPayError('No school selected.');
      return;
    }
    setSaving(true);
    setPayError('');
    try {
      await recordPayment(tenantSlug, { invoiceId, amountCents: cents, method: payMethod, reference: payRef, receivedAt: payDate });
      setPayAmount('');
      setPayRef('');
      await fetchPayments(invoiceId);
      // If fully paid, flip the local bill too (syncs via legacy /pay — idempotent).
      const after = await listInvoicePayments(tenantSlug, invoiceId).catch(() => null);
      if (after && after.balanceCents <= 0) {
        update((p) => ({ ...p, invoices: p.invoices.map((x) => x.id === invoiceId ? { ...x, status: 'paid' as const, method: payMethod } : x) }));
      }
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  };

  const voidOne = async (paymentId: string, invoiceId: string) => {
    if (!isAdmin) {
      setPayError('Only Admins can void payments.');
      return;
    }
    if (!tenantSlug) {
      setPayError('No school selected.');
      return;
    }
    setVoiding(paymentId);
    setPayError('');
    try {
      await voidPayment(tenantSlug, paymentId);
      await fetchPayments(invoiceId);
      const after = await listInvoicePayments(tenantSlug, invoiceId).catch(() => null);
      if (after && after.balanceCents > 0) {
        update((p) => ({ ...p, invoices: p.invoices.map((x) => (x.id === invoiceId && x.status === 'paid' ? { ...x, status: 'pending' as const } : x)) }));
      }
    } catch (e) {
      setPayError(e instanceof Error ? e.message : 'Could not void payment.');
    } finally {
      setVoiding(null);
    }
  };

  const receiptInv = receiptFor ? db.invoices.find((i) => i.id === receiptFor) : undefined;
  const receiptCache = receiptFor ? payCache[receiptFor] : undefined;
  const receiptStudent = receiptInv ? stu(receiptInv.studentId) : undefined;

  return (
    <div>
      <PageHeader title="Fees & Billing 💰" sub="Invoices, dues, collections — partial payments, voids & receipts" right={<><Btn variant="soft" onClick={remind} title="Show overdue bills that need a reminder">Send reminders</Btn><Btn variant="dark" onClick={openBill} disabled={!isAdmin} title={isAdmin ? undefined : 'Admin only'}><Plus size={16} /> New bill</Btn></>} />
      <div className="grid sm:grid-cols-3 gap-4 mb-4">
        {[{ l: 'To collect', v: `₹${due.toLocaleString('en-IN')}`, c: '#FFF4CC' }, { l: 'Collected', v: `₹${paid.toLocaleString('en-IN')}`, c: '#DFF7E5' }, { l: 'Overdue bills', v: db.invoices.filter((i) => i.status === 'overdue').length, c: '#FFE4E6' }].map((k, i) => (
          <Card key={k.l} delay={i * 0.05} className="p-5"><p className="inline-block rounded-2xl px-4 py-2 text-[22px] font-black" style={{ background: k.c }}>{k.v}</p><p className="mt-2 text-[12px] font-black uppercase tracking-wider text-[#8A84A0]">{k.l}</p></Card>
        ))}
      </div>
      <div className="flex gap-2 mb-4">
        {['all', 'pending', 'overdue', 'paid'].map((f) => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }} className={`rounded-full px-4 py-2 text-[12px] font-black capitalize cursor-pointer ${filter === f ? 'bg-[#1E1B2E] text-white' : 'bg-white border border-[#F1E6D8]'}`}>{f}</button>
        ))}
      </div>
      <Modal open={showBill} onClose={() => setShowBill(false)} label="New bill">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <h3 className="text-[18px] font-black">New bill 💰</h3>
          <div className="mt-4 space-y-3">
            <Field label="Student">
              <select className={inputCls} value={billStudent} onChange={(e) => { setBillStudent(e.target.value); setBillError(''); }}>
                <option value="">Select student…</option>
                {activeStudents.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Title">
              <select className={inputCls} value={options.feeTitles.includes(billTitle) ? billTitle : '__custom'} onChange={(e) => setBillTitle(e.target.value === '__custom' ? '' : e.target.value)}>
                {options.feeTitles.map((t) => <option key={t} value={t}>{t}</option>)}
                <option value="__custom">Custom…</option>
              </select>
              {!options.feeTitles.includes(billTitle) && (
                <input className={`${inputCls} mt-2`} value={billTitle} onChange={(e) => setBillTitle(e.target.value)} placeholder="Type custom title…" />
              )}
              <p className="mt-1 text-[11px] font-semibold text-[#9A93B0]">Manage titles in <Link href="/options" className="font-black text-[#7C9DFF] hover:underline">Options & Masters</Link></p>
            </Field>
            <Field label="Amount (₹)"><input type="number" min={1} className={inputCls} value={billAmount} onChange={(e) => setBillAmount(e.target.value)} /></Field>
            {billError && <p role="alert" className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{billError}</p>}
            <Btn className="w-full" onClick={addBill} disabled={!billStudent} title={!billStudent ? 'Select a student first' : undefined}>Raise bill ✨</Btn>
          </div>
        </div>
      </Modal>
      {list.length === 0 && <Card><Empty title="All clear! 🎉" sub="No bills match this filter. New charges appear here the moment you raise them." /></Card>}
      <div className="space-y-3">
        {paged.map((inv, i) => {
          const s = stu(inv.studentId);
          const cache = payCache[inv.id];
          const isOpen = expanded === inv.id;
          const totalCents = Math.round(inv.amount * 100);
          const paidCents = cache ? cache.totalPaidCents : null;
          const balCents = cache ? cache.balanceCents : null;
          const isPartial = paidCents !== null && paidCents > 0 && (balCents ?? 0) > 0;
          const pillLabel = isPartial ? 'partial' : inv.status;
          return (
            <motion.div key={inv.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="p-4 flex flex-wrap items-center gap-3">
                {s && <Avatar emoji={s.emoji} color={s.color} />}
                <div className="min-w-0 flex-1 basis-40">
                  <p className="font-extrabold text-[14px]">{inv.title}</p>
                  <p className="text-[12px] font-semibold text-[#8A84A0]">{s?.name ?? '—'} · {getInvoiceNumber(inv.id) ?? inv.id} · due {inv.dueDate}</p>
                  {isPartial && (
                    <p className="mt-1 text-[12px] font-bold text-[#8A6D00]">Paid {rupees(paidCents ?? 0)} · Balance {rupees(balCents ?? 0)}</p>
                  )}
                </div>
                <p className="text-[18px] font-black">₹{inv.amount.toLocaleString('en-IN')}</p>
                <Pill color={inv.status === 'paid' && !isPartial ? '#DFF7E5' : inv.status === 'overdue' ? '#FFE4E6' : '#FFF4CC'} text={inv.status === 'paid' && !isPartial ? '#16A34A' : inv.status === 'overdue' ? '#E11D48' : '#8A6D00'}>
                  {pillLabel === 'paid' && <BadgeCheck size={12} />}{pillLabel}
                </Pill>
                <Btn variant="soft" onClick={() => toggleExpand(inv.id)}>{isOpen ? 'Hide payments' : 'Payments'}</Btn>
                <button onClick={() => openEdit(inv)} disabled={!isAdmin} title={isAdmin ? `Edit ${inv.title}` : 'Admin only'} aria-label={`Edit bill ${inv.id}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF] disabled:opacity-40 disabled:cursor-not-allowed"><Pencil size={15} /></button>
                {inv.status !== 'paid' && <Btn variant="dark" onClick={() => markPaid(inv.id)} disabled={!isAdmin} title={isAdmin ? undefined : 'Admin only'}>Mark paid</Btn>}
                {inv.status === 'paid' && <button onClick={() => setConfirm({ title: `Delete ${inv.title}?`, message: `“${inv.title}” for ${s?.name ?? 'student'} will be removed. This cannot be undone.`, confirmLabel: 'Delete', onConfirm: () => update((p) => ({ ...p, invoices: p.invoices.filter((x) => x.id !== inv.id) })) })} disabled={!isAdmin} title={isAdmin ? `Delete bill ${inv.id}` : 'Admin only'} aria-label={`Delete bill ${inv.id}`} className="text-[12px] font-bold text-[#9A93B0] hover:text-red-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">delete</button>}
              </Card>
              {isOpen && (
                <Card className="mt-2 p-4">
                  {cache?.loading && <p className="text-[13px] font-semibold text-[#8A84A0]">Loading payments…</p>}
                  {cache?.error && <p role="alert" className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{cache.error}</p>}
                  {cache && !cache.loading && !cache.error && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-4 text-[13px] font-bold">
                        <span>Total: ₹{inv.amount.toLocaleString('en-IN')}</span>
                        <span className="text-[#16A34A]">Paid: {rupees(cache.totalPaidCents)}</span>
                        <span className="text-[#B45309]">Balance: {rupees(cache.balanceCents)}</span>
                      </div>
                      {cache.data.length === 0 && <p className="text-[13px] font-semibold text-[#8A84A0]">No payments recorded yet.</p>}
                      {cache.data.map((p) => (
                        <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#F1E6D8] px-3 py-2 text-[13px]">
                          <span className="font-black">{rupees(p.amountCents)}</span>
                          <Pill color="#EEF2FF" text="#3730A3">{p.method}</Pill>
                          <span className="font-semibold text-[#8A84A0]">{p.receivedAt}{p.reference ? ` · ${p.reference}` : ''}</span>
                          {p.voidedAt && <Pill color="#FFE4E6" text="#E11D48">voided</Pill>}
                          {!p.voidedAt && (
                            <button onClick={() => setConfirm({ title: `Void payment ${rupees(p.amountCents)}?`, message: `Voiding ${rupees(p.amountCents)} for “${inv.title}” restores the balance. This cannot be undone.`, confirmLabel: 'Void payment', onConfirm: () => voidOne(p.id, inv.id) })} disabled={!isAdmin || voiding === p.id} title={isAdmin ? 'Void this payment' : 'Admin only'} className="ml-auto text-[12px] font-bold text-[#9A93B0] hover:text-red-500 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                              {voiding === p.id ? 'Voiding…' : 'Void'}
                            </button>
                          )}
                        </div>
                      ))}
                      <div className="grid sm:grid-cols-2 gap-2 pt-2">
                        <Field label="Amount (₹)">
                          <input type="number" min={1} className={inputCls} value={payAmount} onChange={(e) => { setPayAmount(e.target.value); setPayError(''); }} placeholder="e.g. 1500" disabled={!isAdmin} />
                        </Field>
                        <Field label="Method">
                          <select className={inputCls} value={payMethod} onChange={(e) => { setPayMethod(e.target.value as PaymentMethod); setPayError(''); }} disabled={!isAdmin}>
                            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </Field>
                        <Field label="Reference (txn id, optional)">
                          <input className={inputCls} value={payRef} onChange={(e) => { setPayRef(e.target.value); setPayError(''); }} placeholder="UPI txn / receipt no." disabled={!isAdmin} />
                        </Field>
                        <Field label="Received date">
                          <input type="date" className={inputCls} value={payDate} onChange={(e) => { setPayDate(e.target.value); setPayError(''); }} disabled={!isAdmin} />
                        </Field>
                      </div>
                      {payError && <p role="alert" className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{payError}</p>}
                      <div className="flex flex-wrap gap-2">
                        <Btn variant="dark" onClick={() => submitPayment(inv.id, totalCents)} disabled={!isAdmin || saving} title={isAdmin ? undefined : 'Admin only'}>{saving ? 'Saving…' : 'Record payment ✨'}</Btn>
                        <Btn variant="soft" onClick={() => setReceiptFor(inv.id)}><ReceiptText size={15} /> Receipt</Btn>
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </motion.div>
          );
        })}
      </div>
      <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
      <Modal open={showEdit} onClose={() => { setShowEdit(false); resetEdit(); }} label="Edit bill">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">Edit bill ✏️</h3><button onClick={() => { setShowEdit(false); resetEdit(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Title"><input data-autofocus className={inputCls} style={errStyle(editErrors.title)} value={editTitle} onChange={(e) => { setEditTitle(e.target.value); setEditErrors((p) => ({ ...p, title: undefined })); setEditError(''); }} placeholder="e.g. Monthly Tuition" /><Err msg={editErrors.title} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount (₹)"><input type="number" min={1} className={inputCls} style={errStyle(editErrors.amount)} value={editAmount} onChange={(e) => { setEditAmount(e.target.value); setEditErrors((p) => ({ ...p, amount: undefined })); setEditError(''); }} /><Err msg={editErrors.amount} /></Field>
              <Field label="Due date"><input type="date" className={inputCls} style={errStyle(editErrors.dueDate)} value={editDueDate} onChange={(e) => { setEditDueDate(e.target.value); setEditErrors((p) => ({ ...p, dueDate: undefined })); setEditError(''); }} /><Err msg={editErrors.dueDate} /></Field>
            </div>
            {editId && (payCache[editId]?.totalPaidCents ?? 0) > 0 && (
              <p className="text-[12px] font-bold text-[#8A6D00]">Already paid {rupees(payCache[editId]?.totalPaidCents ?? 0)} — amount cannot go below this.</p>
            )}
            {editError && <p role="alert" className="rounded-2xl bg-[#FFE4E6] px-4 py-3 text-[13px] font-bold text-[#B91C1C]">{editError}</p>}
            <Btn className="w-full" onClick={saveEdit}>Save changes ✓</Btn>
          </div>
        </div>
      </Modal>
      <Modal open={!!receiptFor} onClose={() => setReceiptFor(null)} label="Payment receipt">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[18px] font-black">{db.profile.name || 'School'} 🧾</h3>
              <p className="text-[12px] font-semibold text-[#8A84A0]">Fee receipt · {receiptInv ? (getInvoiceNumber(receiptInv.id) ?? receiptInv.id) : ''}</p>
            </div>
            <button onClick={() => setReceiptFor(null)} aria-label="Close receipt" className="cursor-pointer rounded-full p-1 text-[#9A93B0] hover:bg-black/5"><X size={18} /></button>
          </div>
          {receiptInv && (
            <div className="mt-4 space-y-2 text-[13px]">
              <p><span className="font-bold text-[#8A84A0]">Student:</span> <span className="font-extrabold">{receiptStudent?.name ?? '—'}</span></p>
              <p><span className="font-bold text-[#8A84A0]">Bill:</span> <span className="font-extrabold">{receiptInv.title} · ₹{receiptInv.amount.toLocaleString('en-IN')}</span> <span className="font-semibold text-[#8A84A0]">due {receiptInv.dueDate}</span></p>
              <div className="mt-2 rounded-2xl border border-[#F1E6D8] p-3">
                {(receiptCache?.data ?? []).filter((p) => !p.voidedAt).map((p) => (
                  <div key={p.id} className="flex justify-between py-1 font-semibold">
                    <span>{p.receivedAt} · {p.method}{p.reference ? ` · ${p.reference}` : ''}</span>
                    <span className="font-black">{rupees(p.amountCents)}</span>
                  </div>
                ))}
                {(receiptCache?.data ?? []).filter((p) => !p.voidedAt).length === 0 && (
                  <p className="font-semibold text-[#8A84A0]">No payments recorded yet.</p>
                )}
                <div className="mt-2 border-t border-dashed border-[#EDE2D3] pt-2">
                  <div className="flex justify-between font-bold"><span>Paid</span><span>{rupees(receiptCache?.totalPaidCents ?? 0)}</span></div>
                  <div className="flex justify-between font-black"><span>Balance</span><span>{rupees(receiptCache?.balanceCents ?? Math.round(receiptInv.amount * 100))}</span></div>
                </div>
              </div>
              <Btn className="w-full" onClick={() => window.print()}><Printer size={15} /> Print receipt</Btn>
            </div>
          )}
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
