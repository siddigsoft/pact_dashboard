import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  Archive, RotateCcw, Clock, Cloud, HardDrive, CheckCircle, XCircle,
  AlertTriangle, Download, RefreshCw, Play, Trash2, Calendar,
  FolderArchive, Database, FileJson, FileSpreadsheet, Image,
  ChevronDown, Info, ShieldCheck, Globe, Server
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

type TabId = 'backups' | 'restore' | 'archive';

const EXTERNAL_PROVIDERS = [
  { value: 'google_drive', label: 'Google Drive',  icon: Cloud },
  { value: 'dropbox',      label: 'Dropbox',        icon: Cloud },
  { value: 's3',           label: 'AWS S3',          icon: Server },
  { value: 'azure_blob',   label: 'Azure Blob',      icon: Server },
] as const;

function statusBadge(status: string) {
  if (status === 'success')
    return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs"><CheckCircle className="h-3 w-3 mr-1" />Success</Badge>;
  if (status === 'failed')
    return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
  if (status === 'running')
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Running</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function fmtSize(bytes: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function ago(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: Automatic Backups
// ─────────────────────────────────────────────────────────────────────────────
function BackupsTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedFormId, setSelectedFormId] = useState('');
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [scheduleEnabled, setScheduleEnabled]   = useState(true);
  const [scheduleCron, setScheduleCron]         = useState('0 2 * * *');
  const [externalProvider, setExternalProvider] = useState('');
  const [externalBucket, setExternalBucket]     = useState('');
  const [externalPath, setExternalPath]         = useState('pact-backups/');
  const [retentionDays, setRetentionDays]       = useState('30');

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-backup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_forms').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: backups = [], isLoading } = useQuery<any[]>({
    queryKey: ['fd-backups', selectedFormId],
    enabled: !!selectedFormId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_backups')
        .select('*')
        .eq('form_id', selectedFormId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schedule } = useQuery<any>({
    queryKey: ['fd-backup-schedule', selectedFormId],
    enabled: !!selectedFormId,
    queryFn: async () => {
      const { data } = await supabase
        .from('fd_backup_schedules')
        .select('*')
        .eq('form_id', selectedFormId)
        .maybeSingle();
      return data;
    },
  });

  const triggerBackup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fd_backups').insert({
        form_id: selectedFormId,
        status: 'running',
        backup_type: 'manual',
        triggered_by: user?.id,
        triggered_by_name: user?.user_metadata?.full_name ?? user?.email ?? 'Unknown',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-backups', selectedFormId] });
      toast({ title: 'Backup triggered', description: 'Manual backup started. Check status below.' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const saveSchedule = useMutation({
    mutationFn: async () => {
      const payload = {
        form_id: selectedFormId,
        enabled: scheduleEnabled,
        cron_expression: scheduleCron,
        external_provider: externalProvider || null,
        external_bucket: externalBucket || null,
        external_path: externalPath || null,
        retention_days: parseInt(retentionDays, 10) || 30,
        updated_by: user?.id,
      };
      const { error } = await supabase
        .from('fd_backup_schedules')
        .upsert(payload, { onConflict: 'form_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-backup-schedule', selectedFormId] });
      setShowScheduleDialog(false);
      toast({ title: 'Schedule saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const openScheduleDialog = () => {
    if (schedule) {
      setScheduleEnabled(schedule.enabled ?? true);
      setScheduleCron(schedule.cron_expression ?? '0 2 * * *');
      setExternalProvider(schedule.external_provider ?? '');
      setExternalBucket(schedule.external_bucket ?? '');
      setExternalPath(schedule.external_path ?? 'pact-backups/');
      setRetentionDays(String(schedule.retention_days ?? 30));
    }
    setShowScheduleDialog(true);
  };

  const downloadBackup = async (backup: any) => {
    if (!backup.storage_path) { toast({ title: 'No file stored for this backup' }); return; }
    const { data, error } = await supabase.storage
      .from('field-data-backups')
      .createSignedUrl(backup.storage_path, 300);
    if (error || !data?.signedUrl) {
      toast({ title: 'Download failed', description: error?.message, variant: 'destructive' });
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedFormId} onValueChange={setSelectedFormId}>
          <SelectTrigger className="w-64" data-testid="select-form-backup">
            <SelectValue placeholder="Select form…" />
          </SelectTrigger>
          <SelectContent>
            {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {selectedFormId && (
          <>
            <Button variant="outline" size="sm" onClick={openScheduleDialog} data-testid="btn-schedule-config">
              <Calendar className="h-4 w-4 mr-1" /> Schedule &amp; Storage
            </Button>
            <Button size="sm" disabled={triggerBackup.isPending} onClick={() => triggerBackup.mutate()}
              data-testid="btn-trigger-backup">
              <Play className="h-4 w-4 mr-1" />
              {triggerBackup.isPending ? 'Starting…' : 'Run Now'}
            </Button>
          </>
        )}
      </div>

      {/* Schedule summary card */}
      {selectedFormId && schedule && (
        <div className="rounded-lg border bg-card p-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Schedule:</span>
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{schedule.cron_expression}</code>
            {schedule.enabled
              ? <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge>
              : <Badge variant="outline" className="text-xs">Disabled</Badge>}
          </div>
          {schedule.external_provider && (
            <div className="flex items-center gap-2">
              <Cloud className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{EXTERNAL_PROVIDERS.find(p => p.value === schedule.external_provider)?.label}</span>
              <span className="text-xs text-muted-foreground">{schedule.external_bucket}/{schedule.external_path}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Retain {schedule.retention_days} days</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!selectedFormId && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <HardDrive className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select a form to view backups</p>
        </div>
      )}

      {selectedFormId && isLoading && (
        <div className="flex items-center gap-2 justify-center py-10 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading backup history…
        </div>
      )}

      {selectedFormId && !isLoading && backups.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No backups yet. Run one manually or configure a schedule.
        </div>
      )}

      {/* Backup table */}
      {backups.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-3 text-left">Date</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Submissions</th>
                <th className="p-3 text-left">Size</th>
                <th className="p-3 text-left">Storage</th>
                <th className="p-3 text-left">Triggered By</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.id}
                  className={cn('border-b last:border-0 hover:bg-muted/30', i % 2 === 0 && 'bg-background')}
                  data-testid={`backup-row-${b.id}`}>
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(b.created_at).toLocaleString()}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-xs capitalize">{b.backup_type ?? 'auto'}</Badge>
                  </td>
                  <td className="p-3">{statusBadge(b.status)}</td>
                  <td className="p-3">{b.submission_count ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">{fmtSize(b.file_size_bytes)}</td>
                  <td className="p-3">
                    {b.external_provider
                      ? <span className="flex items-center gap-1 text-xs"><Cloud className="h-3 w-3" />{EXTERNAL_PROVIDERS.find(p => p.value === b.external_provider)?.label}</span>
                      : <span className="flex items-center gap-1 text-xs text-muted-foreground"><Database className="h-3 w-3" />Supabase Storage</span>}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{b.triggered_by_name ?? 'system'}</td>
                  <td className="p-3">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      disabled={b.status !== 'success' || !b.storage_path}
                      onClick={() => downloadBackup(b)}
                      title="Download backup"
                      data-testid={`download-backup-${b.id}`}>
                      <Download className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Backup Schedule &amp; Storage
            </DialogTitle>
            <DialogDescription>
              Configure automatic daily backups and optional external storage sync.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Enable automatic backups</Label>
              <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled}
                data-testid="toggle-schedule-enabled" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Cron expression</Label>
              <Input value={scheduleCron} onChange={e => setScheduleCron(e.target.value)}
                placeholder="0 2 * * *" data-testid="input-cron" />
              <p className="text-xs text-muted-foreground">
                Default: daily at 02:00 UTC. Use <a className="underline" href="https://crontab.guru" target="_blank" rel="noreferrer">crontab.guru</a> to build expressions.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Retention (days)</Label>
              <Input type="number" min={1} max={365} value={retentionDays}
                onChange={e => setRetentionDays(e.target.value)}
                data-testid="input-retention" />
            </div>

            <div className="rounded-lg border p-3 flex flex-col gap-3">
              <p className="text-sm font-medium flex items-center gap-2">
                <Cloud className="h-4 w-4 text-primary" />
                External Storage (optional)
              </p>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Provider</Label>
                <Select value={externalProvider} onValueChange={setExternalProvider}>
                  <SelectTrigger data-testid="select-external-provider">
                    <SelectValue placeholder="None — Supabase Storage only" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None — Supabase Storage only</SelectItem>
                    {EXTERNAL_PROVIDERS.map(p => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {externalProvider && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Bucket / Container</Label>
                    <Input value={externalBucket} onChange={e => setExternalBucket(e.target.value)}
                      placeholder="my-bucket" data-testid="input-external-bucket" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Path prefix</Label>
                    <Input value={externalPath} onChange={e => setExternalPath(e.target.value)}
                      placeholder="pact-backups/" data-testid="input-external-path" />
                  </div>
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    Credentials for {EXTERNAL_PROVIDERS.find(p => p.value === externalProvider)?.label} must be configured as Supabase secrets (see runbook).
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowScheduleDialog(false)}>Cancel</Button>
            <Button disabled={saveSchedule.isPending} onClick={() => saveSchedule.mutate()}
              data-testid="btn-save-schedule">
              {saveSchedule.isPending ? 'Saving…' : 'Save Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: Point-in-Time Restore
// ─────────────────────────────────────────────────────────────────────────────
function RestoreTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedFormId, setSelectedFormId] = useState('');
  const [selectedBackupId, setSelectedBackupId] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('merge');

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-backup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_forms').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: successfulBackups = [], isLoading: backupsLoading } = useQuery<any[]>({
    queryKey: ['fd-backups-restore', selectedFormId],
    enabled: !!selectedFormId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_backups')
        .select('id, created_at, submission_count, file_size_bytes, backup_type')
        .eq('form_id', selectedFormId)
        .eq('status', 'success')
        .not('storage_path', 'is', null)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: restoreLogs = [] } = useQuery<any[]>({
    queryKey: ['fd-restore-logs', selectedFormId],
    enabled: !!selectedFormId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_restore_logs')
        .select('*')
        .eq('form_id', selectedFormId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedBackup = successfulBackups.find(b => b.id === selectedBackupId);

  const triggerRestore = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('fd_restore_logs').insert({
        form_id: selectedFormId,
        backup_id: selectedBackupId,
        restore_mode: restoreMode,
        status: 'pending',
        initiated_by: user?.id,
        initiated_by_name: user?.user_metadata?.full_name ?? user?.email ?? 'Unknown',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-restore-logs', selectedFormId] });
      setConfirmOpen(false);
      setSelectedBackupId('');
      toast({
        title: 'Restore queued',
        description: 'A restore job has been queued. The admin team will be notified on completion.',
      });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Warning banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">Restore will modify live submission data</p>
          <p className="text-sm mt-0.5">
            In <strong>Replace</strong> mode all current submissions are deleted before restoring.
            In <strong>Merge</strong> mode only submissions missing from live data are restored.
            Both operations are logged and reversible by running another restore.
          </p>
        </div>
      </div>

      {/* Form selector */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1.5">
          <Label>Form</Label>
          <Select value={selectedFormId} onValueChange={v => { setSelectedFormId(v); setSelectedBackupId(''); }}>
            <SelectTrigger className="w-64" data-testid="select-form-restore">
              <SelectValue placeholder="Select form…" />
            </SelectTrigger>
            <SelectContent>
              {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {selectedFormId && (
          <div className="flex flex-col gap-1.5">
            <Label>Snapshot to restore</Label>
            <Select value={selectedBackupId} onValueChange={setSelectedBackupId}
              disabled={backupsLoading || successfulBackups.length === 0}>
              <SelectTrigger className="w-72" data-testid="select-backup-snapshot">
                <SelectValue placeholder={backupsLoading ? 'Loading…' : 'Select a snapshot…'} />
              </SelectTrigger>
              <SelectContent>
                {successfulBackups.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {new Date(b.created_at).toLocaleString()} — {b.submission_count ?? '?'} submissions ({fmtSize(b.file_size_bytes)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Snapshot detail + restore options */}
      {selectedBackup && (
        <div className="rounded-xl border bg-card p-5 flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Snapshot Date', value: new Date(selectedBackup.created_at).toLocaleString() },
              { label: 'Submissions',   value: selectedBackup.submission_count ?? '—' },
              { label: 'File Size',     value: fmtSize(selectedBackup.file_size_bytes) },
              { label: 'Type',          value: selectedBackup.backup_type ?? 'auto' },
            ].map(kv => (
              <div key={kv.label} className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{kv.label}</p>
                <p className="font-semibold text-sm capitalize">{kv.value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Restore mode</Label>
            <div className="flex gap-3">
              {(['merge', 'replace'] as const).map(m => (
                <button key={m}
                  onClick={() => setRestoreMode(m)}
                  className={cn(
                    'flex-1 rounded-lg border p-3 text-left transition-all',
                    restoreMode === m ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  )}
                  data-testid={`restore-mode-${m}`}>
                  <p className="font-semibold text-sm capitalize">{m}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m === 'merge'
                      ? 'Restore only missing submissions — existing data is kept'
                      : 'Delete all current submissions, then restore from snapshot'}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <Button className="self-start" onClick={() => setConfirmOpen(true)}
            data-testid="btn-restore-confirm-open">
            <RotateCcw className="h-4 w-4 mr-2" />
            Restore Snapshot
          </Button>
        </div>
      )}

      {/* Restore history */}
      {selectedFormId && restoreLogs.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Restore History</p>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Snapshot</th>
                  <th className="p-3 text-left">Mode</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">By</th>
                </tr>
              </thead>
              <tbody>
                {restoreLogs.map((r, i) => (
                  <tr key={r.id} className={cn('border-b last:border-0 hover:bg-muted/30', i % 2 === 0 && 'bg-background')}>
                    <td className="p-3 text-muted-foreground">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-3 font-mono text-xs">{r.backup_id?.slice(0, 12)}…</td>
                    <td className="p-3 capitalize">{r.restore_mode}</td>
                    <td className="p-3">{statusBadge(r.status)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.initiated_by_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Confirm Restore
            </DialogTitle>
            <DialogDescription>
              You are about to restore {selectedBackup?.submission_count ?? '?'} submissions from{' '}
              <strong>{selectedBackup ? new Date(selectedBackup.created_at).toLocaleString() : ''}</strong>{' '}
              using <strong>{restoreMode}</strong> mode.
              {restoreMode === 'replace' && (
                <span className="text-destructive block mt-1">
                  ⚠ This will permanently delete all current submissions before restoring.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={triggerRestore.isPending}
              onClick={() => triggerRestore.mutate()}
              data-testid="btn-restore-execute">
              <RotateCcw className="h-4 w-4 mr-2" />
              {triggerRestore.isPending ? 'Queuing…' : 'Confirm Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: PACT Archive Export
// ─────────────────────────────────────────────────────────────────────────────
function PactArchiveTab() {
  const { toast } = useToast();

  const [selectedFormId, setSelectedFormId] = useState('');
  const [includeMedia, setIncludeMedia]     = useState(true);
  const [includeExports, setIncludeExports] = useState(true);
  const [includeCharts, setIncludeCharts]   = useState(false);
  const [archiving, setArchiving]           = useState(false);
  const [archiveUrl, setArchiveUrl]         = useState('');
  const [lastArchived, setLastArchived]     = useState('');

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-backup'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_forms').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: archiveLogs = [] } = useQuery<any[]>({
    queryKey: ['fd-archive-logs', selectedFormId],
    enabled: !!selectedFormId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_archive_logs')
        .select('*')
        .eq('form_id', selectedFormId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const generateArchive = async () => {
    if (!selectedFormId) return;
    setArchiving(true);
    setArchiveUrl('');
    try {
      const { data, error } = await supabase.functions.invoke('create-pact-archive', {
        body: { form_id: selectedFormId, include_media: includeMedia, include_exports: includeExports, include_charts: includeCharts },
      });
      if (error) throw error;
      if (data?.signed_url) {
        setArchiveUrl(data.signed_url);
        setLastArchived(new Date().toLocaleString());
        toast({ title: 'Archive ready', description: 'Your PACT archive has been generated.' });
      }
    } catch (e: any) {
      toast({ title: 'Archive failed', description: e.message, variant: 'destructive' });
    } finally {
      setArchiving(false);
    }
  };

  const CONTENTS = [
    { icon: FileJson,        label: 'XLSForm definition',    desc: 'Original form definition file' },
    { icon: FileJson,        label: 'Submissions JSON',       desc: 'All responses in structured JSON' },
    { icon: FileSpreadsheet, label: 'Submissions CSV',        desc: 'Flat CSV for Excel / SPSS / Stata' },
    { icon: Image,           label: 'Media files',            desc: 'Photos, audio, video attachments', optional: true, key: 'media' },
    { icon: FolderArchive,   label: 'Exports',                desc: 'All generated export files', optional: true, key: 'exports' },
    { icon: FolderArchive,   label: 'Charts & analytics',     desc: 'PNG chart snapshots', optional: true, key: 'charts' },
    { icon: ShieldCheck,     label: 'README.txt',             desc: 'Self-contained manifest, no server needed' },
  ] as const;

  const optionalEnabled = (key: string) => {
    if (key === 'media') return includeMedia;
    if (key === 'exports') return includeExports;
    if (key === 'charts') return includeCharts;
    return true;
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Explainer */}
      <div className="rounded-lg border bg-card p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <FolderArchive className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">PACT Offline Archive</h3>
          <Badge variant="outline" className="text-xs">.zip</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Generates a complete, self-contained ZIP archive of a form when archiving a study.
          No server or internet connection is needed to read the archive — it includes everything
          required for offline reference and audit trails.
        </p>

        {/* Contents checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
          {CONTENTS.map(item => {
            const enabled = !item.optional || optionalEnabled((item as any).key ?? '');
            return (
              <div key={item.label}
                className={cn('flex items-start gap-2 rounded p-2 border', enabled ? 'bg-background border-border' : 'opacity-40 border-dashed')}>
                <item.icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium">{item.label}</p>
                  <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                </div>
                {!enabled && (
                  <Badge variant="outline" className="ml-auto text-[10px]">excluded</Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Config */}
      <div className="rounded-xl border bg-card p-5 flex flex-col gap-4">
        <p className="font-medium text-sm">Archive Configuration</p>

        <div className="flex flex-col gap-1.5">
          <Label>Form to archive</Label>
          <Select value={selectedFormId} onValueChange={setSelectedFormId}>
            <SelectTrigger className="w-72" data-testid="select-form-archive">
              <SelectValue placeholder="Select form…" />
            </SelectTrigger>
            <SelectContent>
              {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-3">
          <Label className="text-sm font-medium">Optional inclusions</Label>
          {[
            { label: 'Media files (photos, audio, video)', value: includeMedia, setter: setIncludeMedia, testid: 'toggle-include-media' },
            { label: 'Export files (XLSX, CSV, GeoJSON, etc.)', value: includeExports, setter: setIncludeExports, testid: 'toggle-include-exports' },
            { label: 'Chart snapshots (PNG)', value: includeCharts, setter: setIncludeCharts, testid: 'toggle-include-charts' },
          ].map(opt => (
            <div key={opt.label} className="flex items-center justify-between">
              <Label className="font-normal text-sm">{opt.label}</Label>
              <Switch checked={opt.value} onCheckedChange={opt.setter} data-testid={opt.testid} />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap pt-1">
          <Button disabled={!selectedFormId || archiving} onClick={generateArchive}
            data-testid="btn-generate-archive">
            {archiving
              ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Generating archive…</>
              : <><FolderArchive className="h-4 w-4 mr-2" /> Generate Archive</>}
          </Button>

          {archiveUrl && (
            <a href={archiveUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" data-testid="btn-download-archive">
                <Download className="h-4 w-4 mr-2" /> Download ZIP
              </Button>
            </a>
          )}

          {lastArchived && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> Generated {lastArchived}
            </span>
          )}
        </div>
      </div>

      {/* Archive history */}
      {selectedFormId && archiveLogs.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2">Archive History</p>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="p-3 text-left">Generated</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Size</th>
                  <th className="p-3 text-left">Includes</th>
                  <th className="p-3 text-left">By</th>
                  <th className="p-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archiveLogs.map((a, i) => (
                  <tr key={a.id}
                    className={cn('border-b last:border-0 hover:bg-muted/30', i % 2 === 0 && 'bg-background')}
                    data-testid={`archive-row-${a.id}`}>
                    <td className="p-3 text-muted-foreground">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="p-3">{statusBadge(a.status)}</td>
                    <td className="p-3 text-muted-foreground">{fmtSize(a.file_size_bytes)}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {a.include_media    && <Badge variant="outline" className="text-xs">Media</Badge>}
                        {a.include_exports  && <Badge variant="outline" className="text-xs">Exports</Badge>}
                        {a.include_charts   && <Badge variant="outline" className="text-xs">Charts</Badge>}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{a.generated_by_name ?? '—'}</td>
                    <td className="p-3">
                      {a.storage_path && a.status === 'success' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={async () => {
                            const { data } = await supabase.storage
                              .from('field-data-archives')
                              .createSignedUrl(a.storage_path, 300);
                            if (data?.signedUrl) window.open(data.signedUrl, '_blank');
                          }}
                          data-testid={`download-archive-${a.id}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function FieldDataBackup() {
  const [tab, setTab] = useState<TabId>('backups');

  const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'backups', label: 'Automatic Backups', icon: HardDrive,
      desc: 'Daily snapshots to Supabase Storage or external cloud' },
    { id: 'restore', label: 'Point-in-Time Restore', icon: RotateCcw,
      desc: "Restore any form's submissions to a previous snapshot" },
    { id: 'archive', label: 'PACT Archive', icon: FolderArchive,
      desc: 'Self-contained offline ZIP for study archival' },
  ];

  const ActiveTab = tab === 'backups' ? BackupsTab : tab === 'restore' ? RestoreTab : PactArchiveTab;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Archive className="h-6 w-6 text-primary" />
          Backup &amp; Disaster Recovery
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Automatic daily backups, point-in-time restore, and self-contained PACT archives for field data.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'text-left rounded-xl border p-4 flex items-start gap-3 transition-all',
              tab === t.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
            )}
            data-testid={`tab-card-${t.id}`}>
            <div className={cn('rounded-lg p-2 flex-shrink-0',
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <t.icon className="h-5 w-5" />
            </div>
            <div>
              <p className={cn('font-semibold text-sm', tab === t.id && 'text-primary')}>{t.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <ActiveTab />
      </div>
    </div>
  );
}
