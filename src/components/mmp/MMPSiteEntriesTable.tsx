
import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, Pencil, Check, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface MMPSiteEntriesTableProps {
  siteEntries: any[];
  onViewSiteDetail?: (site: any) => void;
  editable?: boolean;
  onUpdateSites?: (sites: any[]) => Promise<boolean> | void;
}

const MMPSiteEntriesTable = ({ siteEntries, onViewSiteDetail, editable = false, onUpdateSites }: MMPSiteEntriesTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [savingId, setSavingId] = useState<string | number | null>(null);

  // Normalize a row from either MMP siteEntries (camelCase) or site_visits (snake_case)
  const normalizeSite = (site: any) => {
    // visit_data may be stored as JSON or stringified JSON
    const vd = site?.visit_data
      ? (typeof site.visit_data === 'string' ? (() => { try { return JSON.parse(site.visit_data); } catch { return undefined; } })() : site.visit_data)
      : undefined;

    // additionalData may contain the actual uploaded data
    const ad = site?.additionalData || {};

    // Monitoring Plan Structure Fields - check multiple sources including additionalData
    const hubOffice = site.hubOffice || site.hub_office || vd?.hubOffice || ad['Hub Office'] || ad['Hub Office:'] || '—';
    const state = site.state || site.state_name || vd?.state || ad['State'] || ad['State:'] || '—';
    const locality = site.locality || site.locality_name || vd?.locality || ad['Locality'] || ad['Locality:'] || '—';
    const siteName = site.siteName || site.site_name || vd?.siteName || ad['Site Name'] || ad['Site Name:'] || '—';
    const cpName = site.cpName || site.cp_name || vd?.cpName || ad['CP Name'] || ad['CP name'] || ad['CP Name:'] || '—';
    const siteActivity = site.siteActivity || site.activity_at_site || site.activity || vd?.siteActivity || ad['Activity at the site'] || ad['Activity at Site'] || ad['Activity at the site:'] || '—';
    const monitoringBy = site.monitoringBy || site.monitoring_by || vd?.monitoringBy || ad['monitoring by'] || ad['monitoring by:'] || ad['Monitoring By'] || '—';
    const surveyTool = site.surveyTool || site.survey_tool || vd?.surveyTool || ad['Survey under Master tool'] || ad['Survey under Master tool:'] || ad['Survey Tool'] || '—';
    const useMarketDiversion = site.useMarketDiversion || site.use_market_diversion || vd?.useMarketDiversion || 
      (ad['Use Market Diversion Monitoring'] === 'Yes' || ad['Use Market Diversion Monitoring'] === 'true' || ad['Use Market Diversion Monitoring'] === '1') || false;
    const useWarehouseMonitoring = site.useWarehouseMonitoring || site.use_warehouse_monitoring || vd?.useWarehouseMonitoring || 
      (ad['Use Warehouse Monitoring'] === 'Yes' || ad['Use Warehouse Monitoring'] === 'true' || ad['Use Warehouse Monitoring'] === '1') || false;

    // Additional fields
    const mainActivity = site.main_activity || site.mainActivity || vd?.mainActivity || '—';
    const visitType = site.visitType || vd?.visitType || '—';

    const rawDate = site.due_date || site.visitDate || '';
    let visitDate = '—';
    if (rawDate) {
      const d = new Date(rawDate);
      visitDate = isNaN(d.getTime()) ? String(rawDate) : d.toISOString().split('T')[0];
    }

    const comments = site.comments || site.notes || '—';
    const fees = (site.fees || vd?.fees) || {};
    const cost = site.cost ?? site.price ?? vd?.cost ?? vd?.price ?? fees.total ?? fees.amount ?? ad['Cost'] ?? ad['Price'] ?? ad['Amount'] ?? '—';
    const verifiedBy = site.verified_by || ad['Verified By'] || ad['Verified By:'] || undefined;
    const verifiedAt = site.verified_at || ad['Verified At'] || ad['Verified At:'] || undefined;
    const verificationNotes = site.verification_notes || ad['Verification Notes'] || ad['Verification Notes:'] || undefined;
    const status = site.status || ad['Status'] || ad['Status:'] || 'Pending';

    return { 
      hubOffice, state, locality, siteName, cpName, siteActivity, 
      monitoringBy, surveyTool, useMarketDiversion, useWarehouseMonitoring,
      mainActivity, visitType, visitDate, comments, cost, verifiedBy, verifiedAt, verificationNotes, status
    };
  };

  const handleView = (site: any) => {
    if (onViewSiteDetail) {
      onViewSiteDetail(site);
      return;
    }
    setSelectedSite(site);
    setDetailOpen(true);
  };

  const filteredSites = searchQuery.trim() === ""
    ? siteEntries
    : siteEntries.filter(site => {
        const s = normalizeSite(site);
        const q = searchQuery.toLowerCase();
        return [s.hubOffice, s.state, s.locality, s.siteName, s.cpName, s.siteActivity, s.monitoringBy, s.surveyTool, s.visitDate, s.comments]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      });

  const toBool = (v: any) => {
    if (typeof v === 'boolean') return v;
    const s = String(v || '').toLowerCase();
    return s === 'yes' || s === 'true' || s === '1';
  };

  const startEdit = (site: any) => {
    const row = normalizeSite(site);
    setEditingId(site.id ?? site._key ?? site.siteCode ?? Math.random());
    setDraft({ ...row });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const applyDraftToSite = (site: any, d: any) => {
    const updated = { ...site };
    // Update top-level canonical fields if present or attach
    updated.hubOffice = d.hubOffice;
    updated.state = d.state;
    updated.locality = d.locality;
    updated.siteName = d.siteName;
    updated.cpName = d.cpName;
    updated.siteActivity = d.siteActivity;
    updated.monitoringBy = d.monitoringBy;
    updated.surveyTool = d.surveyTool;
    updated.useMarketDiversion = toBool(d.useMarketDiversion);
    updated.useWarehouseMonitoring = toBool(d.useWarehouseMonitoring);
    updated.visitDate = d.visitDate;
    updated.comments = d.comments;
    if (typeof d.cost !== 'undefined') {
      const n = d.cost === '—' || d.cost === '' ? undefined : Number(d.cost);
      updated.cost = isNaN(n as number) ? d.cost : n;
    }
    if (typeof d.status !== 'undefined') {
      updated.status = d.status;
    }
    
    // Update verification fields
    if (typeof d.verifiedBy !== 'undefined') {
      updated.verified_by = d.verifiedBy;
    }
    if (typeof d.verifiedAt !== 'undefined') {
      updated.verified_at = d.verifiedAt;
    }
    if (typeof d.verificationNotes !== 'undefined') {
      updated.verification_notes = d.verificationNotes;
    }

    // Mirror into additionalData for compatibility
    const ad = { ...(site.additionalData || {}) };
    ad['Hub Office'] = d.hubOffice;
    ad['State'] = d.state;
    ad['Locality'] = d.locality;
    ad['Site Name'] = d.siteName;
    ad['CP Name'] = d.cpName;
    ad['Activity at Site'] = d.siteActivity;
    ad['Monitoring By'] = d.monitoringBy;
    ad['Survey Tool'] = d.surveyTool;
    ad['Use Market Diversion Monitoring'] = toBool(d.useMarketDiversion) ? 'Yes' : 'No';
    ad['Use Warehouse Monitoring'] = toBool(d.useWarehouseMonitoring) ? 'Yes' : 'No';
    ad['Visit Date'] = d.visitDate;
    ad['Comments'] = d.comments;
    if (typeof d.cost !== 'undefined') {
      ad['Cost'] = d.cost;
    }
    if (typeof d.verifiedBy !== 'undefined') {
      ad['Verified By'] = d.verifiedBy;
    }
    if (typeof d.verifiedAt !== 'undefined') {
      ad['Verified At'] = d.verifiedAt;
    }
    if (typeof d.verificationNotes !== 'undefined') {
      ad['Verification Notes'] = d.verificationNotes;
    }
    updated.additionalData = ad;
    return updated;
  };

  const saveEdit = async (site: any) => {
    if (!draft) return;
    const next = (siteEntries || []).map(s => (s === site ? applyDraftToSite(s, draft) : s));
    try {
      setSavingId(site.id ?? site._key ?? 'saving');
      const res = onUpdateSites?.(next);
      const ok = typeof res === 'object' && typeof (res as Promise<boolean>).then === 'function'
        ? await (res as Promise<boolean>)
        : true;
      if (ok) {
        setEditingId(null);
        setDraft(null);
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>MMP Site Entries</CardTitle>
            <CardDescription>
              Total: {siteEntries.length} sites | 
              Visited: {siteEntries.filter(site => site.siteVisited).length} | 
              Pending: {siteEntries.filter(site => !site.siteVisited).length}
            </CardDescription>
          </div>
          <div className="w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search sites..."
                className="pl-8 w-full sm:w-[300px]"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border w-full overflow-x-auto">
          <div className="min-w-[1700px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Hub Office</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Locality</TableHead>
                <TableHead>Site Name</TableHead>
                <TableHead>CP Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Activity at Site</TableHead>
                <TableHead>Monitoring By</TableHead>
                <TableHead>Survey Tool</TableHead>
                <TableHead>Market Diversion</TableHead>
                <TableHead>Warehouse Monitoring</TableHead>
                <TableHead>Visit Date</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Verified By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSites.length > 0 ? (
                filteredSites.map((site, idx) => {
                  const row = normalizeSite(site);
                  const isEditing = editable && (editingId === (site.id ?? site._key ?? site.siteCode));
                  return (
                    <TableRow key={site.id ?? site.siteCode ?? site._key ?? idx} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs">
                        {isEditing ? (
                          <Input value={draft?.hubOffice ?? row.hubOffice ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), hubOffice: e.target.value}))} className="h-8" />
                        ) : row.hubOffice}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.state ?? row.state ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), state: e.target.value}))} className="h-8" />
                        ) : row.state}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.locality ?? row.locality ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), locality: e.target.value}))} className="h-8" />
                        ) : row.locality}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.siteName ?? row.siteName ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), siteName: e.target.value}))} className="h-8" />
                        ) : row.siteName}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.cpName ?? row.cpName ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), cpName: e.target.value}))} className="h-8" />
                        ) : row.cpName}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.status ?? row.status ?? 'Pending'} onChange={(e) => setDraft((d:any)=> ({...(d||{}), status: e.target.value}))} className="h-8" />
                        ) : (
                          <Badge 
                            className={
                              row.status?.toLowerCase() === 'verified' ? 'bg-green-100 text-green-700' :
                              row.status?.toLowerCase() === 'rejected' ? 'bg-red-100 text-red-700' :
                              row.status?.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                              row.status?.toLowerCase() === 'approved' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }
                          >
                            {row.status || 'Pending'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.siteActivity ?? row.siteActivity ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), siteActivity: e.target.value}))} className="h-8" />
                        ) : row.siteActivity}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.monitoringBy ?? row.monitoringBy ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), monitoringBy: e.target.value}))} className="h-8" />
                        ) : row.monitoringBy}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.surveyTool ?? row.surveyTool ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), surveyTool: e.target.value}))} className="h-8" />
                        ) : row.surveyTool}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={toBool(draft?.useMarketDiversion ?? row.useMarketDiversion)}
                              onCheckedChange={(v) => setDraft((d:any)=> ({...(d||{}), useMarketDiversion: Boolean(v)}))}
                            />
                            <span className="text-xs">Yes</span>
                          </div>
                        ) : (row.useMarketDiversion ? 'Yes' : 'No')}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={toBool(draft?.useWarehouseMonitoring ?? row.useWarehouseMonitoring)}
                              onCheckedChange={(v) => setDraft((d:any)=> ({...(d||{}), useWarehouseMonitoring: Boolean(v)}))}
                            />
                            <span className="text-xs">Yes</span>
                          </div>
                        ) : (row.useWarehouseMonitoring ? 'Yes' : 'No')}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.visitDate ?? row.visitDate ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), visitDate: e.target.value}))} className="h-8" />
                        ) : row.visitDate}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            value={draft?.cost ?? (Number.isFinite(Number(row.cost)) ? Number(row.cost) : '')}
                            onChange={(e) => setDraft((d:any)=> ({...(d||{}), cost: e.target.value}))}
                            className="h-8"
                          />
                        ) : (
                          (row.cost !== '—' && row.cost !== undefined && row.cost !== null && String(row.cost) !== '')
                            ? `${Number(row.cost).toLocaleString()}`
                            : '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input value={draft?.comments ?? row.comments ?? ''} onChange={(e) => setDraft((d:any)=> ({...(d||{}), comments: e.target.value}))} className="h-8" />
                        ) : row.comments}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="space-y-2">
                            <Input 
                              value={draft?.verifiedBy ?? row.verifiedBy ?? ''} 
                              onChange={(e) => setDraft((d:any)=> ({...(d||{}), verifiedBy: e.target.value}))} 
                              placeholder="Coordinator name"
                              className="h-8" 
                            />
                            <Input 
                              type="date"
                              value={draft?.verifiedAt ? new Date(draft.verifiedAt).toISOString().split('T')[0] : (row.verifiedAt ? new Date(row.verifiedAt).toISOString().split('T')[0] : '')} 
                              onChange={(e) => {
                                const date = e.target.value ? new Date(e.target.value).toISOString() : '';
                                setDraft((d:any)=> ({...(d||{}), verifiedAt: date}));
                              }} 
                              className="h-8" 
                            />
                            <Input 
                              value={draft?.verificationNotes ?? row.verificationNotes ?? ''} 
                              onChange={(e) => setDraft((d:any)=> ({...(d||{}), verificationNotes: e.target.value}))} 
                              placeholder="Verification notes"
                              className="h-8" 
                            />
                          </div>
                        ) : (
                          row.verifiedBy ? (
                            <div>
                              <div className="font-medium">{row.verifiedBy}</div>
                              {row.verifiedAt && (
                                <div className="text-xs text-muted-foreground">
                                  {new Date(row.verifiedAt).toLocaleDateString()}
                                </div>
                              )}
                              {row.verificationNotes && (
                                <div className="text-xs text-muted-foreground mt-1" title={row.verificationNotes}>
                                  {row.verificationNotes.length > 30 
                                    ? `${row.verificationNotes.substring(0, 30)}...` 
                                    : row.verificationNotes}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        )}
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          isEditing ? (
                            <div className="flex items-center gap-2">
                              <Button size="sm" onClick={() => saveEdit(site)} disabled={savingId === (site.id ?? site._key ?? 'saving')} className="inline-flex items-center gap-1">
                                <Check className="h-4 w-4" /> {savingId === (site.id ?? site._key ?? 'saving') ? 'Saving...' : 'Save'}
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelEdit} className="inline-flex items-center gap-1">
                                <X className="h-4 w-4" /> Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => startEdit(site)}
                                className="inline-flex items-center gap-1">
                                <Pencil className="h-4 w-4" />
                                Edit
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleView(site)}
                                className="hover:bg-muted inline-flex items-center gap-1">
                                <Eye className="h-4 w-4" />
                                View
                              </Button>
                            </div>
                          )
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleView(site)}
                            className="hover:bg-muted inline-flex items-center gap-1">
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={15} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </CardContent>

      {/* Local fallback dialog for site detail view */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{(selectedSite && normalizeSite(selectedSite).siteName) || 'Site Details'}</DialogTitle>
          </DialogHeader>
          {selectedSite && (() => {
            const row = normalizeSite(selectedSite);
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Hub Office</p>
                  <p className="font-medium">{row.hubOffice || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">State</p>
                  <p className="font-medium">{row.state || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Locality</p>
                  <p className="font-medium">{row.locality || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Site Name</p>
                  <p className="font-medium">{row.siteName || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">CP Name</p>
                  <p className="font-medium">{row.cpName || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Activity at Site</p>
                  <p className="font-medium">{row.siteActivity || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Monitoring By</p>
                  <p className="font-medium">{row.monitoringBy || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Survey Tool</p>
                  <p className="font-medium">{row.surveyTool || '—'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Market Diversion</p>
                  <p className="font-medium">{row.useMarketDiversion ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Warehouse Monitoring</p>
                  <p className="font-medium">{row.useWarehouseMonitoring ? 'Yes' : 'No'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Visit Date</p>
                  <p className="font-medium">{row.visitDate || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-sm text-muted-foreground">Comments</p>
                  <p className="font-medium">{row.comments || '—'}</p>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MMPSiteEntriesTable;

