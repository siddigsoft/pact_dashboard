import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { restoreFromBin } from '@/utils/softDelete';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Trash2, RotateCcw, RefreshCw, Archive } from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { formatDistanceToNow, format } from 'date-fns';

interface BinRow {
  id: string;
  table_name: string;
  record_id: string;
  record_data: Record<string, unknown>;
  deleted_by: string | null;
  deleted_by_name: string | null;
  deleted_at: string;
  purge_after: string;
  restored_at: string | null;
  restored_by_name: string | null;
  notes: string | null;
  context: Record<string, unknown>;
}

const TABLE_LABELS: Record<string, string> = {
  mmp_files: 'MMP File',
  mmp_site_entries: 'MMP Site Entry',
  down_payment_requests: 'Down-Payment Request',
  operational_cost_submissions: 'Cost Submission',
  positions: 'Position',
  staff_contracts: 'Staff Contract',
  performance_reviews: 'Performance Review',
  pre_fund_requests: 'Pre-Fund Request',
  pre_fund_transactions: 'Pre-Fund Transaction',
  project_documents: 'Project Document',
  project_risks: 'Project Risk',
  field_task_comments: 'Task Comment',
  personal_tasks: 'Personal Task',
};

function recordSummary(row: BinRow): string {
  const d = row.record_data;
  return (
    (d.name as string) ||
    (d.title as string) ||
    (d.site_name as string) ||
    (d.mmp_id as string) ||
    (d.description as string) ||
    `Record ${row.record_id.slice(0, 8)}…`
  );
}

function daysLeft(purgeAfter: string): number {
  return Math.max(0, Math.round((new Date(purgeAfter).getTime() - Date.now()) / 86400000));
}

export default function RecycleBin() {
  const { isSuperAdmin } = useAuthorization();
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [rows, setRows] = useState<BinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('all');
  const [showRestored, setShowRestored] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<BinRow | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [purging, setPurging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('recycle_bin')
      .select('*')
      .order('deleted_at', { ascending: false })
      .limit(500);
    if (error) {
      toast({ title: 'Failed to load recycle bin', description: error.message, variant: 'destructive' });
    } else {
      setRows((data || []) as BinRow[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  if (!isSuperAdmin()) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Super Admin access required.</p>
      </div>
    );
  }

  const uniqueTables = [...new Set(rows.map(r => r.table_name))].sort();

  const filtered = rows.filter(r => {
    if (!showRestored && r.restored_at) return false;
    if (tableFilter !== 'all' && r.table_name !== tableFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        r.table_name.includes(s) ||
        r.record_id.includes(s) ||
        recordSummary(r).toLowerCase().includes(s) ||
        (r.deleted_by_name || '').toLowerCase().includes(s)
      );
    }
    return true;
  });

  const handleRestore = async (row: BinRow) => {
    setRestoring(row.id);
    const result = await restoreFromBin(
      supabase,
      row.id,
      row.table_name,
      row.record_data,
      currentUser?.id,
      currentUser?.name || currentUser?.email
    );
    setRestoring(null);
    if (result.success) {
      toast({ title: 'Record restored', description: `${TABLE_LABELS[row.table_name] || row.table_name}: ${recordSummary(row)}` });
      load();
    } else {
      toast({ title: 'Restore failed', description: result.error, variant: 'destructive' });
    }
  };

  const handlePurge = async (row: BinRow) => {
    setPurging(row.id);
    const { error } = await supabase.from('recycle_bin').delete().eq('id', row.id);
    setPurging(null);
    setPurgeTarget(null);
    if (error) {
      toast({ title: 'Purge failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Permanently deleted', variant: 'destructive' });
      load();
    }
  };

  const pendingCount = rows.filter(r => !r.restored_at).length;
  const expiringSoon = rows.filter(r => !r.restored_at && daysLeft(r.purge_after) <= 3).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Archive className="h-6 w-6 text-amber-500" /> Recycle Bin
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Deleted records are kept here for 28 days before permanent purge. Super Admin only.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-2xl font-bold">{pendingCount}</p><p className="text-xs text-muted-foreground">Awaiting purge</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className={`text-2xl font-bold ${expiringSoon > 0 ? 'text-amber-500' : ''}`}>{expiringSoon}</p><p className="text-xs text-muted-foreground">Expiring ≤ 3 days</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-2xl font-bold text-green-600">{rows.filter(r => r.restored_at).length}</p><p className="text-xs text-muted-foreground">Restored</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-2xl font-bold">{uniqueTables.length}</p><p className="text-xs text-muted-foreground">Tables affected</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search by name, table, deleted by…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={tableFilter} onValueChange={setTableFilter}>
          <SelectTrigger className="w-52"><SelectValue placeholder="All tables" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tables</SelectItem>
            {uniqueTables.map(t => (
              <SelectItem key={t} value={t}>{TABLE_LABELS[t] || t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={showRestored ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setShowRestored(v => !v)}
        >
          {showRestored ? 'Hide restored' : 'Show restored'}
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Archive className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Recycle bin is empty</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(row => {
            const days = daysLeft(row.purge_after);
            const isExpired = days === 0;
            const isRestored = !!row.restored_at;
            return (
              <Card key={row.id} className={`${isRestored ? 'opacity-60' : ''} ${isExpired && !isRestored ? 'border-red-300 dark:border-red-800' : ''}`}>
                <CardContent className="py-3 px-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs shrink-0">
                        {TABLE_LABELS[row.table_name] || row.table_name}
                      </Badge>
                      <span className="font-medium text-sm truncate">{recordSummary(row)}</span>
                      {isRestored && <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">Restored</Badge>}
                      {!isRestored && days <= 3 && <Badge variant="destructive" className="text-xs">{days === 0 ? 'Expired' : `${days}d left`}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                      <span>Deleted {formatDistanceToNow(new Date(row.deleted_at), { addSuffix: true })}</span>
                      {row.deleted_by_name && <span>by {row.deleted_by_name}</span>}
                      {!isRestored && <span>Purge: {format(new Date(row.purge_after), 'MMM d, yyyy')}</span>}
                      {isRestored && row.restored_by_name && <span>Restored by {row.restored_by_name}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isRestored && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                        disabled={restoring === row.id}
                        onClick={() => handleRestore(row)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        {restoring === row.id ? 'Restoring…' : 'Restore'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-red-50 dark:hover:bg-red-950"
                      disabled={purging === row.id}
                      onClick={() => setPurgeTarget(row)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Purge confirmation */}
      <AlertDialog open={!!purgeTarget} onOpenChange={open => { if (!open) setPurgeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Permanently delete this record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{purgeTarget ? recordSummary(purgeTarget) : ''}</strong> from the recycle bin. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => purgeTarget && handlePurge(purgeTarget)}
            >
              {purging === purgeTarget?.id ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
