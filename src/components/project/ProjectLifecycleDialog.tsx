import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { logAuditEvent } from '@/utils/audit-logger';
import { dispatchNotification } from '@/lib/notify';
import { useToast } from '@/hooks/toast';

export interface LifecyclePreflight {
  can_close: boolean;
  can_delete_empty: boolean;
  dependencies: Record<string, number>;
  items: { id: string; label: string; passed: boolean; total: number; count: number }[];
}

export function ProjectLifecycleDialog({ open, mode, projectId, projectName, onClose, onDelete, onClosed }: {
  open: boolean; mode: 'close' | 'delete' | 'finance'; projectId: string; projectName: string;
  onClose: () => void; onDelete?: () => Promise<void> | void; onClosed?: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { checkPermission } = useAuthorization();
  const [data, setData] = useState<LifecyclePreflight | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const load = async () => {
    setLoading(true); setError(''); setData(null);
    try {
      const { data: result, error } = await supabase.rpc('project_lifecycle_preflight', { p_id: projectId });
      if (error) throw error;
      setData(result);
    } catch (e: any) {
      setError(`${e.message || 'Could not check project safety.'} If the function is missing, apply the project-module migrations first.`);
    } finally { setLoading(false); }
  };
  useEffect(() => { if (open) { setConfirmation(''); setReason(''); void load(); } }, [open, projectId]);
  const run = async (action: 'close' | 'archive' | 'delete' | 'clearance') => {
    setBusy(true); setError('');
    try {
      if (action === 'delete') {
        if (confirmation !== projectName || !data?.can_delete_empty || !onDelete) throw new Error('Deletion is restricted to confirmed empty projects.');
        await onDelete();
      } else {
        const result = action === 'clearance'
          ? await supabase.rpc('attest_project_financial_clearance', { p_id: projectId, p_note: reason })
          : action === 'archive'
            ? await supabase.rpc('archive_project_retaining_records', { p_id: projectId, p_reason: reason })
            : await supabase.rpc('close_project', { p_id: projectId, p_justification: null, p_super_admin_override: false });
        if (result.error) throw result.error;
      }
      await qc.invalidateQueries({ queryKey: ['projects'] });
      await qc.invalidateQueries({ queryKey: ['project', projectId] });
      if (action !== 'delete') {
        const audit = await logAuditEvent({ module: 'project', action: action === 'clearance' ? 'approve' : 'archive',
          entityType: 'project', entityId: projectId, entityName: projectName,
          description: `${action === 'close' ? 'Verified project close' : action === 'archive' ? 'Retention archive (not completion)' : 'Finance clearance'}: ${reason || projectName}` }).catch(() => null);
        if (!audit) toast({ title: 'Saved, with an audit warning', description: 'The operation succeeded, but the central audit log could not be confirmed.', variant: 'destructive' });
        if (action === 'close' || action === 'archive') {
          const { data: project } = await supabase.from('projects').select('team').eq('id', projectId).single();
          const ids = [...new Set([project?.team?.projectManagerId, project?.team?.projectManager,
            ...(project?.team?.teamComposition || []).map((member: any) => member.userId)]
            .filter((id): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))];
          if (ids.length) await dispatchNotification({ event: 'project_status_changed', recipientIds: ids,
            titleEn: `Project ${action === 'close' ? 'closed' : 'archived'}: ${projectName}`, titleAr: `تحديث حالة المشروع: ${projectName}`,
            messageEn: action === 'close' ? 'The project passed its completion and Finance checks and was closed.' : `The project was archived with all records retained. Completion was not confirmed. Reason: ${reason}`,
            messageAr: action === 'close' ? 'تم إغلاق المشروع بعد التحقق من الجاهزية.' : 'تمت أرشفة المشروع مع الاحتفاظ بجميع السجلات دون تأكيد الاكتمال.',
            entityType: 'project', entityId: projectId, actionUrl: `/projects/${projectId}`, sendEmail: true,
          }).catch(() => { toast({ title: 'Project saved', description: 'Team notification delivery was not confirmed.', variant: 'destructive' }); });
        }
      }
      if (action === 'clearance') { setReason(''); await load(); }
      else { onClosed?.(); onClose(); }
    } catch (e: any) { setError(e.message || 'The operation failed. Nothing was confirmed.'); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>{mode === 'finance' ? 'Finance close clearance' : mode === 'close' ? 'Close or archive project' : 'Project removal safety'}</DialogTitle></DialogHeader>
      <p className="text-sm font-semibold">{projectName}</p>
      <DialogDescription>Closing retains records and confirms readiness. A retention archive keeps unfinished records without claiming completion. Deletion is allowed only when no linked records exist.</DialogDescription>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loading && <p role="status">Checking tasks, linked records and finance…</p>}
      {!loading && !data && <Button type="button" onClick={load}>Retry safety check</Button>}
      {data && <>
        <div className="space-y-2">{data.items.map(item => <div key={item.id} className="flex justify-between gap-3 text-sm border-b py-2">
          <span>{item.label}</span><strong>{item.passed ? 'Ready' : 'Needs attention'}</strong>
        </div>)}</div>
        <div className="rounded border p-3 text-xs space-y-1">
          <strong>Linked records (including records hidden by child-table access rules)</strong>
          {Object.entries(data.dependencies).length ? Object.entries(data.dependencies).map(([name, count]) =>
            <div key={name} className="flex justify-between"><span>{name.replaceAll('_', ' ')}</span><span>{count}</span></div>)
            : <p>No linked records found. The server checks again during deletion.</p>}
        </div>
        <Textarea aria-label="Archive reason or finance reconciliation note" placeholder="Explain the archive, or record Finance’s reconciliation evidence and checks." value={reason} onChange={e => setReason(e.target.value)} />
        {checkPermission('cost_submissions', 'approve') && !data.items.find(i => i.id === 'financial_clearance')?.passed &&
          <Button type="button" variant="outline" disabled={busy || reason.trim().length < 20} onClick={() => void run('clearance')}>Record Finance clearance</Button>}
        <p className="text-xs text-muted-foreground">Finance clearance is a documented reconciliation sign-off, not an automatic claim that balances match. Changes to financial source records require fresh clearance.</p>
        {mode !== 'finance' && <div className="flex gap-2 flex-wrap">
          <Button type="button" disabled={busy || !data.can_close} onClick={() => void run('close')}>Close as completed</Button>
          <Button type="button" variant="outline" disabled={busy || reason.trim().length < 10} onClick={() => void run('archive')}>Archive, retain all records</Button>
        </div>}
        {mode === 'delete' && <>
          <p className="text-sm">{data.can_delete_empty ? 'Type the exact project name to delete this empty project. Its complete header is saved to the existing Recycle Bin for recovery during its retention period.' : 'Deletion blocked: this project has information. Use an archive to preserve it.'}</p>
          <Input aria-label="Confirm project name" value={confirmation} onChange={e => setConfirmation(e.target.value)} placeholder={projectName} disabled={!data.can_delete_empty || busy} />
          <Button type="button" variant="destructive" disabled={busy || !data.can_delete_empty || confirmation !== projectName} onClick={() => void run('delete')}>Delete empty project</Button>
        </>}
      </>}
      <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
    </DialogContent>
  </Dialog>;
}
