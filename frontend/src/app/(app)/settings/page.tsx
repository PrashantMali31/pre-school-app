'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Database, Download, LogOut, RefreshCcw, Upload } from 'lucide-react';
import { useDB } from '@/lib/store';
import { Btn, Card, ConfirmDialog, Err, Field, PageHeader, errStyle, inputCls, type PendingConfirm } from '@/components/ui';
import { FieldErrors, profileSchema, validateFields } from '@/lib/schemas';
import { api, setToken } from '@/lib/api';
import { downloadBackup, fetchBackup } from '@/lib/audit';

export default function SettingsPage() {
  const { db, update, reset, exportJSON, importJSON, tenantSlug } = useDB();
  const router = useRouter();
  const [form, setForm] = useState(db.profile);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [msg, setMsg] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [backupMsg, setBackupMsg] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [logoutAllMsg, setLogoutAllMsg] = useState('');
  const [logoutBusy, setLogoutBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  // Tracks whether the user has typed anything — server values only flow
  // into the form before the first edit, so saving never overwrites the
  // server with the blank initial state.
  const [dirty, setDirty] = useState(false);

  // Sync local state when the profile loads from the server (initial fetch
  // returns an empty profile first, then the real one arrives).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional server -> form sync before first edit
    if (!dirty) setForm(db.profile);
  }, [db.profile, dirty]);

  const upd = (k: keyof typeof form, v: string) => {
    setDirty(true);
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const save = () => {
    const { errors: errs, value } = validateFields(profileSchema, form);
    if (!value) {
      setErrors(errs);
      return;
    }
    update((p) => ({ ...p, profile: value }));
    setDirty(false);
    setMsg('Saved ✓ — synced to backend');
    setTimeout(() => setMsg(''), 2500);
  };

  const onImportFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importJSON(String(reader.result ?? ''));
      setImportMsg(
        ok ? 'Import sent ✓ — reloading from server…' : 'Import failed — is that a valid school backup JSON?'
      );
      setTimeout(() => setImportMsg(''), 4000);
    };
    reader.readAsText(f);
  };

  const raw = (() => { try { return ((JSON.stringify(db).length / 1024).toFixed(1) + ' KB'); } catch { return '—'; } })();

  // Server-side backup: full tenant dump (GET /audit/export, Admin only) saved as a file.
  const exportServer = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    setBackupMsg('');
    try {
      const data = await fetchBackup(tenantSlug);
      downloadBackup(tenantSlug, data);
      setBackupMsg('Server backup downloaded ✓');
      setTimeout(() => setBackupMsg(''), 4000);
    } catch (e) {
      setBackupMsg(e instanceof Error ? e.message : 'Server backup failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const doLogoutAll = async () => {
    setLogoutBusy(true);
    setLogoutAllMsg('');
    try {
      await api<{ ok: boolean }>('/auth/logout-all', { method: 'POST' });
      setToken(null);
      router.push('/login');
    } catch (e) {
      setLogoutAllMsg(e instanceof Error ? e.message : 'Could not log out all devices.');
    } finally {
      setLogoutBusy(false);
    }
  };

  const askLogoutAll = () => {
    setConfirm({
      title: 'Log out all devices?',
      message: 'Log out all devices? You will need to log in again on this device too.',
      confirmLabel: 'Log out',
      onConfirm: () => doLogoutAll(),
    });
  };

  const askReload = () => {
    setConfirm({
      title: 'Reload from server?',
      message: 'Reload from server? Unsaved local edits will be lost.',
      confirmLabel: 'Reload',
      onConfirm: () => reset(),
    });
  };

  return (
    <div>
      <PageHeader title="Settings ⚙️" sub="School profile · live-synced data controls" right={<Link href="/options" className="rounded-2xl bg-[#1E1B2E] px-4 py-2.5 text-[13px] font-black text-white hover:bg-black">🛠️ Options & Masters →</Link>} />
      {msg && <div className="mb-4 rounded-2xl bg-[#DFF7E5] px-4 py-3 text-sm font-bold text-[#15803D]">{msg}</div>}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="font-black text-[16px]">🏫 School profile</h3>
          <div className="mt-4 space-y-3">
            <Field label="School name"><input className={inputCls} style={errStyle(errors.name)} value={form.name} onChange={(e) => upd('name', e.target.value)} /><Err msg={errors.name} /></Field>
            <Field label="Tagline"><input className={inputCls} style={errStyle(errors.tagline)} value={form.tagline} onChange={(e) => upd('tagline', e.target.value)} /><Err msg={errors.tagline} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><input className={inputCls} style={errStyle(errors.phone)} value={form.phone} onChange={(e) => upd('phone', e.target.value)} /><Err msg={errors.phone} /></Field>
              <Field label="Principal"><input className={inputCls} style={errStyle(errors.principal)} value={form.principal} onChange={(e) => upd('principal', e.target.value)} /><Err msg={errors.principal} /></Field>
            </div>
            <Field label="Email"><input className={inputCls} style={errStyle(errors.email)} value={form.email} onChange={(e) => upd('email', e.target.value)} /><Err msg={errors.email} /></Field>
            <Field label="Address"><input className={inputCls} style={errStyle(errors.address)} value={form.address} onChange={(e) => upd('address', e.target.value)} /><Err msg={errors.address} /></Field>
            <Btn className="w-full" onClick={save}>Save</Btn>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <h3 className="font-black flex items-center gap-2"><Database size={17} /> Backend storage</h3>
            <p className="mt-1 text-[13px] font-medium text-[#8A84A0]">Everything syncs to the backend API per edit · {raw} in memory · exports stay valid backups.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Btn variant="soft" onClick={exportJSON}><Download size={15} /> Export JSON</Btn>
              <Btn variant="soft" onClick={() => fileRef.current?.click()}><Upload size={15} /> Import JSON</Btn>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => { onImportFile(e.target.files?.[0]); e.target.value = ''; }}
            />
            {importMsg && <p className="mt-2 text-[12px] font-semibold text-[#9A93B0]">{importMsg}</p>}
            {/* Server backup: authoritative tenant dump straight from the API (Admin only). */}
            <Btn variant="soft" className="w-full mt-2" onClick={exportServer}>
              <Download size={15} /> {backupBusy ? 'Preparing backup…' : 'Export server backup'}
            </Btn>
            {backupMsg && <p className="mt-2 text-[12px] font-semibold text-[#9A93B0]">{backupMsg}</p>}
            <p className="mt-3 rounded-2xl bg-[#FFF7E6] border border-[#FFE1A8] px-3 py-2.5 text-[12px] font-semibold text-[#8A6D00]">
              🔑 Demo-password hygiene: we never display real passwords here. Admins can review who did what in{' '}
              <Link href="/reports/audit" className="font-black underline">Reports → Audit log</Link>.
            </p>
            <Btn variant="ghost" className="w-full mt-2" onClick={askReload}><RefreshCcw size={15} /> Reload from server</Btn>
          </Card>

          <Card className="p-6">
            <h3 className="font-black flex items-center gap-2"><LogOut size={17} /> Sessions</h3>
            <p className="mt-1 text-[13px] font-medium text-[#8A84A0]">Sign out everywhere — revokes all refresh tokens for your account.</p>
            <Btn
              variant="soft"
              className="w-full mt-4 !bg-[#FFE9EF] !text-[#E11D48] !border-[#FFD6E3] hover:!bg-[#FFD6E3]"
              onClick={askLogoutAll}
            >
              <LogOut size={15} /> {logoutBusy ? 'Logging out…' : 'Log out all devices'}
            </Btn>
            {logoutAllMsg && <p className="mt-2 text-[12px] font-bold text-[#E11D48]">{logoutAllMsg}</p>}
          </Card>

          <Card className="p-6 bg-[#1E1B2E] !border-transparent text-white">
            <h3 className="font-black">🚀 Live backend</h3>
            <p className="mt-1 text-[13px] text-white/65 font-medium">Every <code>useDB().update()</code> now diffs and syncs to the REST API — no UI rewrite was needed.</p>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[['Kids', db.students.length], ['Staff', db.teachers.length], ['Bills', db.invoices.length], ['Events', db.events.length]].map(([l, v]) => (
                <div key={l as string} className="rounded-2xl bg-white/10 p-3"><p className="text-[18px] font-black">{v}</p><p className="text-[11px] font-bold text-white/60">{l}</p></div>
              ))}
            </div>
          </Card>
        </div>
      </div>
      <ConfirmDialog pending={confirm} onCancel={() => setConfirm(null)} />
    </div>
  );
}
