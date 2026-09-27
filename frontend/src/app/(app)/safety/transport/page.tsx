'use client';
import { useCallback, useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Btn, Card, ConfirmDialog, Err, Field, Modal, PageHeader, errStyle, inputCls, type PendingConfirm } from '@/components/ui';
import {
  createBusRoute, createBusStop, deleteBusRoute, deleteBusStop, listBusRoutes, listBusStops,
  patchBusRoute, patchBusStop,
  type BusRoute, type BusStop,
} from '@/lib/safety';

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export default function TransportPage() {
  const { activeSlug, tenant } = useAuth();
  const slug = activeSlug ?? '';
  const isAdmin = tenant?.role === 'Admin';
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [stops, setStops] = useState<Record<string, BusStop[]>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', vehicleNo: '', driverName: '', driverPhone: '' });
  const [stopForm, setStopForm] = useState<Record<string, { name: string; pickupTime: string; order: string }>>({});
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [showRouteEdit, setShowRouteEdit] = useState(false);
  const [routeEditId, setRouteEditId] = useState<string | null>(null);
  const [routeEditForm, setRouteEditForm] = useState({ name: '', vehicleNo: '', driverName: '', driverPhone: '' });
  const [routeEditErrors, setRouteEditErrors] = useState<Record<string, string | undefined>>({});
  const [showStopEdit, setShowStopEdit] = useState(false);
  const [stopEditId, setStopEditId] = useState<string | null>(null);
  const [stopEditForm, setStopEditForm] = useState({ name: '', pickupTime: '', order: '' });
  const [stopEditErrors, setStopEditErrors] = useState<Record<string, string | undefined>>({});

  const load = useCallback(async () => {
    if (!slug) return;
    setErr(null);
    try {
      const r = await listBusRoutes(slug);
      setRoutes(r);
      const entries = await Promise.all(r.map(async (x) => [x.id, await listBusStops(slug, x.id)] as const));
      setStops(Object.fromEntries(entries));
    } catch (e) { setErr(errMsg(e)); }
  }, [slug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch on mount/slug change
    void load(); }, [load]);

  const addRoute = async () => {
    setBusy(true); setErr(null);
    try {
      await createBusRoute(slug, { name: form.name.trim(), vehicleNo: form.vehicleNo.trim(), driverName: form.driverName.trim(), driverPhone: form.driverPhone.trim() });
      setForm({ name: '', vehicleNo: '', driverName: '', driverPhone: '' });
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const doDeleteRoute = (routeId: string) => {
    void deleteBusRoute(slug, routeId).then(load).catch((e: unknown) => setErr(errMsg(e)));
  };

  const askDeleteRoute = (route: BusRoute) => {
    setConfirm({
      title: `Delete ${route.name}?`,
      message: `Delete bus route "${route.name}"? All its stops will be removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => doDeleteRoute(route.id),
    });
  };

  const doDeleteStop = (stopId: string) => {
    void deleteBusStop(slug, stopId).then(load).catch((e: unknown) => setErr(errMsg(e)));
  };

  const askDeleteStop = (routeName: string, stop: BusStop) => {
    setConfirm({
      title: `Remove stop ${stop.name}?`,
      message: `Remove stop "${stop.name}" from route "${routeName}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      onConfirm: () => doDeleteStop(stop.id),
    });
  };
  const addStop = async (routeId: string) => {
    const f = stopForm[routeId] ?? { name: '', pickupTime: '08:00', order: '0' };
    setBusy(true); setErr(null);
    try {
      await createBusStop(slug, routeId, { name: f.name.trim(), pickupTime: f.pickupTime, order: Number(f.order) || 0 });
      setStopForm((p) => ({ ...p, [routeId]: { name: '', pickupTime: '08:00', order: '0' } }));
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const updRouteEdit = (k: keyof typeof routeEditForm, v: string) => {
    setRouteEditForm((f) => ({ ...f, [k]: v }));
    setRouteEditErrors((e) => ({ ...e, [k]: undefined }));
  };

  const resetRouteEdit = () => {
    setRouteEditForm({ name: '', vehicleNo: '', driverName: '', driverPhone: '' });
    setRouteEditErrors({});
    setRouteEditId(null);
  };

  const openRouteEdit = (r: BusRoute) => {
    setRouteEditForm({ name: r.name, vehicleNo: r.vehicleNo, driverName: r.driverName, driverPhone: r.driverPhone });
    setRouteEditErrors({});
    setRouteEditId(r.id);
    setShowRouteEdit(true);
  };

  const saveRouteEdit = async () => {
    if (!routeEditId) return;
    const errs: Record<string, string | undefined> = {};
    if (routeEditForm.name.trim().length < 2) errs.name = 'Route name needs at least 2 characters.';
    setRouteEditErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true); setErr(null);
    try {
      await patchBusRoute(slug, routeEditId, {
        name: routeEditForm.name.trim(),
        vehicleNo: routeEditForm.vehicleNo.trim(),
        driverName: routeEditForm.driverName.trim(),
        driverPhone: routeEditForm.driverPhone.trim(),
      });
      setShowRouteEdit(false);
      resetRouteEdit();
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  const updStopEdit = (k: keyof typeof stopEditForm, v: string) => {
    setStopEditForm((f) => ({ ...f, [k]: v }));
    setStopEditErrors((e) => ({ ...e, [k]: undefined }));
  };

  const resetStopEdit = () => {
    setStopEditForm({ name: '', pickupTime: '', order: '' });
    setStopEditErrors({});
    setStopEditId(null);
  };

  const openStopEdit = (s: BusStop) => {
    setStopEditForm({ name: s.name, pickupTime: s.pickupTime, order: String(s.order) });
    setStopEditErrors({});
    setStopEditId(s.id);
    setShowStopEdit(true);
  };

  const saveStopEdit = async () => {
    if (!stopEditId) return;
    const errs: Record<string, string | undefined> = {};
    if (stopEditForm.name.trim().length < 2) errs.name = 'Stop name needs at least 2 characters.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(stopEditForm.pickupTime)) errs.pickupTime = 'Use HH:MM (24h).';
    const order = Number(stopEditForm.order);
    if (!Number.isInteger(order) || order < 0 || order > 999) errs.order = 'Order must be 0–999.';
    setStopEditErrors(errs);
    if (Object.values(errs).some(Boolean)) return;
    setBusy(true); setErr(null);
    try {
      await patchBusStop(slug, stopEditId, { name: stopEditForm.name.trim(), pickupTime: stopEditForm.pickupTime, order });
      setShowStopEdit(false);
      resetStopEdit();
      await load();
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };

  if (!slug) return <PageHeader title="Transport 🚌" sub="Select a school first." />;

  return (
    <div>
      <PageHeader title="Transport 🚌" sub={`${routes.length} routes${isAdmin ? '' : ' · read-only'}`} />
      {err && <p className="mb-3 rounded-xl bg-[#FFE9EF] px-4 py-2 text-[13px] font-bold text-[#E11D48]">{err}</p>}

      {isAdmin && (
        <Card className="p-5">
          <p className="font-black">New route</p>
          <div className="mt-2 grid sm:grid-cols-4 gap-2">
            <input className={inputCls} placeholder="Route name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={inputCls} placeholder="Vehicle no" value={form.vehicleNo} onChange={(e) => setForm({ ...form, vehicleNo: e.target.value })} />
            <input className={inputCls} placeholder="Driver" value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} />
            <input className={inputCls} placeholder="Driver phone" value={form.driverPhone} onChange={(e) => setForm({ ...form, driverPhone: e.target.value })} />
          </div>
          <div className="mt-2"><Btn onClick={addRoute} disabled={busy || form.name.trim().length < 2}>Add route</Btn></div>
        </Card>
      )}

      <div className="mt-4 space-y-3">
        {routes.map((r) => {
          const f = stopForm[r.id] ?? { name: '', pickupTime: '08:00', order: '0' };
          return (
            <Card key={r.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black flex-1 min-w-[140px]">{r.name}</p>
                <p className="text-[12px] font-semibold text-[#8A84A0]">{r.vehicleNo} · {r.driverName} · {r.driverPhone}</p>
                {isAdmin && <button onClick={() => openRouteEdit(r)} aria-label={`Edit ${r.name}`} title={`Edit ${r.name}`} className="grid h-9 w-9 place-items-center rounded-xl bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]"><Pencil size={15} /></button>}
                {isAdmin && <button onClick={() => askDeleteRoute(r)} aria-label={`Delete ${r.name}`} className="rounded-lg bg-[#FFE9EF] px-2.5 py-1.5 text-[11px] font-black text-[#E11D48] cursor-pointer">Delete</button>}
              </div>
              <div className="mt-2">
                {(stops[r.id] ?? []).map((s) => (
                  <div key={s.id} className="mt-1 flex items-center gap-2 text-[13px] font-semibold">
                    <span className="flex-1">#{s.order} {s.name} · {s.pickupTime}</span>
                    {isAdmin && <button onClick={() => openStopEdit(s)} aria-label={`Edit stop ${s.name}`} title={`Edit stop ${s.name}`} className="grid h-7 w-7 place-items-center rounded-lg bg-[#E4EBFF] text-[#1E1B2E] cursor-pointer hover:bg-[#D3E0FF]"><Pencil size={12} /></button>}
                    {isAdmin && <button onClick={() => askDeleteStop(r.name, s)} aria-label={`Delete stop ${s.name}`} className="text-[11px] font-black text-[#E11D48] cursor-pointer">Remove</button>}
                  </div>
                ))}
                {(stops[r.id] ?? []).length === 0 && <p className="text-[12px] font-semibold text-[#B9B2C7]">No stops yet.</p>}
              </div>
              {isAdmin && (
                <div className="mt-2 flex gap-2">
                  <input className={inputCls} placeholder="Stop name" value={f.name} onChange={(e) => setStopForm({ ...stopForm, [r.id]: { ...f, name: e.target.value } })} />
                  <input type="time" className={inputCls} value={f.pickupTime} onChange={(e) => setStopForm({ ...stopForm, [r.id]: { ...f, pickupTime: e.target.value } })} />
                  <input className={inputCls} placeholder="Order" value={f.order} onChange={(e) => setStopForm({ ...stopForm, [r.id]: { ...f, order: e.target.value } })} />
                  <Btn variant="soft" onClick={() => addStop(r.id)} disabled={busy || f.name.trim().length < 2}>Add stop</Btn>
                </div>
              )}
            </Card>
          );
        })}
        {routes.length === 0 && <Card className="p-6 text-center text-[13px] font-semibold text-[#8A84A0]">No bus routes yet.</Card>}
      </div>
      <Modal open={showRouteEdit} onClose={() => { setShowRouteEdit(false); resetRouteEdit(); }} label="Edit bus route">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">Edit route ✏️</h3><button onClick={() => { setShowRouteEdit(false); resetRouteEdit(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Route name"><input data-autofocus className={inputCls} style={errStyle(routeEditErrors.name)} value={routeEditForm.name} onChange={(e) => updRouteEdit('name', e.target.value)} /><Err msg={routeEditErrors.name} /></Field>
            <Field label="Vehicle no"><input className={inputCls} value={routeEditForm.vehicleNo} onChange={(e) => updRouteEdit('vehicleNo', e.target.value)} /></Field>
            <Field label="Driver name"><input className={inputCls} value={routeEditForm.driverName} onChange={(e) => updRouteEdit('driverName', e.target.value)} /></Field>
            <Field label="Driver phone"><input className={inputCls} value={routeEditForm.driverPhone} onChange={(e) => updRouteEdit('driverPhone', e.target.value)} /></Field>
            <Btn className="w-full" onClick={saveRouteEdit} disabled={busy}>Save changes ✓</Btn>
          </div>
        </div>
      </Modal>
      <Modal open={showStopEdit} onClose={() => { setShowStopEdit(false); resetStopEdit(); }} label="Edit bus stop">
        <div className="rounded-[26px] bg-white p-6 shadow-2xl dark:bg-[#161624] dark:border dark:border-white/10">
          <div className="flex items-center justify-between"><h3 className="text-[18px] font-black">Edit stop ✏️</h3><button onClick={() => { setShowStopEdit(false); resetStopEdit(); }} aria-label="Close dialog" className="cursor-pointer"><X size={18} /></button></div>
          <div className="mt-4 space-y-3">
            <Field label="Stop name"><input data-autofocus className={inputCls} style={errStyle(stopEditErrors.name)} value={stopEditForm.name} onChange={(e) => updStopEdit('name', e.target.value)} /><Err msg={stopEditErrors.name} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Pickup time"><input type="time" className={inputCls} style={errStyle(stopEditErrors.pickupTime)} value={stopEditForm.pickupTime} onChange={(e) => updStopEdit('pickupTime', e.target.value)} /><Err msg={stopEditErrors.pickupTime} /></Field>
              <Field label="Order"><input className={inputCls} style={errStyle(stopEditErrors.order)} value={stopEditForm.order} onChange={(e) => updStopEdit('order', e.target.value)} inputMode="numeric" /><Err msg={stopEditErrors.order} /></Field>
            </div>
            <Btn className="w-full" onClick={saveStopEdit} disabled={busy}>Save changes ✓</Btn>
          </div>
        </div>
      </Modal>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
