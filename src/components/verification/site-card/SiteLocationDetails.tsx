
import { MapPin } from 'lucide-react';
import { MMPSiteEntry } from '@/types/mmp/site';

interface SiteLocationDetailsProps {
  site: MMPSiteEntry;
}

export const SiteLocationDetails = ({ site }: SiteLocationDetailsProps) => {
  return (
    <div>
      <h4 className="text-sm font-medium mb-2">Location Details</h4>
      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">Hub Office:</span> {site.hubOffice || 'N/A'}
        </p>
        <p><span className="font-medium">State:</span> {site.state || 'N/A'}</p>
        <p><span className="font-medium">Locality:</span> {site.locality || 'N/A'}</p>
      </div>
    </div>
  );
};
