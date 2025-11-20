
import { Calendar } from 'lucide-react';
import { MMPSiteEntry } from '@/types/mmp/site';

interface SiteVisitInfoProps {
  site: MMPSiteEntry;
}

export const SiteVisitInfo = ({ site }: SiteVisitInfoProps) => {
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">Visit Information</h4>
      <div className="space-y-2 text-sm">
        <p><span className="font-medium">Visit Type:</span> {site.visitType || 'N/A'}</p>
        <p className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Visit Date:</span> {site.visitDate ? new Date(site.visitDate).toLocaleDateString() : 'N/A'}
        </p>
        <p><span className="font-medium">Status:</span> {site.status}</p>
        <p><span className="font-medium">Visited By:</span> {site.visitedBy || 'N/A'}</p>
      </div>
    </div>
  );
};
