/**
 * Shared transform and migration utilities for MMP data.
 * Used by MMPContext and MMP React Query hooks.
 */
import type { MMPFile } from '@/types';

// Migration function: Move data from additional_data to proper columns if column is empty
export function migrateAdditionalDataToColumns(entry: any): any {
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
    'Status': 'status', 'Status:': 'status', 'status': 'status',
    'Rejection Comments': 'rejection_comments', 'rejection_comments': 'rejection_comments', 'rejection_reason': 'rejection_comments',
    'Rejected By': 'rejected_by', 'rejected_by': 'rejected_by',
    'Rejected At': 'rejected_at', 'rejected_at': 'rejected_at',
  };

  const toBool = (v: any): boolean | null => {
    if (typeof v === 'boolean') return v;
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).toLowerCase().trim();
    return s === 'yes' || s === 'true' || s === '1' || s === 'y' ? true : s === 'no' || s === 'false' || s === '0' ? false : null;
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
      } else if (columnName === 'verified_at' || columnName === 'dispatched_at' || columnName === 'accepted_at' || columnName === 'rejected_at') {
        const dateVal = toDate(adValue);
        if (dateVal !== null) migrated[columnName] = dateVal;
      } else if (columnName === 'rejected_by') {
        const uuidVal = String(adValue).trim();
        if (uuidVal && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidVal)) {
          migrated[columnName] = uuidVal;
        }
      } else {
        migrated[columnName] = String(adValue).trim();
      }
    }
  }
  return migrated;
}

/** Transform a single site entry (after migration) to context shape */
function mapSiteEntry(migrated: any, projectName?: string) {
  return {
    id: migrated.id,
    siteCode: migrated.site_code,
    hubOffice: migrated.hub_office,
    state: migrated.state,
    locality: migrated.locality,
    siteName: migrated.site_name,
    cpName: migrated.cp_name || projectName,
    visitType: migrated.visit_type,
    visitDate: migrated.visit_date,
    mainActivity: migrated.main_activity,
    siteActivity: migrated.activity_at_site,
    monitoringBy: migrated.monitoring_by,
    surveyTool: migrated.survey_tool,
    useMarketDiversion: migrated.use_market_diversion,
    useWarehouseMonitoring: migrated.use_warehouse_monitoring,
    comments: migrated.comments,
    cost: migrated.cost,
    enumerator_fee: migrated.enumerator_fee,
    transport_fee: migrated.transport_fee,
    verified_by: migrated.verified_by,
    verified_at: migrated.verified_at,
    verification_notes: migrated.verification_notes,
    dispatched_by: migrated.dispatched_by,
    dispatched_at: migrated.dispatched_at,
    accepted_by: migrated.accepted_by,
    accepted_at: migrated.accepted_at,
    claimed_by: (migrated.additional_data || {})?.claimed_by || null,
    claimed_at: (migrated.additional_data || {})?.claimed_at || null,
    cost_acknowledged: migrated.cost_acknowledged ?? (migrated.additional_data || {})?.cost_acknowledged,
    additionalData: migrated.additional_data || {},
    status: migrated.status,
    forwardedToUserId: migrated.forwarded_to_user_id,
  };
}

/** Transform DB row (mmp_files with mmp_site_entries) to MMPFile */
export function transformDBToMMPFile(dbRecord: any): MMPFile {
  let siteEntries: any[] = [];
  if (dbRecord.mmp_site_entries) {
    const projectName = dbRecord.project?.name || dbRecord.project_name || dbRecord.projectname || '';
    siteEntries = (dbRecord.mmp_site_entries as any[]).map((entry: any) => {
      const migrated = migrateAdditionalDataToColumns(entry);
      return mapSiteEntry(migrated, projectName);
    });
  } else if (dbRecord.site_entries) {
    siteEntries = dbRecord.site_entries;
  }

  return {
    id: dbRecord.id,
    name: dbRecord.name,
    hub: dbRecord.hub,
    month: dbRecord.month,
    uploadedBy: dbRecord.uploaded_by || 'Unknown',
    uploadedAt: dbRecord.uploaded_at,
    status: dbRecord.status,
    entries: dbRecord.entries,
    processedEntries: dbRecord.processed_entries,
    mmpId: dbRecord.mmp_id,
    rejectionReason: dbRecord.rejection_reason || dbRecord.rejectionreason,
    approvedBy: dbRecord.approved_by || dbRecord.approvedby,
    approvedAt: dbRecord.approved_at || dbRecord.approvedat,
    verifiedBy: dbRecord.verified_by,
    verifiedAt: dbRecord.verified_at,
    archivedAt: dbRecord.archived_at || dbRecord.archivedat,
    archivedBy: dbRecord.archived_by || dbRecord.archivedby,
    deletedAt: dbRecord.deleted_at || dbRecord.deletedat,
    deletedBy: dbRecord.deleted_by || dbRecord.deletedby,
    expiryDate: dbRecord.expiry_date || dbRecord.expirydate,
    region: dbRecord.region,
    year: dbRecord.year,
    version: dbRecord.version,
    modificationHistory: dbRecord.modification_history || dbRecord.modificationhistory,
    modifiedAt: dbRecord.modified_at,
    description: dbRecord.description,
    type: dbRecord.type,
    filePath: dbRecord.file_path,
    originalFilename: dbRecord.original_filename,
    fileUrl: dbRecord.file_url,
    projectId: dbRecord.project_id,
    projectName: dbRecord.project?.name || dbRecord.project_name || dbRecord.projectname || dbRecord.name,
    siteEntries,
    workflow: dbRecord.workflow,
    approvalWorkflow: dbRecord.approval_workflow,
    location: dbRecord.location,
    team: dbRecord.team,
    permits: dbRecord.permits,
    siteVisit: dbRecord.site_visit || dbRecord.sitevisit,
    financial: dbRecord.financial,
    performance: dbRecord.performance,
    cpVerification: dbRecord.cp_verification || dbRecord.cpverification,
    comprehensiveVerification: dbRecord.comprehensive_verification,
    activities: dbRecord.activities,
  } as MMPFile;
}
