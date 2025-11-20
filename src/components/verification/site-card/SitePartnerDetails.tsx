
import { Activity } from 'lucide-react';
import { MMPSiteEntry } from '@/types/mmp/site';

interface SitePartnerDetailsProps {
  site: MMPSiteEntry;
}

export const SitePartnerDetails = ({ site }: SitePartnerDetailsProps) => {
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">Cooperating Partner Details</h4>
      <div className="space-y-2 text-sm">
        <p><span className="font-medium">CP Name:</span> {site.cpName || 'N/A'}</p>
        <p className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Main Activity:</span> {site.mainActivity || 'N/A'}
        </p>
        <p><span className="font-medium">Activity at Site:</span> {site.siteActivity || 'N/A'}</p>
      </div>
    </div>
  );
};
