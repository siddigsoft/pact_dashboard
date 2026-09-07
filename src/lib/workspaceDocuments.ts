export const DOCUMENT_CATEGORIES = {
  site_permit: 'Site permits', payment_receipt: 'Payment receipts', site_image: 'Site images',
  mmp: 'MMPs', project_document: 'Project documents', report: 'Reports', other: 'Other documents',
} as const;
export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;
export interface DocumentMetadata {
  document_category?: DocumentCategory;
  audience?: 'workspace' | 'admin_only';
  project_label?: string | null;
  site_label?: string | null;
  reporting_period?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  storage_bucket?: string | null;
}
export function isAdminOnlyDocument(file: DocumentMetadata): boolean {
  return file.audience === 'admin_only'
    || ['site_permit', 'payment_receipt', 'site_image', 'mmp'].includes(file.document_category ?? '');
}
export function matchesDocumentFilters(file: DocumentMetadata, filters: {
  category: string; project: string; site: string; period: string; adminOnly: boolean;
}): boolean {
  return (filters.category === 'all' || (file.document_category ?? 'other') === filters.category)
    && (!filters.project || (file.project_label ?? '').toLowerCase().includes(filters.project.toLowerCase()))
    && (!filters.site || (file.site_label ?? '').toLowerCase().includes(filters.site.toLowerCase()))
    && (!filters.period || file.reporting_period === filters.period)
    && (!filters.adminOnly || isAdminOnlyDocument(file));
}
/** Source navigation is an application route, never an arbitrary stored URL. */
export function documentSourceRoute(file: DocumentMetadata): string | null {
  return file.source_type && file.source_id ? '/documents' : null;
}
