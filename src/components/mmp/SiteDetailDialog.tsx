import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Pencil, Save, X } from 'lucide-react';
import { ClaimSiteButton } from '@/components/site-visit/ClaimSiteButton';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import { calculateEnumeratorFeeForUser } from '@/hooks/use-claim-fee-calculation';

interface SiteDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: any;
  editable?: boolean;
  onUpdateSite?: (site: any) => Promise<boolean> | void;
  onAcceptSite?: (site: any) => void;
  onSendBackToCoordinator?: (site: any, comments: string) => void;
  currentUserId?: string;
  onClaimed?: () => void;
  enableFirstClaim?: boolean;
}

const SiteDetailDialog: React.FC<SiteDetailDialogProps> = ({
  open,
  onOpenChange,
  site,
  editable = false,
  onUpdateSite,
  onAcceptSite,
  onSendBackToCoordinator,
  currentUserId,
  onClaimed,
  enableFirstClaim = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackComments, setSendBackComments] = useState('');
  const { users } = useAppContext();
  const [acceptedByName, setAcceptedByName] = useState<string | null>(null);
  const [dispatchedByName, setDispatchedByName] = useState<string | null>(null);
  const [classificationFee, setClassificationFee] = useState<number | null>(null);

  // Normalize site data
  const normalizeSite = (site: any) => {
    if (!site) return null;
    
    const vd = site?.visit_data
      ? (typeof site.visit_data === 'string' ? (() => { try { return JSON.parse(site.visit_data); } catch { return undefined; } })() : site.visit_data)
      : undefined;

    const ad = site?.additionalData || site?.additional_data || {};

    const hubOffice = site.hubOffice || site.hub_office || vd?.hubOffice || ad['Hub Office'] || ad['Hub Office:'] || '';
    const state = site.state || site.state_name || vd?.state || ad['State'] || ad['State:'] || '';
    const locality = site.locality || site.locality_name || vd?.locality || ad['Locality'] || ad['Locality:'] || '';
    const siteCode = site.siteCode || site.site_code || vd?.siteCode || ad['Site Code'] || ad['Site Code:'] || '';
    const siteName = site.siteName || site.site_name || vd?.siteName || ad['Site Name'] || ad['Site Name:'] || '';
    const cpName = site.cpName || site.cp_name || vd?.cpName || ad['CP Name'] || ad['CP name'] || ad['CP Name:'] || '';
    const siteActivity = site.siteActivity || site.activity_at_site || site.activity || vd?.siteActivity || ad['Activity at the site'] || ad['Activity at Site'] || ad['Activity at the site:'] || '';
    const monitoringBy = site.monitoringBy || site.monitoring_by || vd?.monitoringBy || ad['monitoring by'] || ad['monitoring by:'] || ad['Monitoring By'] || '';
    const surveyTool = site.surveyTool || site.survey_tool || vd?.surveyTool || ad['Survey under Master tool'] || ad['Survey under Master tool:'] || ad['Survey Tool'] || '';
    const useMarketDiversion = site.useMarketDiversion || site.use_market_diversion || vd?.useMarketDiversion || 
      (ad['Use Market Diversion Monitoring'] === 'Yes' || ad['Use Market Diversion Monitoring'] === 'true' || ad['Use Market Diversion Monitoring'] === '1') || false;
    const useWarehouseMonitoring = site.useWarehouseMonitoring || site.use_warehouse_monitoring || vd?.useWarehouseMonitoring || 
      (ad['Use Warehouse Monitoring'] === 'Yes' || ad['Use Warehouse Monitoring'] === 'true' || ad['Use Warehouse Monitoring'] === '1') || false;

    const rawDate = site.due_date || site.visitDate || site.visit_date || '';
    let visitDate = '';
    if (rawDate) {
      const d = new Date(rawDate);
      visitDate = isNaN(d.getTime()) ? String(rawDate) : d.toISOString().split('T')[0];
    }

    const comments = site.comments || site.notes || '';
    
    const enumeratorFee = site.enumerator_fee;
    const transportFee = site.transport_fee;
    const cost = site.cost ?? site.price ?? vd?.cost ?? vd?.price;
    
    const displayedEnumeratorFee = (enumeratorFee !== undefined && enumeratorFee !== null)
      ? Number(enumeratorFee)
      : undefined; // show Pending when not set
    const displayedTransportFee = (transportFee !== undefined && transportFee !== null) ? Number(transportFee) : undefined;
    
    const totalCost = (displayedEnumeratorFee !== undefined && displayedTransportFee !== undefined)
      ? displayedEnumeratorFee + displayedTransportFee
      : (cost ? Number(cost) : undefined);

    const verifiedBy = site.verified_by || ad['Verified By'] || ad['Verified By:'] || undefined;
    const verifiedAt = site.verified_at || (ad['Verified At'] ? new Date(ad['Verified At']).toISOString() : undefined) || undefined;
    const verificationNotes = site.verification_notes || ad['Verification Notes'] || ad['Verification Notes:'] || undefined;
    const status = site.status || ad['Status'] || ad['Status:'] || 'Pending';
    
    const dispatchedAt = site.dispatched_at || (ad['dispatched_at'] ? new Date(ad['dispatched_at']).toISOString() : undefined) || undefined;
    const dispatchedBy = site.dispatched_by || ad['dispatched_by'] || ad['Dispatched By'] || undefined;
    
    const acceptedAt = site.accepted_at || (ad['accepted_at'] ? new Date(ad['accepted_at']).toISOString() : undefined) || undefined;
    const acceptedBy = site.accepted_by || ad['accepted_by'] || ad['Accepted By'] || undefined;
    
    const rejectionComments = site.rejection_comments || ad['rejection_comments'] || ad['rejection_reason'] || undefined;
    const rejectedBy = site.rejected_by || ad['rejected_by'] || undefined;
    const rejectedAt = site.rejected_at || (ad['rejected_at'] ? new Date(ad['rejected_at']).toISOString() : undefined) || undefined;
    
    const createdAt = site.created_at || undefined;
    const updatedAt = site.updated_at || site.last_modified || undefined;

    // Extract GPS coordinates from registry lookup
    // Priority: 1. registry_site_id column, 2. registry_linkage (new format), 3. registry_gps (legacy format)
    const registryLinkage = ad.registry_linkage || null;
    const registryGps = ad.registry_gps || {};
    
    // Check for direct registry_site_id column (new unified approach)
    const directRegistrySiteId = site.registry_site_id || null;
    
    // Extract from new registry_linkage structure if available
    let registryGpsLatitude: number | undefined;
    let registryGpsLongitude: number | undefined;
    let gpsAccuracyMeters: number | undefined;
    let registrySiteId: string | undefined = directRegistrySiteId || undefined;
    let registrySiteCode: string | undefined;
    let registryMatchType: string | undefined;
    let registryMatchConfidence: number | undefined;
    let matchConfidenceLevel: string | undefined;
    let matchAutoAccepted: boolean | undefined;
    let matchRequiresReview: boolean | undefined;
    let matchCandidatesCount: number | undefined;
    let matchedAt: string | undefined;
    let matchedBy: string | undefined;
    let sourceWorkflow: string | undefined;
    let unmatchedReason: string | undefined;
    let unmatchedDetails: string | undefined;
    let alternativeCandidates: Array<{ registry_site_id: string; site_code: string; site_name: string; confidence: number }> | undefined;
    let gpsSource: string | undefined;
    
    if (registryLinkage) {
      // New enhanced registry_linkage format
      registryGpsLatitude = registryLinkage.gps?.latitude;
      registryGpsLongitude = registryLinkage.gps?.longitude;
      gpsAccuracyMeters = registryLinkage.gps?.accuracy_meters;
      // Only use linkage registry_site_id if direct column is not available
      if (!registrySiteId) registrySiteId = registryLinkage.registry_site_id;
      registrySiteCode = registryLinkage.registry_site_code;
      registryMatchType = registryLinkage.match?.type;
      registryMatchConfidence = registryLinkage.match?.confidence;
      matchConfidenceLevel = registryLinkage.match?.confidence_level;
      matchAutoAccepted = registryLinkage.match?.auto_accepted;
      matchRequiresReview = registryLinkage.match?.requires_review;
      matchCandidatesCount = registryLinkage.match?.candidates_count;
      matchedAt = registryLinkage.audit?.matched_at;
      matchedBy = registryLinkage.audit?.matched_by;
      sourceWorkflow = registryLinkage.audit?.source_workflow;
      unmatchedReason = registryLinkage.unmatched?.reason;
      unmatchedDetails = registryLinkage.unmatched?.details;
      alternativeCandidates = registryLinkage.alternative_candidates;
      gpsSource = 'sites_registry';
    } else if (registryGps) {
      // Legacy registry_gps format
      registryGpsLatitude = registryGps.latitude;
      registryGpsLongitude = registryGps.longitude;
      gpsAccuracyMeters = registryGps.accuracy_meters;
      // Only use legacy site_id if direct column is not available
      if (!registrySiteId) registrySiteId = registryGps.site_id;
      registrySiteCode = registryGps.site_code;
      registryMatchType = registryGps.match_type;
      // Convert legacy confidence strings to numeric if needed
      const legacyConfidence = registryGps.match_confidence;
      if (typeof legacyConfidence === 'number') {
        registryMatchConfidence = legacyConfidence;
      } else if (legacyConfidence === 'high') {
        registryMatchConfidence = 1.0;
      } else if (legacyConfidence === 'medium') {
        registryMatchConfidence = 0.7;
      } else if (legacyConfidence === 'low') {
        registryMatchConfidence = 0.5;
      }
      matchedAt = registryGps.matched_at;
      gpsSource = registryGps.source;
    }
    
    const hasGpsCoordinates = registryGpsLatitude && registryGpsLongitude;
    const hasRegistryMatch = !!registrySiteId;

    return { 
      hubOffice, state, locality, siteCode, siteName, cpName, siteActivity, 
      monitoringBy, surveyTool, useMarketDiversion, useWarehouseMonitoring,
      visitDate, comments, 
      enumeratorFee: displayedEnumeratorFee, transportFee: displayedTransportFee, cost: totalCost,
      verifiedBy, verifiedAt, verificationNotes, status,
      dispatchedAt, dispatchedBy, acceptedAt, acceptedBy, 
      rejectionComments, rejectedBy, rejectedAt,
      createdAt, updatedAt,
      // GPS and Registry Matching
      registryGpsLatitude, registryGpsLongitude, gpsAccuracyMeters,
      registrySiteId, registrySiteCode,
      registryMatchType, registryMatchConfidence, matchConfidenceLevel,
      matchAutoAccepted, matchRequiresReview, matchCandidatesCount,
      matchedAt, matchedBy, sourceWorkflow,
      unmatchedReason, unmatchedDetails, alternativeCandidates,
      gpsSource, hasGpsCoordinates, hasRegistryMatch
    };
  };

  const row = normalizeSite(site);
  const isAvailableSite = row?.status?.toLowerCase() === 'dispatched' && !row?.acceptedBy;

  useEffect(() => {
    const id = row?.acceptedBy as string | undefined;
    if (!id) {
      setAcceptedByName(null);
      return;
    }
    const looksLikeUUID = typeof id === 'string' && /[0-9a-fA-F-]{30,}/.test(id);
    if (!looksLikeUUID) {
      setAcceptedByName(id);
      return;
    }
    const local = users?.find(u => u.id === id);
    if (local) {
      setAcceptedByName(local.fullName || local.name || local.username || local.email || id);
      return;
    }
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name,username,email')
          .eq('id', id)
          .single();
        if (!cancelled) {
          setAcceptedByName(data?.full_name || data?.username || data?.email || id);
        }
      } catch {
        if (!cancelled) setAcceptedByName(id);
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, [row?.acceptedBy, users]);

  useEffect(() => {
    const id = row?.dispatchedBy as string | undefined;
    if (!id) {
      setDispatchedByName(null);
      return;
    }
    const looksLikeUUID = typeof id === 'string' && /[0-9a-fA-F-]{30,}/.test(id);
    if (!looksLikeUUID) {
      setDispatchedByName(id);
      return;
    }
    const local = users?.find(u => u.id === id);
    if (local) {
      setDispatchedByName(local.fullName || local.name || local.username || local.email || id);
      return;
    }
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('full_name,username,email')
          .eq('id', id)
          .single();
        if (!cancelled) {
          setDispatchedByName(data?.full_name || data?.username || data?.email || id);
        }
      } catch {
        if (!cancelled) setDispatchedByName(id);
      }
    };
    fetchProfile();
    return () => { cancelled = true; };
  }, [row?.dispatchedBy, users]);

  // Initialize draft when entering edit mode
  useEffect(() => {
    if (isEditing && row && !draft) {
      setDraft({ ...row });
    }
  }, [isEditing, row]);

  // Load classification fee for the relevant user if enumerator_fee is not set
  useEffect(() => {
    let cancelled = false;
    const loadClassification = async () => {
      try {
        // Prefer accepted_by for the site; otherwise use the viewer's id
        const userId = (site?.accepted_by as string) || currentUserId;
        if (!userId) {
          setClassificationFee(null);
          return;
        }
        const result = await calculateEnumeratorFeeForUser(userId);
        if (!cancelled) setClassificationFee(result.fee);
      } catch {
        if (!cancelled) setClassificationFee(null);
      }
    };
    loadClassification();
    return () => { cancelled = true; };
  }, [site?.accepted_by, currentUserId]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setIsEditing(false);
      setDraft(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!draft || !onUpdateSite) return;

    setSaving(true);
    try {
      // Apply draft to site
      const updated = { ...site };
      updated.hubOffice = draft.hubOffice;
      updated.hub_office = draft.hubOffice;
      updated.state = draft.state;
      updated.locality = draft.locality;
      updated.siteName = draft.siteName;
      updated.site_name = draft.siteName;
      updated.cpName = draft.cpName;
      updated.cp_name = draft.cpName;
      updated.siteActivity = draft.siteActivity;
      updated.activity_at_site = draft.siteActivity;
      updated.monitoringBy = draft.monitoringBy;
      updated.monitoring_by = draft.monitoringBy;
      updated.surveyTool = draft.surveyTool;
      updated.survey_tool = draft.surveyTool;
      updated.useMarketDiversion = draft.useMarketDiversion;
      updated.use_market_diversion = draft.useMarketDiversion;
      updated.useWarehouseMonitoring = draft.useWarehouseMonitoring;
      updated.use_warehouse_monitoring = draft.useWarehouseMonitoring;
      updated.visitDate = draft.visitDate;
      updated.visit_date = draft.visitDate;
      updated.comments = draft.comments;
      updated.enumerator_fee = draft.enumeratorFee;
      updated.transport_fee = draft.transportFee;
      updated.cost = draft.cost || (Number(draft.enumeratorFee || 0) + Number(draft.transportFee || 0));
      updated.status = draft.status;
      updated.verification_notes = draft.verificationNotes;
      updated.verified_by = draft.verifiedBy;
      updated.verified_at = draft.verifiedAt;

      // Update additional_data
      const ad = { ...(site.additionalData || site.additional_data || {}) };
      ad['Hub Office'] = draft.hubOffice;
      ad['State'] = draft.state;
      ad['Locality'] = draft.locality;
      ad['Site Name'] = draft.siteName;
      ad['CP Name'] = draft.cpName;
      ad['Activity at Site'] = draft.siteActivity;
      ad['Monitoring By'] = draft.monitoringBy;
      ad['Survey Tool'] = draft.surveyTool;
      ad['Use Market Diversion Monitoring'] = draft.useMarketDiversion ? 'Yes' : 'No';
      ad['Use Warehouse Monitoring'] = draft.useWarehouseMonitoring ? 'Yes' : 'No';
      ad['Visit Date'] = draft.visitDate;
      ad['Comments'] = draft.comments;
      ad['Enumerator Fee'] = draft.enumeratorFee;
      ad['enumerator_fee'] = draft.enumeratorFee;
      ad['Transport Fee'] = draft.transportFee;
      ad['transport_fee'] = draft.transportFee;
      ad['Cost'] = updated.cost;
      updated.additionalData = ad;
      updated.additional_data = ad;

      const res = onUpdateSite([updated]);
      const ok = typeof res === 'object' && typeof (res as Promise<boolean>).then === 'function'
        ? await (res as Promise<boolean>)
        : true;

      if (ok) {
        setIsEditing(false);
        setDraft(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setDraft(null);
  };

  if (!site || !row) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-semibold">
                  {row.siteName || 'Site Details'}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  Review the complete site information and cost breakdown
                </DialogDescription>
              </div>
              {editable && !isEditing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-6">
            {/* Section 1: Site Details */}
            <div className="bg-gray-50 p-5 rounded-lg border space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b">
                <div className="bg-gray-700 text-white rounded w-6 h-6 flex items-center justify-center font-semibold text-sm">
                  1
                </div>
                <h3 className="text-base font-semibold text-gray-900">Site Details</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-gray-600">Site Code</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.siteCode || ''}
                      onChange={(e) => setDraft({ ...draft, siteCode: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.siteCode || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Site Name</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.siteName || ''}
                      onChange={(e) => setDraft({ ...draft, siteName: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.siteName || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Hub Office</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.hubOffice || ''}
                      onChange={(e) => setDraft({ ...draft, hubOffice: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.hubOffice || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">State</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.state || ''}
                      onChange={(e) => setDraft({ ...draft, state: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.state || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Locality</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.locality || ''}
                      onChange={(e) => setDraft({ ...draft, locality: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.locality || '—'}</p>
                  )}
                </div>
                {/* GPS Coordinates and Registry Match Info */}
                {(row.hasGpsCoordinates || row.hasRegistryMatch || row.matchRequiresReview || row.unmatchedReason) && (
                  <div className={`sm:col-span-2 p-3 rounded-md border ${
                    row.hasGpsCoordinates 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : row.matchRequiresReview
                      ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                      : 'bg-gray-50 dark:bg-gray-800/20 border-gray-200 dark:border-gray-700'
                  }`}>
                    <div className="flex items-center justify-between">
                      <Label className={`text-xs font-medium flex items-center gap-1 ${
                        row.hasGpsCoordinates 
                          ? 'text-blue-700 dark:text-blue-300'
                          : row.matchRequiresReview
                          ? 'text-yellow-700 dark:text-yellow-300'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {row.hasGpsCoordinates ? 'GPS Coordinates (from Sites Registry)' : 'Registry Match Status'}
                      </Label>
                      
                      {/* Confidence Score Badge */}
                      {row.registryMatchConfidence !== undefined && (
                        <Badge className={`${
                          row.registryMatchConfidence >= 0.9
                            ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200'
                            : row.registryMatchConfidence >= 0.7
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200'
                            : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-200'
                        }`} variant="secondary">
                          {Math.round(row.registryMatchConfidence * 100)}% Confidence
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex flex-wrap gap-4 mt-2">
                      {row.hasGpsCoordinates && (
                        <>
                          <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Latitude:</span>
                            <p className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{row.registryGpsLatitude}</p>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">Longitude:</span>
                            <p className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{row.registryGpsLongitude}</p>
                          </div>
                          {row.gpsAccuracyMeters && (
                            <div>
                              <span className="text-xs text-gray-500 dark:text-gray-400">Accuracy:</span>
                              <p className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{row.gpsAccuracyMeters}m</p>
                            </div>
                          )}
                        </>
                      )}
                      
                      {row.registryMatchType && (
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Match Type:</span>
                          <Badge className="ml-1 bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200" variant="secondary">
                            {row.registryMatchType === 'exact_code' ? 'Site Code' : 
                             row.registryMatchType === 'name_location' ? 'Name + Location' :
                             row.registryMatchType === 'partial' ? 'Partial Match' :
                             row.registryMatchType === 'fuzzy' ? 'Fuzzy Match' : row.registryMatchType}
                          </Badge>
                        </div>
                      )}
                      
                      {row.matchAutoAccepted !== undefined && (
                        <div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">Status:</span>
                          <Badge className={`ml-1 ${
                            row.matchAutoAccepted 
                              ? 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200'
                              : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200'
                          }`} variant="secondary">
                            {row.matchAutoAccepted ? 'Auto-Accepted' : 'Pending Review'}
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    {/* Unmatched Site Warning */}
                    {row.unmatchedReason && (
                      <div className="mt-3 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded border border-yellow-300 dark:border-yellow-700">
                        <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
                          {row.unmatchedReason === 'no_registry_entry' && 'Site not found in registry'}
                          {row.unmatchedReason === 'multiple_matches' && 'Multiple registry matches found'}
                          {row.unmatchedReason === 'low_confidence' && 'Match confidence below threshold'}
                        </p>
                        {row.unmatchedDetails && (
                          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">{row.unmatchedDetails}</p>
                        )}
                      </div>
                    )}
                    
                    {/* Alternative Candidates (for manual selection) */}
                    {row.alternativeCandidates && row.alternativeCandidates.length > 1 && (
                      <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-2">
                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Other potential matches ({row.alternativeCandidates.length}):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {row.alternativeCandidates.slice(0, 3).map((candidate: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {candidate.site_name} ({Math.round(candidate.confidence * 100)}%)
                            </Badge>
                          ))}
                          {row.alternativeCandidates.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{row.alternativeCandidates.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {/* Audit Info */}
                    {row.matchedAt && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Matched on {new Date(row.matchedAt).toLocaleDateString()}
                        {row.sourceWorkflow && ` via ${row.sourceWorkflow}`}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <Label className="text-xs font-medium text-gray-600">CP Name</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.cpName || ''}
                      onChange={(e) => setDraft({ ...draft, cpName: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.cpName || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Activity at Site</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.siteActivity || ''}
                      onChange={(e) => setDraft({ ...draft, siteActivity: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.siteActivity || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Visit Date</Label>
                  {isEditing ? (
                    <Input
                      type="date"
                      value={draft?.visitDate || ''}
                      onChange={(e) => setDraft({ ...draft, visitDate: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.visitDate || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Monitoring By</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.monitoringBy || ''}
                      onChange={(e) => setDraft({ ...draft, monitoringBy: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.monitoringBy || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Survey Tool</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.surveyTool || ''}
                      onChange={(e) => setDraft({ ...draft, surveyTool: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.surveyTool || '—'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Market Diversion</Label>
                  {isEditing ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Checkbox
                        checked={draft?.useMarketDiversion || false}
                        onCheckedChange={(checked) => setDraft({ ...draft, useMarketDiversion: Boolean(checked) })}
                      />
                      <span className="text-sm">Yes</span>
                    </div>
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.useMarketDiversion ? 'Yes' : 'No'}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs font-medium text-gray-600">Warehouse Monitoring</Label>
                  {isEditing ? (
                    <div className="flex items-center gap-2 mt-1">
                      <Checkbox
                        checked={draft?.useWarehouseMonitoring || false}
                        onCheckedChange={(checked) => setDraft({ ...draft, useWarehouseMonitoring: Boolean(checked) })}
                      />
                      <span className="text-sm">Yes</span>
                    </div>
                  ) : (
                    <p className="font-medium text-gray-900 mt-1">{row.useWarehouseMonitoring ? 'Yes' : 'No'}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs font-medium text-gray-600">Comments</Label>
                  {isEditing ? (
                    <Textarea
                      value={draft?.comments || ''}
                      onChange={(e) => setDraft({ ...draft, comments: e.target.value })}
                      className="mt-1"
                      rows={3}
                    />
                  ) : (
                    <p className="font-medium text-gray-900 mt-1 whitespace-pre-wrap">{row.comments || 'No comments provided'}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Section: Rejection Information (if rejected) */}
            {row.status?.toLowerCase() === 'rejected' && (row.rejectionComments || row.rejectedBy || row.rejectedAt) && (
              <div className="bg-red-50 p-5 rounded-lg border border-red-200 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-red-300">
                  <div className="bg-red-600 text-white rounded w-6 h-6 flex items-center justify-center font-semibold text-sm">
                    !
                  </div>
                  <h3 className="text-base font-semibold text-red-900">Rejection Information</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {row.rejectionComments && (
                    <div className="sm:col-span-2">
                      <Label className="text-xs font-medium text-red-600">Rejection Reason</Label>
                      <p className="font-medium text-gray-900 mt-1 whitespace-pre-wrap">{row.rejectionComments}</p>
                    </div>
                  )}
                  {row.rejectedBy && (
                    <div>
                      <Label className="text-xs font-medium text-red-600">Rejected By</Label>
                      <p className="font-medium text-gray-900 mt-1">{row.rejectedBy}</p>
                    </div>
                  )}
                  {row.rejectedAt && (
                    <div>
                      <Label className="text-xs font-medium text-red-600">Rejected At</Label>
                      <p className="font-medium text-gray-900 mt-1">
                        {new Date(row.rejectedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Section 2: Site Cost Details */}
            <div className="bg-gray-50 dark:bg-gray-800 p-5 rounded-lg border space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b">
                <div className="bg-gray-700 text-white rounded w-6 h-6 flex items-center justify-center font-semibold text-sm">
                  2
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Site Cost Details</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                  <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Data Collector Fee</Label>
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={draft?.enumeratorFee ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((d: any) => {
                          const newDraft = { ...d, enumeratorFee: val };
                          const enumFee = Number(val) || 0;
                          const transFee = Number(d?.transportFee ?? row.transportFee ?? 0);
                          newDraft.cost = enumFee + transFee;
                          return newDraft;
                        });
                      }}
                      className="mt-2 text-2xl font-semibold"
                      placeholder="Calculated at claim"
                    />
                  ) : (
                    <>
                      {row.enumeratorFee !== undefined && row.enumeratorFee !== null && Number(row.enumeratorFee) > 0 ? (
                        <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-2">
                          {Number(row.enumeratorFee).toLocaleString()} SDG
                        </p>
                      ) : (
                        <div className="mt-2">
                          <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                            Pending
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Calculated when claimed based on collector classification
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Payment for completing the site visit</p>
                </div>
                <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                  <Label className="text-xs font-medium text-gray-600 dark:text-gray-400">Transport Budget</Label>
                  {isEditing ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={draft?.transportFee ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraft((d: any) => {
                          const newDraft = { ...d, transportFee: val };
                          const enumFee = Number(d?.enumeratorFee ?? row.enumeratorFee ?? 0);
                          const transFee = Number(val) || 0;
                          newDraft.cost = enumFee + transFee;
                          return newDraft;
                        });
                      }}
                      className="mt-2 text-2xl font-semibold"
                      placeholder="Set at dispatch"
                    />
                  ) : (
                    <>
                      <p className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mt-2">
                        {row.transportFee !== undefined && row.transportFee !== null && Number(row.transportFee) > 0
                          ? `${Number(row.transportFee).toLocaleString()} SDG`
                          : '0 SDG'}
                      </p>
                      {(!row.transportFee || row.transportFee === null || Number(row.transportFee) === 0) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">(Set at dispatch)</p>
                      )}
                    </>
                  )}
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">Transportation and logistics</p>
                </div>
                <div className="bg-blue-600 p-4 rounded-lg border border-blue-700">
                  <Label className="text-xs font-medium text-blue-100">Total Payout</Label>
                  {isEditing ? (
                    <p className="text-2xl font-bold text-white mt-2">
                      {((Number(draft?.enumeratorFee ?? 0)) + (Number(draft?.transportFee ?? 0))).toLocaleString()} SDG
                    </p>
                  ) : (
                    <>
                      {row.enumeratorFee !== undefined && row.enumeratorFee !== null && Number(row.enumeratorFee) > 0 ? (
                        <p className="text-2xl font-bold text-white mt-2">
                          {(Number(row.enumeratorFee) + Number(row.transportFee || 0)).toLocaleString()} SDG
                        </p>
                      ) : (
                        <div className="mt-2">
                          <p className="text-lg font-bold text-blue-100">
                            {Number(row.transportFee || 0).toLocaleString()} SDG + Fee
                          </p>
                          <p className="text-xs text-blue-200 mt-1">
                            Collector fee added at claim
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  <p className="text-xs text-blue-100 mt-2">Complete payment upon visit</p>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-900 p-4 rounded-lg border">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Payment Information</p>
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                  {row.enumeratorFee !== undefined && row.enumeratorFee !== null && Number(row.enumeratorFee) > 0 
                    ? 'Upon successful completion of the site visit, the total payout will be credited to your wallet. Payment is processed automatically after you submit your visit report with photos and required documentation.'
                    : 'Your collector fee will be calculated based on your classification level (A, B, or C) when you claim this site. The total payout = Transport Budget + Your Collector Fee.'}
                </p>
              </div>
            </div>

            {/* Status and Timestamps */}
            <div className="bg-gray-50 p-5 rounded-lg border space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b">
                <div className="bg-gray-700 text-white rounded w-6 h-6 flex items-center justify-center font-semibold text-sm">
                  3
                </div>
                <h3 className="text-base font-semibold text-gray-900">Status & Timestamps</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-medium text-gray-600">Status</Label>
                  {isEditing ? (
                    <Input
                      value={draft?.status || 'Pending'}
                      onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                      className="mt-1"
                    />
                  ) : (
                    <div className="mt-1">
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
                    </div>
                  )}
                </div>
                {row.verifiedBy && (
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Verified By</Label>
                    <p className="font-medium text-gray-900 mt-1">{row.verifiedBy}</p>
                  </div>
                )}
                {row.verifiedAt && (
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Verified At</Label>
                    <p className="font-medium text-gray-900 mt-1">{new Date(row.verifiedAt).toLocaleString()}</p>
                  </div>
                )}
                {row.dispatchedBy && (
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Dispatched By</Label>
                    <p className="font-medium text-gray-900 mt-1">{dispatchedByName || row.dispatchedBy}</p>
                  </div>
                )}
                {row.dispatchedAt && (
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Dispatched At</Label>
                    <p className="font-medium text-gray-900 mt-1">{new Date(row.dispatchedAt).toLocaleString()}</p>
                  </div>
                )}
                {row.acceptedBy && (
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Accepted By</Label>
                    <p className="font-medium text-gray-900 mt-1">{acceptedByName || row.acceptedBy}</p>
                  </div>
                )}
                {row.acceptedAt && (
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Accepted At</Label>
                    <p className="font-medium text-gray-900 mt-1">{new Date(row.acceptedAt).toLocaleString()}</p>
                  </div>
                )}
                {row.createdAt && (
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Created At</Label>
                    <p className="font-medium text-gray-900 mt-1">{new Date(row.createdAt).toLocaleString()}</p>
                  </div>
                )}
                {row.updatedAt && (
                  <div>
                    <Label className="text-xs font-medium text-gray-600">Updated At</Label>
                    <p className="font-medium text-gray-900 mt-1">{new Date(row.updatedAt).toLocaleString()}</p>
                  </div>
                )}
                {row.verificationNotes && (
                  <div className="sm:col-span-2">
                    <Label className="text-xs font-medium text-gray-600">Verification Notes</Label>
                    {isEditing ? (
                      <Textarea
                        value={draft?.verificationNotes || ''}
                        onChange={(e) => setDraft({ ...draft, verificationNotes: e.target.value })}
                        className="mt-1"
                        rows={3}
                      />
                    ) : (
                      <p className="font-medium text-gray-900 mt-1 whitespace-pre-wrap">{row.verificationNotes}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            {isAvailableSite && !isEditing && (
              <div className="border-t pt-4 flex flex-col sm:flex-row gap-3">
                {enableFirstClaim && currentUserId ? (
                  <ClaimSiteButton
                    siteId={site.id}
                    siteName={row?.siteName || 'Site'}
                    userId={currentUserId}
                    onClaimed={() => {
                      onClaimed?.();
                      onOpenChange(false);
                    }}
                    size="lg"
                    className="flex-1"
                    data-testid={`button-claim-site-${site.id}`}
                  />
                ) : onAcceptSite ? (
                  <Button
                    onClick={() => {
                      onAcceptSite(site);
                      onOpenChange(false);
                    }}
                    className="flex-1"
                    size="lg"
                    data-testid="button-accept-site"
                  >
                    Accept Site
                  </Button>
                ) : null}
                {onSendBackToCoordinator && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSendBackComments('');
                      setSendBackOpen(true);
                    }}
                    className="flex-1"
                    size="lg"
                    data-testid="button-send-back"
                  >
                    Send Back to Coordinator
                  </Button>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            {isEditing ? (
              <>
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Back to Coordinator Dialog */}
      <Dialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Back to Coordinator</DialogTitle>
            <DialogDescription>
              Provide comments explaining why this site needs to be sent back to the coordinator for editing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="sendBackComments">Comments</Label>
              <Textarea
                id="sendBackComments"
                placeholder="Enter your comments here..."
                value={sendBackComments}
                onChange={(e) => setSendBackComments(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSendBackOpen(false);
                  setSendBackComments('');
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={() => {
                  if (site && onSendBackToCoordinator) {
                    onSendBackToCoordinator(site, sendBackComments);
                    setSendBackOpen(false);
                    setSendBackComments('');
                    onOpenChange(false);
                  }
                }}
                disabled={!sendBackComments.trim()}
                className="bg-orange-600 hover:bg-orange-700"
              >
                Send Back
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SiteDetailDialog;

