
import React, { useState, useEffect, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, Pencil, Check, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface MMPSiteEntriesTableProps {
  siteEntries: any[];
  onViewSiteDetail?: (site: any) => void;
  editable?: boolean;
  onUpdateSites?: (sites: any[]) => Promise<boolean> | void;
}

const MMPSiteEntriesTable = ({ siteEntries, onViewSiteDetail, editable = false, onUpdateSites }: MMPSiteEntriesTableProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(50); // Show 50 items per page
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [draft, setDraft] = useState<any | null>(null);
  const [savingId, setSavingId] = useState<string | number | null>(null);

  // Debounce search query to reduce filtering operations
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setCurrentPage(1); // Reset to first page when search changes
    }, 300); // 300ms debounce delay

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Normalize a row from either MMP siteEntries (camelCase) or mmp_site_entries (snake_case)
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
    
    // Extract enumerator_fee and transport_fee from additional_data or calculate from cost
    const enumeratorFee = site.enumerator_fee ?? ad['Enumerator Fee'] ?? ad['enumerator_fee'] ?? 
      (site.additional_data?.enumerator_fee ? Number(site.additional_data.enumerator_fee) : undefined);
    const transportFee = site.transport_fee ?? ad['Transport Fee'] ?? ad['transport_fee'] ?? 
      (site.additional_data?.transport_fee ? Number(site.additional_data.transport_fee) : undefined);
    
    // If we have separate fees, use them; otherwise try to extract from cost or use cost directly
    let finalEnumeratorFee = enumeratorFee;
    let finalTransportFee = transportFee;
    
    // If we have cost but not separate fees, and cost is 30 (default), split it
    const cost = site.cost ?? site.price ?? vd?.cost ?? vd?.price ?? fees.total ?? fees.amount ?? ad['Cost'] ?? ad['Price'] ?? ad['Amount'];
    if (cost && (!finalEnumeratorFee || !finalTransportFee)) {
      // If cost is 30 (default), split into 20 + 10
      if (Number(cost) === 30) {
        finalEnumeratorFee = finalEnumeratorFee ?? 20;
        finalTransportFee = finalTransportFee ?? 10;
      } else if (cost && !finalEnumeratorFee && !finalTransportFee) {
        // If we have cost but no separate fees, try to infer or use defaults
        // For now, if cost exists and is not 30, we'll let user set fees manually
        finalEnumeratorFee = finalEnumeratorFee ?? (cost ? Number(cost) - 10 : undefined);
        finalTransportFee = finalTransportFee ?? 10;
      }
    }
    
    // Calculate total cost from fees if both exist, otherwise use cost
    const totalCost = (finalEnumeratorFee && finalTransportFee) 
      ? Number(finalEnumeratorFee) + Number(finalTransportFee)
      : (cost ? Number(cost) : undefined);
    
    // Read from new columns first, then fallback to additional_data for backward compatibility
    const verifiedBy = site.verified_by || ad['Verified By'] || ad['Verified By:'] || undefined;
    const verifiedAt = site.verified_at || (ad['Verified At'] ? new Date(ad['Verified At']).toISOString() : undefined) || (ad['verified_at'] ? new Date(ad['verified_at']).toISOString() : undefined) || undefined;
    const verificationNotes = site.verification_notes || ad['Verification Notes'] || ad['Verification Notes:'] || undefined;
    const status = site.status || ad['Status'] || ad['Status:'] || 'Pending';
    
    // Dispatch information - read from new columns first
    const dispatchedAt = site.dispatched_at || (ad['dispatched_at'] ? new Date(ad['dispatched_at']).toISOString() : undefined) || (ad['Dispatched At'] ? new Date(ad['Dispatched At']).toISOString() : undefined) || undefined;
    const dispatchedBy = site.dispatched_by || ad['dispatched_by'] || ad['Dispatched By'] || undefined;
    
    // Acceptance information - read from new columns first
    const acceptedAt = site.accepted_at || (ad['accepted_at'] ? new Date(ad['accepted_at']).toISOString() : undefined) || (ad['Accepted At'] ? new Date(ad['Accepted At']).toISOString() : undefined) || undefined;
    const acceptedBy = site.accepted_by || ad['accepted_by'] || ad['Accepted By'] || undefined;
    
    // Timestamps
    const createdAt = site.created_at || undefined;
    const updatedAt = site.updated_at || site.last_modified || undefined;

    return { 
      hubOffice, state, locality, siteName, cpName, siteActivity, 
      monitoringBy, surveyTool, useMarketDiversion, useWarehouseMonitoring,
      mainActivity, visitType, visitDate, comments, 
      enumeratorFee: finalEnumeratorFee, transportFee: finalTransportFee, cost: totalCost,
      verifiedBy, verifiedAt, verificationNotes, status,
      dispatchedAt, dispatchedBy, acceptedAt, acceptedBy, createdAt, updatedAt
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

  // Memoize filtered sites for performance
  const filteredSites = useMemo(() => {
    if (debouncedSearchQuery.trim() === "") {
      return siteEntries;
    }
    const q = debouncedSearchQuery.toLowerCase();
    return siteEntries.filter(site => {
      const s = normalizeSite(site);
      return [s.hubOffice, s.state, s.locality, s.siteName, s.cpName, s.siteActivity, s.monitoringBy, s.surveyTool, s.visitDate, s.comments]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [siteEntries, debouncedSearchQuery]);

  // Paginate filtered results
  const paginatedSites = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredSites.slice(startIndex, endIndex);
  }, [filteredSites, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredSites.length / itemsPerPage);

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

  // Migration helper: Move data from additional_data to columns if column is empty
  const migrateAdditionalDataToColumns = (entry: any): any => {
    const migrated = { ...entry };
    const ad = migrated.additional_data || migrated.additionalData || {};
    
    const columnMappings: Record<string, string> = {
      'Site Code': 'site_code', 'site_code': 'site_code', 'siteCode': 'site_code',
      'Hub Office': 'hub_office', 'Hub Office:': 'hub_office', 'hub_office': 'hub_office', 'hubOffice': 'hub_office',
      'State': 'state', 'State:': 'state', 'state': 'state', 'state_name': 'state',
      'Locality': 'locality', 'Locality:': 'locality', 'locality': 'locality', 'locality_name': 'locality',
      'Site Name': 'site_name', 'Site Name:': 'site_name', 'site_name': 'site_name', 'siteName': 'site_name',
      'CP Name': 'cp_name', 'CP name': 'cp_name', 'CP Name:': 'cp_name', 'cp_name': 'cp_name', 'cpName': 'cp_name',
      'Visit Type': 'visit_type', 'visit_type': 'visit_type', 'visitType': 'visit_type',
      'Visit Date': 'visit_date', 'visit_date': 'visit_date', 'visitDate': 'visit_date',
      'Main Activity': 'main_activity', 'main_activity': 'main_activity', 'mainActivity': 'main_activity',
      'Activity at Site': 'activity_at_site', 'Activity at the site': 'activity_at_site', 'Activity at the site:': 'activity_at_site',
      'activity_at_site': 'activity_at_site', 'siteActivity': 'activity_at_site',
      'Monitoring By': 'monitoring_by', 'monitoring by': 'monitoring_by', 'monitoring by:': 'monitoring_by',
      'monitoring_by': 'monitoring_by', 'monitoringBy': 'monitoring_by',
      'Survey Tool': 'survey_tool', 'Survey under Master tool': 'survey_tool', 'Survey under Master tool:': 'survey_tool',
      'survey_tool': 'survey_tool', 'surveyTool': 'survey_tool',
      'Use Market Diversion Monitoring': 'use_market_diversion', 'use_market_diversion': 'use_market_diversion', 'useMarketDiversion': 'use_market_diversion',
      'Use Warehouse Monitoring': 'use_warehouse_monitoring', 'use_warehouse_monitoring': 'use_warehouse_monitoring', 'useWarehouseMonitoring': 'use_warehouse_monitoring',
      'Comments': 'comments', 'comments': 'comments',
      'Cost': 'cost', 'Price': 'cost', 'Amount': 'cost', 'cost': 'cost', 'price': 'cost',
      'Enumerator Fee': 'enumerator_fee', 'enumerator_fee': 'enumerator_fee',
      'Transport Fee': 'transport_fee', 'transport_fee': 'transport_fee',
      'Verification Notes': 'verification_notes', 'Verification Notes:': 'verification_notes', 'verification_notes': 'verification_notes',
      'Verified By': 'verified_by', 'Verified By:': 'verified_by', 'verified_by': 'verified_by',
      'Verified At': 'verified_at', 'verified_at': 'verified_at',
      'Dispatched By': 'dispatched_by', 'dispatched_by': 'dispatched_by',
      'Dispatched At': 'dispatched_at', 'dispatched_at': 'dispatched_at',
      'Accepted By': 'accepted_by', 'accepted_by': 'accepted_by',
      'Accepted At': 'accepted_at', 'accepted_at': 'accepted_at',
      'Status': 'status', 'Status:': 'status', 'status': 'status',
    };

    const toBool = (v: any): boolean | null => {
      if (typeof v === 'boolean') return v;
      if (v === null || v === undefined || v === '') return null;
      const s = String(v).toLowerCase().trim();
      return s === 'yes' || s === 'true' || s === '1' || s === 'y';
    };

    const toNum = (v: any): number | null => {
      if (v === null || v === undefined || v === '') return null;
      if (typeof v === 'number') return v;
      const s = String(v).replace(/[^0-9.\-]/g, '');
      if (!s) return null;
      const n = parseFloat(s);
      return isNaN(n) ? null : n;
    };

    const toDate = (v: any): string | null => {
      if (!v) return null;
      try {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d.toISOString();
      } catch {
        return null;
      }
    };

    for (const [adKey, columnName] of Object.entries(columnMappings)) {
      const columnValue = migrated[columnName];
      const adValue = ad[adKey];
      
      if ((columnValue === null || columnValue === undefined || columnValue === '') && 
          adValue !== null && adValue !== undefined && adValue !== '') {
        if (columnName === 'use_market_diversion' || columnName === 'use_warehouse_monitoring') {
          const boolVal = toBool(adValue);
          if (boolVal !== null) migrated[columnName] = boolVal;
        } else if (columnName === 'cost' || columnName === 'enumerator_fee' || columnName === 'transport_fee') {
          const numVal = toNum(adValue);
          if (numVal !== null) migrated[columnName] = numVal;
        } else if (columnName === 'verified_at' || columnName === 'dispatched_at') {
          const dateVal = toDate(adValue);
          if (dateVal !== null) migrated[columnName] = dateVal;
        } else {
          migrated[columnName] = String(adValue).trim();
        }
      }
    }

    return migrated;
  };

  const applyDraftToSite = (site: any, d: any) => {
    // First migrate data from additional_data to columns
    const migratedSite = migrateAdditionalDataToColumns(site);
    const updated = { ...migratedSite };
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
    
    // Handle enumerator_fee and transport_fee separately
    let enumFeeNum: number | undefined;
    let transFeeNum: number | undefined;
    
    // Get existing fees from multiple possible locations
    const existingEnumFee = site.enumerator_fee ?? (site.additional_data?.enumerator_fee ? Number(site.additional_data.enumerator_fee) : undefined) ?? (site.additionalData?.['Enumerator Fee'] ? Number(site.additionalData['Enumerator Fee']) : undefined);
    const existingTransFee = site.transport_fee ?? (site.additional_data?.transport_fee ? Number(site.additional_data.transport_fee) : undefined) ?? (site.additionalData?.['Transport Fee'] ? Number(site.additionalData['Transport Fee']) : undefined);
    
    if (typeof d.enumeratorFee !== 'undefined') {
      const enumFee = d.enumeratorFee === '—' || d.enumeratorFee === '' ? undefined : Number(d.enumeratorFee);
      enumFeeNum = !isNaN(enumFee as number) ? enumFee : undefined;
      updated.enumerator_fee = enumFeeNum;
      // Store in additional_data as well
      if (!updated.additional_data) updated.additional_data = {};
      updated.additional_data.enumerator_fee = updated.enumerator_fee;
    } else {
      // Preserve existing enumerator_fee if not being edited
      enumFeeNum = existingEnumFee;
      if (enumFeeNum !== undefined) {
        updated.enumerator_fee = enumFeeNum;
        if (!updated.additional_data) updated.additional_data = {};
        updated.additional_data.enumerator_fee = enumFeeNum;
      }
    }
    
    if (typeof d.transportFee !== 'undefined') {
      const transFee = d.transportFee === '—' || d.transportFee === '' ? undefined : Number(d.transportFee);
      transFeeNum = !isNaN(transFee as number) ? transFee : undefined;
      updated.transport_fee = transFeeNum;
      // Store in additional_data as well
      if (!updated.additional_data) updated.additional_data = {};
      updated.additional_data.transport_fee = updated.transport_fee;
    } else {
      // Preserve existing transport_fee if not being edited
      transFeeNum = existingTransFee;
      if (transFeeNum !== undefined) {
        updated.transport_fee = transFeeNum;
        if (!updated.additional_data) updated.additional_data = {};
        updated.additional_data.transport_fee = transFeeNum;
      }
    }
    
    // Always calculate total cost from fees if both are available
    if (enumFeeNum !== undefined && transFeeNum !== undefined) {
      updated.cost = Number(enumFeeNum) + Number(transFeeNum);
    } else if (typeof d.cost !== 'undefined') {
      // Fallback to explicit cost if provided
      const n = d.cost === '—' || d.cost === '' ? undefined : Number(d.cost);
      updated.cost = isNaN(n as number) ? d.cost : n;
    } else if (updated.cost === undefined && site.cost) {
      // Preserve existing cost if no fees and no new cost provided
      updated.cost = Number(site.cost);
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
    if (typeof d.enumeratorFee !== 'undefined') {
      ad['Enumerator Fee'] = d.enumeratorFee;
      ad['enumerator_fee'] = d.enumeratorFee;
    } else if (updated.enumerator_fee !== undefined) {
      ad['Enumerator Fee'] = updated.enumerator_fee;
      ad['enumerator_fee'] = updated.enumerator_fee;
    }
    if (typeof d.transportFee !== 'undefined') {
      ad['Transport Fee'] = d.transportFee;
      ad['transport_fee'] = d.transportFee;
    } else if (updated.transport_fee !== undefined) {
      ad['Transport Fee'] = updated.transport_fee;
      ad['transport_fee'] = updated.transport_fee;
    }
    // Always include calculated cost in additional_data
    if (updated.cost !== undefined) {
      ad['Cost'] = updated.cost;
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
              Showing {paginatedSites.length} of {filteredSites.length} sites
              {debouncedSearchQuery && ` (filtered from ${siteEntries.length} total)`}
              {!debouncedSearchQuery && ` (${siteEntries.length} total)`}
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
          <div className="min-w-[2400px]">
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
                <TableHead>Enumerator Fee</TableHead>
                <TableHead>Transport Fee</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Verified By</TableHead>
                <TableHead>Verified At</TableHead>
                <TableHead>Verification Notes</TableHead>
                <TableHead>Dispatched At</TableHead>
                <TableHead>Dispatched By</TableHead>
                <TableHead>Accepted At</TableHead>
                <TableHead>Accepted By</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedSites.length > 0 ? (
                paginatedSites.map((site, idx) => {
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
                              row.status?.toLowerCase() === 'accepted' ? 'bg-purple-100 text-purple-700' :
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
                            step="0.01"
                            value={draft?.enumeratorFee ?? (Number.isFinite(Number(row.enumeratorFee)) ? Number(row.enumeratorFee) : '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraft((d:any)=> {
                                const newDraft = {...(d||{}), enumeratorFee: val};
                                // Auto-calculate total cost
                                const enumFee = Number(val) || 0;
                                const transFee = Number(d?.transportFee ?? row.transportFee ?? 0);
                                newDraft.cost = enumFee + transFee;
                                return newDraft;
                              });
                            }}
                            className="h-8"
                            placeholder="20"
                          />
                        ) : (
                          (row.enumeratorFee !== undefined && row.enumeratorFee !== null && String(row.enumeratorFee) !== '')
                            ? `$${Number(row.enumeratorFee).toLocaleString()}`
                            : '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="10"
                            max="25"
                            value={draft?.transportFee ?? (Number.isFinite(Number(row.transportFee)) ? Number(row.transportFee) : '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraft((d:any)=> {
                                const newDraft = {...(d||{}), transportFee: val};
                                // Auto-calculate total cost
                                const enumFee = Number(d?.enumeratorFee ?? row.enumeratorFee ?? 0);
                                const transFee = Number(val) || 0;
                                newDraft.cost = enumFee + transFee;
                                return newDraft;
                              });
                            }}
                            className="h-8"
                            placeholder="10"
                          />
                        ) : (
                          (row.transportFee !== undefined && row.transportFee !== null && String(row.transportFee) !== '')
                            ? `$${Number(row.transportFee).toLocaleString()}`
                            : '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="font-semibold text-blue-600">
                            ${((Number(draft?.enumeratorFee ?? row.enumeratorFee ?? 0)) + (Number(draft?.transportFee ?? row.transportFee ?? 0))).toLocaleString()}
                          </div>
                        ) : (
                          (row.cost !== undefined && row.cost !== null && String(row.cost) !== '' && String(row.cost) !== '—')
                            ? `$${Number(row.cost).toLocaleString()}`
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
                          <Input 
                            value={draft?.status ?? row.status ?? ''} 
                            onChange={(e) => setDraft((d:any)=> ({...(d||{}), status: e.target.value}))} 
                            className="h-8" 
                          />
                        ) : (
                          <Badge variant={row.status === 'Verified' ? 'default' : row.status === 'Dispatched' ? 'secondary' : 'outline'}>
                            {row.status || 'Pending'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input 
                            value={draft?.verifiedBy ?? row.verifiedBy ?? ''} 
                            onChange={(e) => setDraft((d:any)=> ({...(d||{}), verifiedBy: e.target.value}))} 
                            placeholder="Coordinator name"
                            className="h-8" 
                          />
                        ) : (
                          row.verifiedBy ? (
                            <div className="font-medium">{row.verifiedBy}</div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input 
                            type="date"
                            value={draft?.verifiedAt ? new Date(draft.verifiedAt).toISOString().split('T')[0] : (row.verifiedAt ? new Date(row.verifiedAt).toISOString().split('T')[0] : '')} 
                            onChange={(e) => {
                              const date = e.target.value ? new Date(e.target.value).toISOString() : '';
                              setDraft((d:any)=> ({...(d||{}), verifiedAt: date}));
                            }} 
                            className="h-8" 
                          />
                        ) : (
                          row.verifiedAt ? (
                            <div className="text-sm">
                              {new Date(row.verifiedAt).toLocaleDateString()}
                              <div className="text-xs text-muted-foreground">
                                {new Date(row.verifiedAt).toLocaleTimeString()}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input 
                            value={draft?.verificationNotes ?? row.verificationNotes ?? ''} 
                            onChange={(e) => setDraft((d:any)=> ({...(d||{}), verificationNotes: e.target.value}))} 
                            placeholder="Verification notes"
                            className="h-8" 
                          />
                        ) : (
                          row.verificationNotes ? (
                            <div className="text-sm max-w-xs" title={row.verificationNotes}>
                              {row.verificationNotes.length > 50 
                                ? `${row.verificationNotes.substring(0, 50)}...` 
                                : row.verificationNotes}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )
                        )}
                      </TableCell>
                      <TableCell>
                        {row.dispatchedAt ? (
                          <div className="text-sm">
                            {new Date(row.dispatchedAt).toLocaleDateString()}
                            <div className="text-xs text-muted-foreground">
                              {new Date(row.dispatchedAt).toLocaleTimeString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.dispatchedBy ? (
                          <div className="font-medium text-sm">{row.dispatchedBy}</div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.acceptedAt ? (
                          <div className="text-sm">
                            {new Date(row.acceptedAt).toLocaleDateString()}
                            <div className="text-xs text-muted-foreground">
                              {new Date(row.acceptedAt).toLocaleTimeString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.acceptedBy ? (
                          <div className="font-medium text-sm">{row.acceptedBy}</div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.createdAt ? (
                          <div className="text-sm">
                            {new Date(row.createdAt).toLocaleDateString()}
                            <div className="text-xs text-muted-foreground">
                              {new Date(row.createdAt).toLocaleTimeString()}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
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
                  <TableCell colSpan={20} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </div>
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-2">
            <div className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <div className="text-sm">
                {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredSites.length)} of {filteredSites.length}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
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

