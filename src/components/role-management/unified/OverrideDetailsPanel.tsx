import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { overrideIsActive } from '@/lib/current-user-access';

type OverrideSelection = { kind: 'page' | 'action'; id: string; label: string; reason?: string | null; expires_at?: string | null };

function localDateTime(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** One place to inspect, document, expire or remove individual exceptions. */
export function OverrideDetailsPanel({ disabled = false }: { disabled?: boolean }) {
  const { pageOverrides, permOverrides, savingKey, updateOverrideMetadata, removeOverride } = useSelectedUserAccess();
  const [selected, setSelected] = useState<OverrideSelection | null>(null);
  const [reason, setReason] = useState('');
  const [expiry, setExpiry] = useState('');
  const records: OverrideSelection[] = [
    ...pageOverrides.map(row => ({ ...row, kind: 'page' as const, label: row.page_slug })),
    ...permOverrides.map(row => ({ ...row, kind: 'action' as const, label: `${row.action} on ${row.resource}` })),
  ];
  function edit(record: OverrideSelection) {
    setReason(record.reason ?? ''); setExpiry(localDateTime(record.expires_at)); setSelected(record);
  }
  return (
    <section className="rounded-xl border border-border/60 p-4">
      <h3 className="text-sm font-semibold">Individual override details</h3>
      <p className="mt-1 text-xs text-muted-foreground">Add a reason and optional expiry for page, tab and action exceptions. Expired overrides restore the role default.</p>
      {records.length === 0 ? <p className="mt-3 text-xs text-muted-foreground">No individual overrides.</p> : (
        <ul className="mt-3 max-h-64 divide-y overflow-y-auto">
          {records.map(record => (
            <li key={`${record.kind}:${record.id}`} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={record.label}>{record.label}</p>
                <p className="text-xs text-muted-foreground">{overrideIsActive(record) ? record.expires_at ? `Expires ${new Date(record.expires_at).toLocaleString()}` : 'Permanent' : 'Expired'}{record.reason ? ` · ${record.reason}` : ' · No reason recorded'}</p>
              </div>
              <Button size="sm" variant="outline" disabled={disabled || Boolean(savingKey)} onClick={() => edit(record)}>Edit details</Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(selected)} onOpenChange={open => { if (!open && !savingKey) setSelected(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Override details</DialogTitle>
            <DialogDescription>{selected?.label}. Saving a future expiry or clearing an expired date reactivates this exception.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2"><Label htmlFor="override-reason">Reason</Label><Input id="override-reason" value={reason} onChange={event => setReason(event.target.value)} placeholder="Why does this user need an exception?" disabled={Boolean(savingKey)} /></div>
          <div className="space-y-2"><Label htmlFor="override-expiry">Expiry (your local time)</Label><Input id="override-expiry" type="datetime-local" value={expiry} onChange={event => setExpiry(event.target.value)} disabled={Boolean(savingKey)} /><p className="text-xs text-muted-foreground">Leave blank for a permanent override.</p></div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="destructive" disabled={disabled || Boolean(savingKey)} onClick={async () => { if (selected && await removeOverride(selected.kind, selected.id)) setSelected(null); }}>Restore role default</Button>
            <Button disabled={disabled || Boolean(savingKey)} onClick={async () => {
              if (!selected) return;
              const date = expiry ? new Date(expiry) : null;
              const expiresAt = date && Number.isFinite(date.getTime()) ? date.toISOString() : expiry || null;
              if (await updateOverrideMetadata(selected.kind, selected.id, reason, expiresAt)) setSelected(null);
            }}>{savingKey ? 'Saving…' : 'Save details'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
