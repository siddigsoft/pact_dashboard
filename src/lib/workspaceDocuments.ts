import { FileSpreadsheet, Shield, Receipt, Image, FileText, File, type LucideIcon } from 'lucide-react';

export const DOCUMENT_CATEGORIES = {
  site_permit: 'Site permits', payment_receipt: 'Payment receipts', site_image: 'Site images',
  mmp: 'MMPs', project_document: 'Project documents', report: 'Reports', other: 'Other documents',
} as const;
export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;

/** Registry-style labels (Documents page vocabulary). */
export const DOCUMENT_CATEGORY_ICONS: Record<DocumentCategory, LucideIcon> = {
  site_permit: Shield,
  payment_receipt: Receipt,
  site_image: Image,
  mmp: FileSpreadsheet,
  project_document: FileText,
  report: FileText,
  other: File,
};

export const DOCUMENT_CATEGORY_COLORS: Record<DocumentCategory, string> = {
  site_permit: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  payment_receipt: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  site_image: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  mmp: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  project_document: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  report: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  other: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
};

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
    && (!filters.project || (file.project_label ?? '').toLowerCase() === filters.project.toLowerCase()
      || (file.project_label ?? '').toLowerCase().includes(filters.project.toLowerCase()))
    && (!filters.site || (file.site_label ?? '').toLowerCase() === filters.site.toLowerCase()
      || (file.site_label ?? '').toLowerCase().includes(filters.site.toLowerCase()))
    && (!filters.period || file.reporting_period === filters.period)
    && (!filters.adminOnly || isAdminOnlyDocument(file));
}
/** Source navigation is an application route, never an arbitrary stored URL. */
export function documentSourceRoute(file: DocumentMetadata): string | null {
  return file.source_type && file.source_id ? '/documents' : null;
}

export interface SiteImageGroup<T extends DocumentMetadata & { updated_at?: string; created_at?: string }> {
  siteName: string;
  projectLabel: string | null;
  files: T[];
  lastUpdated: string | undefined;
}

/** Group site images like Documents registry (site cards, newest group first). */
export function groupSiteImages<T extends DocumentMetadata & { updated_at?: string; created_at?: string }>(
  files: T[],
): SiteImageGroup<T>[] {
  const map = new Map<string, SiteImageGroup<T>>();
  for (const file of files) {
    const siteName = file.site_label?.trim() || file.project_label?.trim() || 'Unknown site';
    const key = `${file.project_label ?? ''}__${siteName}`;
    let group = map.get(key);
    if (!group) {
      group = { siteName, projectLabel: file.project_label ?? null, files: [], lastUpdated: undefined };
      map.set(key, group);
    }
    group.files.push(file);
  }
  return Array.from(map.values()).map((g) => {
    g.files.sort((a, b) => {
      const ta = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
      const tb = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
      return tb - ta;
    });
    g.lastUpdated = g.files[0]?.updated_at ?? g.files[0]?.created_at;
    return g;
  }).sort((a, b) => {
    const ta = a.lastUpdated ? new Date(a.lastUpdated).getTime() : 0;
    const tb = b.lastUpdated ? new Date(b.lastUpdated).getTime() : 0;
    return tb - ta;
  });
}
