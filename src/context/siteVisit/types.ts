
import { SiteVisit, Transaction, User } from '@/types';

export interface SiteVisitContextType {
  siteVisits: SiteVisit[];
  loading: boolean;
  verifySitePermit: (siteVisitId: string) => Promise<boolean>;
  assignSiteVisit: (siteVisitId: string, userId: string) => Promise<boolean>;
  startSiteVisit: (siteVisitId: string) => Promise<boolean>;
  completeSiteVisit: (
    siteVisitId: string, 
    data: { notes?: string; attachments?: string[] }
  ) => Promise<boolean>;
  rateSiteVisit: (
    siteVisitId: string, 
    data: { rating: number; notes?: string }
  ) => Promise<boolean>;
  getNearbyDataCollectors: (siteVisitId: string) => User[];
  createSiteVisit: (siteVisitData: Partial<SiteVisit>) => Promise<string | undefined>;
  deleteSiteVisit: (siteVisitId: string) => Promise<boolean>;
}
