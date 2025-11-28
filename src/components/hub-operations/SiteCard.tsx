import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Navigation, 
  MapPin, 
  Building2, 
  Globe, 
  Edit2, 
  Trash2,
  ChevronRight,
  Activity,
  Calendar,
  FileText
} from 'lucide-react';
import { SiteRegistry } from '@/types/hub-operations';
import { format } from 'date-fns';

interface SiteCardProps {
  site: SiteRegistry;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewDetails?: () => void;
  canManage?: boolean;
}

const statusColors: { [key: string]: { bg: string; text: string; badge: string } } = {
  'registered': { bg: 'bg-blue-500/10', text: 'text-blue-600', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  'active': { bg: 'bg-green-500/10', text: 'text-green-600', badge: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  'inactive': { bg: 'bg-gray-500/10', text: 'text-gray-600', badge: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' },
  'archived': { bg: 'bg-amber-500/10', text: 'text-amber-600', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
};

const activityColors: { [key: string]: string } = {
  'TPM': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'PDM': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'CFM': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'FCS': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'OTHER': 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
};

export default function SiteCard({
  site,
  onEdit,
  onDelete,
  onViewDetails,
  canManage = false,
}: SiteCardProps) {
  const statusStyle = statusColors[site.status] || statusColors['registered'];
  const activityStyle = activityColors[site.activity_type || 'OTHER'] || activityColors['OTHER'];

  return (
    <Card 
      className="overflow-hidden transition-all duration-300 hover:shadow-lg group"
      data-testid={`card-site-${site.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <Badge className={activityStyle} variant="secondary">
                {site.activity_type || 'TPM'}
              </Badge>
              <Badge className={statusStyle.badge} variant="secondary">
                {site.status}
              </Badge>
              {site.source && (
                <Badge 
                  variant={site.source === 'registry' ? 'default' : 'outline'}
                  className={site.source === 'mmp' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' : ''}
                >
                  {site.source === 'registry' ? 'Registry' : 'MMP'}
                </Badge>
              )}
              {site.gps_latitude && site.gps_longitude && (
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  <MapPin className="h-3 w-3 mr-1" />
                  GPS
                </Badge>
              )}
            </div>
            <CardTitle className="text-base font-semibold truncate">
              {site.site_name}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-mono mt-1">
              {site.site_code}
            </p>
          </div>
          {canManage && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-7 w-7"
                onClick={onEdit}
                data-testid={`button-edit-site-${site.id}`}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-7 w-7"
                onClick={onDelete}
                data-testid={`button-delete-site-${site.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{site.state_name}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{site.locality_name}</span>
          </div>
          {site.hub_name && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{site.hub_name}</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-3 w-3" />
              <span>{site.mmp_count} MMPs</span>
            </div>
          </div>
          {site.gps_latitude && site.gps_longitude && (
            <Badge variant="outline" className="text-xs">
              <Navigation className="h-3 w-3 mr-1" />
              GPS
            </Badge>
          )}
        </div>
        
        {site.created_at && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>Added: {format(new Date(site.created_at), 'MMM d, yyyy')}</span>
          </div>
        )}
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={onViewDetails}
          data-testid={`button-view-site-${site.id}`}
        >
          View Details
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
