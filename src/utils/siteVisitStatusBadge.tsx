/**
 * Central registry for site visit status presentation.
 *
 * All status badges, labels, colors, and icons for mmp_site_entries.status
 * are defined here so every page is consistent.
 *
 * Status taxonomy (Phase A+):
 *   assigned       — site claimed by enumerator
 *   dispatched     — enumerator is en-route / dispatched by supervisor
 *   submitted      — enumerator self-reported submission to WFP ODK (was 'completed')
 *   wfp_confirmed  — WFP cleaned data file proves submission received (Phase C)
 *   rejected       — not found in WFP cleaned data file (Phase C)
 *   not_covered    — site not visited, officially documented with a reason
 *   pending        — legacy / unassigned
 *   cancelled      — cancelled during cycle close
 */

import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MinusCircle,
  Circle,
  Ban,
} from 'lucide-react';

export type SiteVisitStatusValue =
  | 'pending'
  | 'assigned'
  | 'dispatched'
  | 'submitted'
  | 'wfp_confirmed'
  | 'rejected'
  | 'not_covered'
  | 'cancelled'
  | string; // allow unknown values gracefully

export interface SiteVisitStatusMeta {
  label: string;
  labelAr: string;
  color: string;         // Tailwind text color class
  bgColor: string;       // Tailwind bg color class (for badges/chips)
  borderColor: string;   // Tailwind border color class
  hexColor: string;      // For map pins / recharts
  icon: React.ElementType;
  isTerminal: boolean;   // counts as "done" for coverage calculations
  isPaid: boolean;       // fee is owed after reaching this status
}

const STATUS_META: Record<string, SiteVisitStatusMeta> = {
  pending: {
    label: 'Pending',
    labelAr: 'معلق',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    borderColor: 'border-gray-300',
    hexColor: '#9ca3af',
    icon: Circle,
    isTerminal: false,
    isPaid: false,
  },
  assigned: {
    label: 'Assigned',
    labelAr: 'مُعيَّن',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/30',
    borderColor: 'border-blue-300',
    hexColor: '#3b82f6',
    icon: Clock,
    isTerminal: false,
    isPaid: false,
  },
  dispatched: {
    label: 'Dispatched',
    labelAr: 'تم الإرسال',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/30',
    borderColor: 'border-purple-300',
    hexColor: '#8b5cf6',
    icon: Send,
    isTerminal: false,
    isPaid: false,
  },
  submitted: {
    label: 'Submitted',
    labelAr: 'تم الإرسال لـ WFP',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/30',
    borderColor: 'border-amber-300',
    hexColor: '#f59e0b',
    icon: Send,
    isTerminal: true,   // counts as resolved for cycle close gate
    isPaid: false,      // payment requires wfp_confirmed
  },
  wfp_confirmed: {
    label: 'WFP Confirmed',
    labelAr: 'مؤكد من WFP',
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/30',
    borderColor: 'border-green-300',
    hexColor: '#10b981',
    icon: CheckCircle2,
    isTerminal: true,
    isPaid: true,       // fee is owed
  },
  rejected: {
    label: 'Rejected',
    labelAr: 'مرفوض',
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-900/30',
    borderColor: 'border-red-300',
    hexColor: '#ef4444',
    icon: XCircle,
    isTerminal: true,
    isPaid: false,
  },
  not_covered: {
    label: 'Not Covered',
    labelAr: 'غير مغطى',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/30',
    borderColor: 'border-orange-300',
    hexColor: '#f97316',
    icon: AlertTriangle,
    isTerminal: true,
    isPaid: false,
  },
  cancelled: {
    label: 'Cancelled',
    labelAr: 'ملغى',
    color: 'text-gray-400',
    bgColor: 'bg-gray-50 dark:bg-gray-900/30',
    borderColor: 'border-gray-200',
    hexColor: '#d1d5db',
    icon: Ban,
    isTerminal: true,
    isPaid: false,
  },
};

const FALLBACK_META: SiteVisitStatusMeta = {
  label: 'Unknown',
  labelAr: 'غير معروف',
  color: 'text-gray-400',
  bgColor: 'bg-gray-50 dark:bg-gray-900/20',
  borderColor: 'border-gray-200',
  hexColor: '#d1d5db',
  icon: MinusCircle,
  isTerminal: false,
  isPaid: false,
};

/** Normalize a raw DB status value to lowercase-trimmed for lookup. */
export function normalizeStatus(rawStatus: string | null | undefined): string {
  return (rawStatus ?? '').toLowerCase().trim();
}

/** Get the full metadata object for a status value. */
export function getSiteVisitStatusMeta(rawStatus: string | null | undefined): SiteVisitStatusMeta {
  const key = normalizeStatus(rawStatus);
  return STATUS_META[key] ?? FALLBACK_META;
}

/** Returns true if the status counts as terminal (resolved) for coverage analytics. */
export function isSiteVisitTerminal(rawStatus: string | null | undefined): boolean {
  return getSiteVisitStatusMeta(rawStatus).isTerminal;
}

/** Returns true if the status means a fee is now owed to the enumerator. */
export function isSiteVisitPaid(rawStatus: string | null | undefined): boolean {
  return getSiteVisitStatusMeta(rawStatus).isPaid;
}

interface SiteVisitStatusBadgeProps {
  status: string | null | undefined;
  showIcon?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Drop-in badge component for any site visit status value.
 * Handles mixed-case DB values gracefully.
 *
 * Usage:
 *   <SiteVisitStatusBadge status={entry.status} />
 *   <SiteVisitStatusBadge status="wfp_confirmed" showIcon />
 */
export function SiteVisitStatusBadge({
  status,
  showIcon = false,
  size = 'sm',
  className = '',
}: SiteVisitStatusBadgeProps) {
  const meta = getSiteVisitStatusMeta(status);
  const Icon = meta.icon;

  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
        meta.color,
        meta.bgColor,
        meta.borderColor,
        className,
      ].join(' ')}
    >
      {showIcon && <Icon className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />}
      {meta.label}
    </span>
  );
}

/**
 * Returns the map pin hex color for a status value.
 * Used by Leaflet map components.
 */
export function getSiteVisitStatusColor(rawStatus: string | null | undefined): string {
  return getSiteVisitStatusMeta(rawStatus).hexColor;
}

export { STATUS_META };
