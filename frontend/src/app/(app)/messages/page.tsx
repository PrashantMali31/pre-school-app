'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Megaphone, Pencil, Pin, Plus, Trash2, Send, RefreshCw, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useDB, uid, todayISO } from '@/lib/store';
import { Btn, Card, ConfirmDialog, Empty, Err, Field, Modal, PageHeader, PendingConfirm, errStyle, inputCls } from '@/components/ui';
import { FieldErrors, announcementFormSchema, validateFields } from '@/lib/schemas';
import { ensureOptions } from '@/lib/options';
import {
  CommsChannel,
  Delivery,
  DeliveryCounts,
  FeeDryRun,
  MessageTemplate,
  feeReminderDryRun,
  listDeliveries,
  listReminders,
  listTemplates,
  postAnnounce,
  rupees,
  sendFeeReminders,
} from '@/lib/comms';
import { Announcement } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface DeliveryView {
  loading: boolean;
  counts: DeliveryCounts | null;
  rows: Delivery[];
  error: string | null;
}

function countRows(rows: Delivery[]): DeliveryCounts {
  return {
    total: rows.length,
    sent: rows.filter((r) => r.status === 'sent').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    queued: rows.filter((r) => r.status === 'queued').length,
  };
}

export default function MessagesPage() {
  const { db, update, tenantSlug } = useDB();
  const options = ensureOptions((db as { options?: unknown }).options);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState(options.audiences[0] ?? 'All Parents');
  const [channel, setChannel] = useState<CommsChannel>('inapp');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [backendError, setBackendError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lastBroadcast, setLastBroadcast] = useState<{ id: string; deliveries: DeliveryCounts } | null>(null);

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [templateKey, setTemplateKey] = useState('');

  const [deliveryViews, setDeliveryViews] = useState<Record<string, DeliveryView>>({});
  const [openDelivery, setOpenDelivery] = useState<Record<string, boolean>>({});

  const [feePreview, setFeePreview] = useState<FeeDryRun | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeSending, setFeeSending] = useState(false);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [feeResult, setFeeResult] = useState<string | null>(null);
  const [reminderHistory, setReminderHistory] = useState<{ id: string; kind: string; targetCount: number; sentCount: number; failedCount: number }[]>([]);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  // --- edit announcement (title/body/audience) ---
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editAudience, setEditAudience] = useState(options.audiences[0] ?? 'All Parents');
  const [editErrors, setEditErrors] = useState<FieldErrors>({});

  const openEdit = (a: Announcement) => {
    setEditTitle(a.title);
    setEditBody(a.body);
    setEditAudience(a.audience);
    setEditErrors({});
    setEditId(a.id);
    setShowEdit(true);
  };

  const resetEdit = () => {
    setEditTitle('');
    setEditBody('');
    setEditAudience(options.audiences[0] ?? 'All Parents');
    setEditErrors({});
    setEditId(null);
  };

  const saveEdit = () => {
    const { errors: errs, value } = validateFields(announcementFormSchema, { title: editTitle, body: editBody, audience: editAudience });
    if (!value) {
      setEditErrors(errs);
      return;
    }
    if (!editId) return;
    const id = editId;
    update((p) => ({
      ...p,
      announcements: p.announcements.map((x) => x.id === id
        ? { ...x, title: value.title, body: value.body, audience: value.audience }
        : x),
    }));
    setShowEdit(false);
    resetEdit();
  };

  useEffect(() => {
    if (!tenantSlug) return;
    let live = true;
    listTemplates(tenantSlug)
      .then((t) => {
        if (live) {
          setTemplates(t);
          setTemplatesError(null);
        }
      })
      .catch((e) => {
        if (live) setTemplatesError(e instanceof Error ? e.message : 'Could not load templates.');
      });
    listReminders(tenantSlug)
      .then((r) => {
        if (live) setReminderHistory(r.data ?? []);
      })
      .catch(() => {
        if (live) setReminderHistory([]);
      });
    return () => {
      live = false;
    };
  }, [tenantSlug]);

  const applyTemplate = (key: string) => {
    setTemplateKey(key);
    const t = templates.find((x) => x.key === key);
    if (!t) return;
    setTitle(t.title);
    setBody(t.body);
    setErrors({});
  };

  const send = async () => {
    const { errors: errs, value } = validateFields(announcementFormSchema, { title, body, audience });
    if (!value) {
      setErrors(errs);
      return;
    }
    // Keep the existing local list behaviour.
    update((p) => ({ ...p, announcements: [{ id: uid('a'), title: value.title, body: value.body, audience: value.audience, createdAt: todayISO(), pinned: false }, ...p.announcements] }));
    setTitle(''); setBody(''); setErrors({}); setTemplateKey('');
    setBackendError(null);
    setLastBroadcast(null);
    // Fan-out through the backend delivery log when a school is selected.
    if (tenantSlug) {
      setSending(true);
      try {
        const res = await postAnnounce(tenantSlug, { title: value.title, body: value.body, audience: value.audience, channel });
        setLastBroadcast({ id: res.data.id, deliveries: res.deliveries });
      } catch (e) {
        setBackendError(e instanceof Error ? e.message : 'Broadcast saved locally but delivery failed.');
      } finally {
        setSending(false);
      }
    }
  };

  const toggleDelivery = async (announcementId: string) => {
    const open = !openDelivery[announcementId];
    setOpenDelivery((p) => ({ ...p, [announcementId]: open }));
    if (!open || !tenantSlug || deliveryViews[announcementId]?.counts) return;
    setDeliveryViews((p) => ({ ...p, [announcementId]: { loading: true, counts: null, rows: [], error: null } }));
    try {
      const res = await listDeliveries(tenantSlug, { announcementId });
      setDeliveryViews((p) => ({ ...p, [announcementId]: { loading: false, counts: countRows(res.data), rows: res.data, error: null } }));
    } catch (e) {
      setDeliveryViews((p) => ({ ...p, [announcementId]: { loading: false, counts: null, rows: [], error: e instanceof Error ? e.message : 'Could not load deliveries.' } }));
    }
  };

  const checkDues = async () => {
    if (!tenantSlug) {
      setFeeError('Select a school first.');
      return;
    }
    setFeeLoading(true);
    setFeeError(null);
    setFeeResult(null);
    try {
      const preview = await feeReminderDryRun(tenantSlug);
      setFeePreview(preview);
    } catch (e) {
      setFeeError(e instanceof Error ? e.message : 'Dry-run failed.');
    } finally {
      setFeeLoading(false);
    }
  };

  const confirmSendFees = async () => {
    if (!tenantSlug) return;
    setFeeSending(true);
    setFeeError(null);
    setFeeResult(null);
    try {
      const res = await sendFeeReminders(tenantSlug);
      setFeeResult(`Sent ${res.deliveries.sent} of ${res.deliveries.total} reminders (${rupees(res.totalAmountCents)} due).${res.deliveries.failed > 0 ? ` ${res.deliveries.failed} failed — see delivery log.` : ''}`);
      setFeePreview(null);
      const history = await listReminders(tenantSlug).catch(() => null);
      if (history) setReminderHistory(history.data ?? []);
    } catch (e) {
      setFeeError(e instanceof Error ? e.message : 'Sending reminders failed.');
    } finally {
      setFeeSending(false);
    }
  };

  return (
    <div>
      <PageHeader title="Announcements 📣" sub="Broadcast to parents · stored locally, push later via backend" />
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="p-6 lg:col-span-2 h-fit">
          <h3 className="font-black flex items-center gap-2"><Megaphone size={17} /> New broadcast</h3>
          <div className="mt-4 space-y-3">
            <Field label="Template">
              <select className={inputCls} value={templateKey} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">No template — write freely</option>
                {templates.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
              </select>
              {templatesError && <p className="mt-1 text-[11px] font-semibold text-[#E11D48]">Templates unavailable: {templatesError}</p>}
            </Field>
            <Field label="Title"><input className={inputCls} style={errStyle(errors.title)} value={title} onChange={(e) => { setTitle(e.target.value); setErrors((p) => ({ ...p, title: undefined })); }} placeholder="e.g. Sports day on Friday" /><Err msg={errors.title} /></Field>
            <Field label="Audience"><select className={inputCls} value={audience} onChange={(e) => setAudience(e.target.value)}>{options.audiences.map((a) => <option key={a} value={a}>{a}</option>)}</select><p className="mt-1 text-[11px] font-semibold text-[#9A93B0]">Manage in <Link href="/options" className="font-black text-[#7C9DFF] hover:underline">Options & Masters</Link></p></Field>
            <Field label="Channel">
              <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as CommsChannel)}>
                <option value="inapp">In-app</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </Field>
            <Field label="Message"><textarea rows={4} className={inputCls} style={errStyle(errors.body)} value={body} onChange={(e) => { setBody(e.target.value); setErrors((p) => ({ ...p, body: undefined })); }} placeholder="Write a warm, clear message… Use {{placeholders}} from a template." /><Err msg={errors.body} /></Field>
            <Btn className="w-full" variant="dark" onClick={send} disabled={sending}><Plus size={16} /> {sending ? 'Broadcasting…' : 'Broadcast now'}</Btn>
            {backendError && <p role="alert" className="text-[12px] font-bold text-[#E11D48]">Delivery error: {backendError}</p>}
            {lastBroadcast && (
              <p className="text-[12px] font-bold text-[#2F9E44]">
                Delivered to {lastBroadcast.deliveries.sent}/{lastBroadcast.deliveries.total} recipients
                {lastBroadcast.deliveries.failed > 0 ? ` (${lastBroadcast.deliveries.failed} failed)` : ''}.
              </p>
            )}
          </div>
          <div className="mt-6 border-t pt-4" style={{ borderColor: '#F1EADF' }}>
            <h3 className="font-black flex items-center gap-2"><Send size={15} /> Fee reminders</h3>
            <p className="mt-1 text-[12px] font-medium text-[#8A84A0]">Preview overdue dues, then confirm to send SMS reminders.</p>
            <div className="mt-3 flex gap-2">
              <Btn variant="soft" onClick={checkDues} disabled={feeLoading}><RefreshCw size={14} /> {feeLoading ? 'Checking…' : 'Dry-run preview'}</Btn>
            </div>
            {feeError && <p role="alert" className="mt-2 text-[12px] font-bold text-[#E11D48]">{feeError}</p>}
            {feeResult && <p role="status" className="mt-2 text-[12px] font-bold text-[#2F9E44]">{feeResult}</p>}
            {feePreview && (
              <div className="mt-3 rounded-xl bg-[#F8F5EF] p-3">
                <p className="text-[13px] font-black">{feePreview.targetCount} parent{feePreview.targetCount === 1 ? '' : 's'} · {rupees(feePreview.totalAmountCents)} due</p>
                <ul className="mt-2 space-y-1 text-[12px] font-medium text-[#3E3A55]">
                  {feePreview.parents.map((p) => (
                    <li key={p.phone}>{p.parent} ({p.studentNames.join(', ') || '—'}) · {p.phone} · {rupees(p.totalAmountCents)}</li>
                  ))}
                </ul>
                <Btn className="mt-3 w-full" variant="dark" onClick={confirmSendFees} disabled={feeSending || feePreview.targetCount === 0}>
                  <Send size={14} /> {feeSending ? 'Sending…' : `Confirm send to ${feePreview.targetCount} parent${feePreview.targetCount === 1 ? '' : 's'}`}
                </Btn>
              </div>
            )}
            {reminderHistory.length > 0 && (
              <div className="mt-3 text-[12px] font-medium text-[#8A84A0]">
                <p className="font-black text-[#3E3A55]">Recent reminder runs</p>
                <ul className="mt-1 space-y-1">
                  {reminderHistory.slice(0, 5).map((r) => (
                    <li key={r.id}>{r.kind} · target {r.targetCount} · sent {r.sentCount} · failed {r.failedCount}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
        <div className="lg:col-span-3 space-y-3">
          {db.announcements.length === 0 && <Card><Empty title="Quiet halls…" sub="No announcements yet. Broadcast your first update and every parent sees it here." /></Card>}
          {db.announcements.map((a, i) => {
            const isServerRow = UUID_RE.test(a.id);
            const view = deliveryViews[a.id];
            const open = !!openDelivery[a.id];
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFF1E6] text-xl">📝</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-black">{a.pinned ? '📌 ' : ''}{a.title}</p>
                      <p className="text-[12px] font-bold text-[#8A84A0]">{a.audience} · {a.createdAt}</p>
                      <p className="mt-2 text-[14px] font-medium text-[#3E3A55]">{a.body}</p>
                      <div className="mt-2">
                        {isServerRow && tenantSlug ? (
                          <button
                            onClick={() => void toggleDelivery(a.id)}
                            className="flex items-center gap-1 text-[12px] font-black text-[#7C9DFF] hover:underline cursor-pointer"
                          >
                            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            {open ? 'Hide delivery status' : 'View delivery status'}
                          </button>
                        ) : (
                          <p className="text-[11px] font-semibold text-[#9A93B0]">Delivery status appears once synced to the server.</p>
                        )}
                        {open && (
                          <div className="mt-2 rounded-xl bg-[#F8F5EF] p-3 text-[12px] font-medium">
                            {view?.loading && <p>Loading deliveries…</p>}
                            {view?.error && <p role="alert" className="font-bold text-[#E11D48]">Could not load deliveries: {view.error}</p>}
                            {view?.counts && (
                              <p className="font-black">✅ {view.counts.sent} sent · ❌ {view.counts.failed} failed · ⏳ {view.counts.queued} queued ({view.counts.total} total)</p>
                            )}
                            {view?.rows?.filter((r) => r.status === 'failed').map((r) => (
                              <p key={r.id} className="mt-1 text-[#E11D48]">Failed → {r.recipient}: {r.error ?? 'unknown error'}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => update((p) => ({ ...p, announcements: p.announcements.map((x) => x.id === a.id ? { ...x, pinned: !x.pinned } : x) }))} aria-label={a.pinned ? `Unpin ${a.title}` : `Pin ${a.title}`} aria-pressed={a.pinned} className={`grid h-9 w-9 place-items-center rounded-xl cursor-pointer ${a.pinned ? 'bg-[#1E1B2E] text-white' : 'bg-[#F6F0E6]'}`}><Pin size={15} /></button>
                      <button onClick={() => openEdit(a)} aria-label={`Edit ${a.title}`} title={`Edit ${a.title}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]"><Pencil size={15} /></button>
                      <button onClick={() => setConfirm({ title: `Delete ${a.title}?`, message: `“${a.title}” will be removed. This cannot be undone.`, confirmLabel: 'Delete', onConfirm: () => update((p) => ({ ...p, announcements: p.announcements.filter((x) => x.id !== a.id) })) })} aria-label={`Delete ${a.title}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFE9EF] text-[#E11D48] cursor-pointer"><Trash2 size={15} /></button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
      <Modal open={showEdit} onClose={() => { setShowEdit(false); resetEdit(); }} label="Edit announcement">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">Edit announcement ✏️</h3><button onClick={() => { setShowEdit(false); resetEdit(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Title"><input data-autofocus className={inputCls} style={errStyle(editErrors.title)} value={editTitle} onChange={(e) => { setEditTitle(e.target.value); setEditErrors((p) => ({ ...p, title: undefined })); }} placeholder="e.g. Sports day on Friday" /><Err msg={editErrors.title} /></Field>
            <Field label="Audience"><select className={inputCls} value={editAudience} onChange={(e) => setEditAudience(e.target.value)}>{options.audiences.map((au) => <option key={au} value={au}>{au}</option>)}</select></Field>
            <Field label="Message"><textarea rows={4} className={inputCls} style={errStyle(editErrors.body)} value={editBody} onChange={(e) => { setEditBody(e.target.value); setEditErrors((p) => ({ ...p, body: undefined })); }} placeholder="Write a warm, clear message…" /><Err msg={editErrors.body} /></Field>
            <Btn className="w-full" variant="dark" onClick={saveEdit}>Save changes ✓</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
