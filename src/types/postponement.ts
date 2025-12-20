export type PostponementStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PostponementReason = 
  | 'cp_delay' 
  | 'weather' 
  | 'security' 
  | 'logistics' 
  | 'staff_unavailable' 
  | 'beneficiary_unavailable'
  | 'other';

export interface PostponementRequest {
  id: string;
  siteEntryId: string;
  originalDate: string;
  originalDateTo?: string;
  requestedDate: string;
  requestedDateTo?: string;
  isDateRange?: boolean;
  reason: PostponementReason;
  reasonDetails?: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
  status: PostponementStatus;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface PostponementFormData {
  requestedDate: string;
  requestedDateTo?: string;
  isDateRange?: boolean;
  reason: PostponementReason;
  reasonDetails?: string;
}

export const POSTPONEMENT_REASONS: Record<PostponementReason, { en: string; ar: string }> = {
  cp_delay: { en: 'CP Delay', ar: 'تأخير من الشريك' },
  weather: { en: 'Weather Conditions', ar: 'الظروف الجوية' },
  security: { en: 'Security Concerns', ar: 'مخاوف أمنية' },
  logistics: { en: 'Logistics Issues', ar: 'مشاكل لوجستية' },
  staff_unavailable: { en: 'Staff Unavailable', ar: 'الموظف غير متاح' },
  beneficiary_unavailable: { en: 'Beneficiary Unavailable', ar: 'المستفيد غير متاح' },
  other: { en: 'Other', ar: 'أخرى' }
};

export interface DateRangeVisit {
  dateFrom: string;
  dateTo: string;
  activityType: 'single_day' | 'multi_day' | 'dm_gfa';
}

export interface AutoReleaseSettings {
  enabled: boolean;
  releaseHoursBeforeVisit: number;
  confirmationHoursBeforeVisit: number;
  reminderIntervals: number[];
}

export const DEFAULT_AUTO_RELEASE_SETTINGS: AutoReleaseSettings = {
  enabled: true,
  releaseHoursBeforeVisit: 24,
  confirmationHoursBeforeVisit: 48,
  reminderIntervals: [48, 24, 12]
};
