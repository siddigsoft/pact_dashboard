/**
 * WFPBulkActions — GAP 17 (Phase C follow-on)
 * Shown in the WFP Confirmation tab when there are PACT sites not confirmed by WFP.
 *
 * "Not confirmed" = submitted PACT sites that don't appear as `outcome: confirmed` in the
 * current WFP match results. These are the sites whose enumerators need to provide ODK evidence.
 *
 * Provides:
 *   1. "Send Evidence Request to All" — one in-app + WhatsApp notification per enumerator
 *      listing their unconfirmed sites, asking them to provide ODK reference numbers.
 *   2. "Export No-Match Report" — Excel download of all WFP rows that had no PACT match.
 */

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertTriangle, Send, Download, Loader2, CheckCircle2, Info, User,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { dispatchNotification } from '@/lib/notify';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/context/AppContext';
import type { MatchResult } from '@/utils/wfpMatcher';

interface UnconfirmedSite {
  siteId: string;
  siteName: string;
  enumeratorId: string;
  enumeratorName: string;
}

interface WFPBulkActionsProps {
  results: MatchResult[];
  mmpId: string;
  mmpName?: string | null;
}

export function WFPBulkActions({ results, mmpId, mmpName }: WFPBulkActionsProps) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();

  const [unconfirmed, setUnconfirmed] = useState<UnconfirmedSite[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  // WFP rows with no PACT match (for the export)
  const noMatchWFPRows = results.filter(r => r.match_tier === 'none');

  // Confirmed PACT site IDs from current results
  const confirmedSiteIds = new Set(
    results
      .filter(r => r.outcome === 'confirmed' && r.site_entry_id)
      .map(r => r.site_entry_id as string),
  );

  const loadUnconfirmedSites = useCallback(async () => {
    if (!mmpId) return;
    setLoading(true);
    try {
      // Fetch submitted PACT sites for this MMP
      const { data: sites } = await supabase
        .from('mmp_site_entries')
        .select('id, site_name, accepted_by')
        .eq('mmp_file_id', mmpId)
        .in('status', ['submitted', 'wfp_confirmed', 'assigned', 'dispatched']);

      if (!sites || sites.length === 0) { setUnconfirmed([]); return; }

      // Filter to only those NOT confirmed in current results
      const unconfirmedSites = (sites as any[]).filter(
        s => !confirmedSiteIds.has(s.id),
      );

      if (unconfirmedSites.length === 0) { setUnconfirmed([]); return; }

      // Fetch enumerator profiles
      const enumIds = [...new Set(unconfirmedSites.map((s: any) => s.accepted_by).filter(Boolean))];
      let enumNameMap: Record<string, string> = {};
      if (enumIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', enumIds);
        (profiles || []).forEach((p: any) => {
          enumNameMap[p.id] = p.full_name || p.email || p.id;
        });
      }

      const built: UnconfirmedSite[] = unconfirmedSites
        .filter((s: any) => s.accepted_by)
        .map((s: any) => ({
          siteId: s.id,
          siteName: s.site_name,
          enumeratorId: s.accepted_by,
          enumeratorName: enumNameMap[s.accepted_by] || s.accepted_by,
        }));

      setUnconfirmed(built);
    } catch (err) {
      console.warn('[WFPBulkActions]', err);
    } finally {
      setLoading(false);
    }
  }, [mmpId, confirmedSiteIds.size]);

  useEffect(() => { loadUnconfirmedSites(); }, [mmpId, results]);

  // Don't render if nothing unconfirmed AND no WFP no-match rows
  if (!loading && unconfirmed.length === 0 && noMatchWFPRows.length === 0) return null;

  // Group unconfirmed sites by enumerator
  const byEnumerator: Record<string, { name: string; sites: string[] }> = {};
  unconfirmed.forEach(u => {
    if (!byEnumerator[u.enumeratorId]) {
      byEnumerator[u.enumeratorId] = { name: u.enumeratorName, sites: [] };
    }
    byEnumerator[u.enumeratorId].sites.push(u.siteName);
  });

  const uniqueEnumerators = Object.keys(byEnumerator);

  const handleSendEvidenceRequests = async () => {
    if (!currentUser?.id) return;
    setSending(true);
    try {
      const mmpLabel = mmpName || 'this MMP cycle';
      const adminName = currentUser.full_name || currentUser.email || 'Admin';

      for (const enumId of uniqueEnumerators) {
        const info = byEnumerator[enumId];
        const siteList = info.sites.join(', ');
        const noteAppend = adminNote.trim() ? ` Admin note: ${adminNote.trim()}` : '';

        await dispatchNotification({
          event: 'wfp_evidence_requested',
          recipientIds: [enumId],
          titleEn: 'Action Required: WFP Submission Evidence Needed',
          titleAr: 'إجراء مطلوب: مطلوب دليل الإرسال إلى WFP',
          messageEn:
            `Your site(s) — ${siteList} — were not confirmed in the WFP data file for ${mmpLabel}. ` +
            `Please provide your ODK reference number and submission screenshots as evidence. ` +
            `Contact ${adminName} or your supervisor.${noteAppend}`,
          messageAr:
            `موقعك/مواقعك — ${siteList} — لم تُؤكَّد في ملف بيانات WFP لـ ${mmpLabel}. ` +
            `يرجى تقديم رقم مرجع ODK ولقطات شاشة الإرسال كدليل. ` +
            `تواصل مع ${adminName} أو مشرفك.${noteAppend ? ' ملاحظة: ' + adminNote.trim() : ''}`,
          priority: 'high',
          entityType: 'mmp',
          entityId: mmpId,
          actionUrl: `/my-sites?mmp=${mmpId}`,
          sendWhatsApp: true,
          sendEmail: false,
          triggeredBy: currentUser.id,
          triggeredByName: adminName,
        });
      }

      setSent(true);
      toast({
        title: 'Evidence requests sent',
        description: `Notified ${uniqueEnumerators.length} enumerator${uniqueEnumerators.length !== 1 ? 's' : ''} about ${unconfirmed.length} unconfirmed site${unconfirmed.length !== 1 ? 's' : ''}.`,
      });
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleExportNoMatch = () => {
    const rows = noMatchWFPRows.map(r => ({
      'WFP Site Name':   r.wfp_site_name || '',
      'WFP State':       r.wfp_state || '',
      'WFP Locality':    r.wfp_locality || '',
      'WFP Partner':     r.wfp_partner || '',
      'WFP Activity':    r.wfp_activity || '',
      'Match Score':     r.match_score != null ? `${Math.round(r.match_score * 100)}%` : '',
      'Notes':           r.match_notes || '',
      'Outcome':         r.outcome,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Message: 'No unmatched WFP rows' }]);
    ws['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 12 }, { wch: 30 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, 'WFP No-Match');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `wfp-no-match-${mmpId.slice(0, 8)}-${dateStr}.xlsx`);
    toast({ title: 'Report downloaded', description: `${rows.length} WFP rows with no PACT match.` });
  };

  return (
    <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          Bulk Actions
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {!loading && unconfirmed.length > 0 && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
              {unconfirmed.length} site{unconfirmed.length !== 1 ? 's' : ''} unconfirmed
            </Badge>
          )}
          <span dir="rtl" className="text-xs font-normal text-muted-foreground">إجراءات جماعية</span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {!loading && unconfirmed.length > 0 && (
          <>
            <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-700 dark:text-amber-300">
                <strong>{unconfirmed.length} PACT site{unconfirmed.length !== 1 ? 's' : ''}</strong>{' '}
                across{' '}
                <strong>{uniqueEnumerators.length} enumerator{uniqueEnumerators.length !== 1 ? 's' : ''}</strong>{' '}
                are not confirmed in the WFP file.
                Sending evidence requests will ask them to provide their ODK reference number.
              </AlertDescription>
            </Alert>

            {/* Enumerator summary */}
            <div className="space-y-1.5">
              {uniqueEnumerators.slice(0, 4).map(enumId => (
                <div key={enumId} className="flex items-start gap-2 text-xs">
                  <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground mt-0.5" />
                  <div>
                    <span className="font-medium">{byEnumerator[enumId].name}</span>
                    <span className="text-muted-foreground ml-1.5">
                      — {byEnumerator[enumId].sites.slice(0, 3).join(', ')}
                      {byEnumerator[enumId].sites.length > 3 && ` +${byEnumerator[enumId].sites.length - 3} more`}
                    </span>
                  </div>
                </div>
              ))}
              {uniqueEnumerators.length > 4 && (
                <p className="text-xs text-muted-foreground pl-5">
                  + {uniqueEnumerators.length - 4} more enumerators
                </p>
              )}
            </div>

            {/* Note field */}
            <div className="space-y-1">
              <Label className="text-xs">
                Note to enumerators{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="e.g. Please send your ODK screenshot to your supervisor by Thursday…"
                className="min-h-[52px] text-xs"
                data-testid="input-bulk-note"
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {unconfirmed.length > 0 && (
            sent ? (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 gap-1 px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Requests sent to {uniqueEnumerators.length} enumerator{uniqueEnumerators.length !== 1 ? 's' : ''}
              </Badge>
            ) : (
              <Button
                size="sm"
                onClick={handleSendEvidenceRequests}
                disabled={sending || loading}
                className="bg-amber-600 hover:bg-amber-700 text-white"
                data-testid="button-bulk-evidence-request"
              >
                {sending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5 mr-1.5" />}
                Send Evidence Request to All ({uniqueEnumerators.length})
              </Button>
            )
          )}

          {noMatchWFPRows.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportNoMatch}
              data-testid="button-export-no-match"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export No-Match Report ({noMatchWFPRows.length})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
