import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { getAuditTrailForSite } from '@/services/mmpAudit.service';

interface AuditLogEntry {
  id: string;
  action: string;
  actor_name: string;
  actor_role: string;
  timestamp: string;
  description: string;
  changes: Record<string, { from: unknown; to: unknown } & Record<string, unknown>> | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  severity: string;
  metadata: Record<string, unknown> | null;
  tags: string[] | null;
  success: boolean;
}

// ─── Label / colour maps ─────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  site_dispatch:            'Dispatched',
  site_claim:               'Claimed',
  site_accept:              'Accepted',
  site_complete:            'Visit Completed',
  site_visit_start:         'Visit Started',
  site_return:              'Returned',
  site_returned_to_fom:     'Returned to FOM',
  site_recalled:            'Recalled',
  site_approved_costed:     'Approved & Costed',
  cp_verification:          'CP Verified',
  state_permit_decision:    'State Permit',
  permit_decision_set:      'Locality Permit Requirement',
  permit_upload:            'Locality Permit Uploaded',
  permit_verify:            'Permit Verified',
  cost_acknowledge:         'Cost Acknowledged',
  cost_update:              'Cost Updated',
  forward_to_coordinator:   'Forwarded to Coordinator',
  reclaim_from_coordinator: 'Reclaimed from Coordinator',
  reject:                   'Rejected',
  verify:                   'Verified',
  status_change:            'Status Changed',
};

const ACTION_COLORS: Record<string, string> = {
  site_dispatch:            'bg-blue-100 text-blue-800',
  site_claim:               'bg-purple-100 text-purple-800',
  site_accept:              'bg-purple-100 text-purple-800',
  site_complete:            'bg-green-100 text-green-800',
  site_visit_start:         'bg-cyan-100 text-cyan-800',
  site_return:              'bg-orange-100 text-orange-800',
  site_returned_to_fom:     'bg-orange-100 text-orange-800',
  site_recalled:            'bg-orange-100 text-orange-800',
  site_approved_costed:     'bg-green-100 text-green-800',
  cp_verification:          'bg-teal-100 text-teal-800',
  state_permit_decision:    'bg-sky-100 text-sky-800',
  permit_decision_set:      'bg-sky-100 text-sky-800',
  permit_upload:            'bg-sky-100 text-sky-800',
  permit_verify:            'bg-teal-100 text-teal-800',
  cost_acknowledge:         'bg-emerald-100 text-emerald-800',
  cost_update:              'bg-yellow-100 text-yellow-800',
  forward_to_coordinator:   'bg-indigo-100 text-indigo-800',
  reclaim_from_coordinator: 'bg-orange-100 text-orange-800',
  reject:                   'bg-red-100 text-red-800',
  verify:                   'bg-teal-100 text-teal-800',
  status_change:            'bg-gray-100 text-gray-700',
};

// ─── Small helpers ────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: string }) {
  const label = ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
  const color = ACTION_COLORS[action] ?? 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {label}
    </span>
  );
}

function str(v: unknown) { return v != null ? String(v) : '—'; }

/** Show a simple "from → to" pill for the status field if it changed. */
function StatusArrow({ changes }: { changes: AuditLogEntry['changes'] }) {
  if (!changes?.status) return null;
  const { from, to } = changes.status as { from: unknown; to: unknown };
  if (!from && !to) return null;
  return (
    <span className="text-xs text-muted-foreground">
      {str(from)} → {str(to)}
    </span>
  );
}

/** Detail lines rendered below the actor name for each event type. */
function EventDetail({ log }: { log: AuditLogEntry }) {
  const c = log.changes ?? {};

  // Rejection reason
  if (c.rejection_comments?.to) {
    return (
      <p className="text-xs text-destructive mt-0.5">
        Reason: {str(c.rejection_comments.to)}
      </p>
    );
  }

  // CP Verification
  if (c.cp_verification) {
    const cv = c.cp_verification as Record<string, unknown>;
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        Status: <span className="font-medium">{str(cv.to)}</span>
        {cv.verified_at ? ` · ${format(parseISO(str(cv.verified_at)), 'dd MMM yyyy')}` : ''}
      </p>
    );
  }

  // Approved and costed
  if (c.approved_and_costed) {
    const ac = c.approved_and_costed as Record<string, unknown>;
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        Approved by: <span className="font-medium">{str(ac.approved_by)}</span>
        {ac.approved_at ? ` · ${format(parseISO(str(ac.approved_at)), 'dd MMM yyyy')}` : ''}
      </p>
    );
  }

  // State permit decision
  if (c.state_permit_decision) {
    const sp = c.state_permit_decision as Record<string, unknown>;
    const label = sp.not_required === 'true' ? 'Not required' : (str(sp.requirement) || 'Recorded');
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        State permit: <span className="font-medium">{label}</span>
        {sp.decided_at ? ` · ${format(parseISO(str(sp.decided_at)), 'dd MMM yyyy')}` : ''}
      </p>
    );
  }

  // Locality permit uploaded
  if (c.locality_permit_uploaded) {
    const lp = c.locality_permit_uploaded as Record<string, unknown>;
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        Locality permit uploaded
        {lp.uploaded_at ? ` · ${format(parseISO(str(lp.uploaded_at)), 'dd MMM yyyy')}` : ''}
      </p>
    );
  }

  // Locality permit requirement set
  if (c.locality_permit_requirement) {
    const lr = c.locality_permit_requirement as Record<string, unknown>;
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        Requirement: <span className="font-medium">{str(lr.requirement)}</span>
        {lr.required_but_not_uploaded === 'true' ? ' (not yet uploaded)' : ''}
      </p>
    );
  }

  // Assignment (from additional_data)
  if (c.assigned_to) {
    const at = c.assigned_to as Record<string, unknown>;
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        Assigned to: <span className="font-medium">{str(at.to)}</span>
        {at.assigned_at ? ` · ${format(parseISO(str(at.assigned_at)), 'dd MMM yyyy')}` : ''}
      </p>
    );
  }

  // Forwarded to coordinator (re-forward after recall, or first forward)
  if (c.forwarded_to_user_id && log.action === 'forward_to_coordinator') {
    const ft = c.forwarded_to_user_id as Record<string, unknown>;
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        Forwarded to coordinator
        {ft.to ? ` · Assignee ID: ${str(ft.to)}` : ''}
      </p>
    );
  }

  // Reclaimed from coordinator
  if (log.action === 'reclaim_from_coordinator') {
    return (
      <p className="text-xs text-muted-foreground mt-0.5">
        Site reclaimed from coordinator; can be re-dispatched or re-forwarded.
      </p>
    );
  }

  // Recall history entry
  if (c.recall_history_entry) {
    const rh = c.recall_history_entry as Record<string, unknown>;
    const latest = rh.latest as Record<string, unknown> | null;
    return (
      <div className="text-xs text-muted-foreground mt-0.5">
        {latest?.reason && <p>Reason: <span className="font-medium">{str(latest.reason)}</span></p>}
        {latest?.from_status && latest?.to_status && (
          <p>{str(latest.from_status)} → {str(latest.to_status)}</p>
        )}
      </div>
    );
  }

  // Cost changes
  if (c.cost || c.enumerator_fee || c.transport_fee) {
    return (
      <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
        {c.cost && <p>Cost: {str(c.cost.from)} → {str(c.cost.to)} SDG</p>}
        {c.enumerator_fee && <p>Enumerator fee: {str(c.enumerator_fee.from)} → {str(c.enumerator_fee.to)} SDG</p>}
        {c.transport_fee && <p>Transport fee: {str(c.transport_fee.from)} → {str(c.transport_fee.to)} SDG</p>}
      </div>
    );
  }

  // Verification notes
  if (c.verification_notes?.to) {
    return (
      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
        Note: {str(c.verification_notes.to)}
      </p>
    );
  }

  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  siteId: string;
  className?: string;
}

export function SiteAuditTrail({ siteId, className }: Props) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!siteId) return;
    setLoading(true);
    getAuditTrailForSite(siteId)
      .then(data => setLogs(data as AuditLogEntry[]))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className={`space-y-2 ${className ?? ''}`}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-10 rounded bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (!logs.length) {
    return (
      <p className={`text-sm text-muted-foreground py-4 text-center ${className ?? ''}`}>
        No audit history for this site yet.
      </p>
    );
  }

  return (
    <ol className={`relative border-l border-muted ml-2 ${className ?? ''}`}>
      {logs.map(log => (
        <li key={log.id} className="mb-4 ml-4">
          {/* Timeline dot */}
          <span
            className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background ${
              log.success ? 'bg-primary' : 'bg-destructive'
            }`}
          />

          {/* Header row: badge + status arrow + timestamp */}
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <ActionBadge action={log.action} />
            <StatusArrow changes={log.changes} />
            <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
              {format(parseISO(log.timestamp), 'dd MMM yyyy, HH:mm')}
            </span>
          </div>

          {/* Actor */}
          <p className="text-sm font-medium leading-snug">{log.actor_name}</p>

          {/* Rich event detail from changes */}
          <EventDetail log={log} />

          {/* Fallback: description text when it carries useful context */}
          {!log.changes && log.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{log.description}</p>
          )}

          {/* System trigger tag */}
          {log.tags?.includes('db_trigger') && (
            <span className="text-[10px] text-muted-foreground/50 mt-0.5 block">system trigger</span>
          )}
        </li>
      ))}
    </ol>
  );
}
