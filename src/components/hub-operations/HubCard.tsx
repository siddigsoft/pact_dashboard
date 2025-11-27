import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  MapPin, 
  Globe, 
  Navigation, 
  Edit2, 
  Trash2,
  ChevronRight,
  Users
} from 'lucide-react';
import { ManagedHub, SiteRegistry } from '@/types/hub-operations';
import { sudanStates } from '@/data/sudanStates';

interface HubCardProps {
  hub: ManagedHub;
  sites: SiteRegistry[];
  onEdit?: () => void;
  onDelete?: () => void;
  onViewDetails?: () => void;
  canManage?: boolean;
}

const hubGradients: { [key: string]: string } = {
  'kassala-hub': 'from-green-500 to-green-700',
  'kosti-hub': 'from-orange-500 to-orange-700',
  'el-fasher-hub': 'from-pink-500 to-pink-700',
  'dongola-hub': 'from-blue-500 to-blue-700',
  'country-office': 'from-violet-500 to-violet-700',
};

export default function HubCard({
  hub,
  sites,
  onEdit,
  onDelete,
  onViewDetails,
  canManage = false,
}: HubCardProps) {
  const stateCount = hub.states.length;
  const localityCount = hub.states.reduce((acc, stateId) => {
    const state = sudanStates.find(s => s.id === stateId);
    return acc + (state?.localities.length || 0);
  }, 0);
  const siteCount = sites.filter(s => s.hub_id === hub.id).length;
  
  const gradient = hubGradients[hub.id] || 'from-gray-500 to-gray-700';
  
  const stateNames = hub.states
    .map(stateId => sudanStates.find(s => s.id === stateId)?.name)
    .filter(Boolean)
    .slice(0, 3);

  return (
    <Card 
      className="overflow-hidden transition-all duration-300 hover:shadow-lg group"
      data-testid={`card-hub-${hub.id}`}
    >
      <div className={`h-24 bg-gradient-to-br ${gradient} relative p-4`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">{hub.name}</h3>
              {hub.description && (
                <p className="text-sm text-white/80 line-clamp-1">{hub.description}</p>
              )}
            </div>
          </div>
          {canManage && (
            <div className="flex gap-1">
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 text-white bg-white/10 hover:bg-white/30"
                onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                data-testid={`button-edit-hub-${hub.id}`}
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button 
                size="icon" 
                variant="ghost" 
                className="h-8 w-8 text-white bg-white/10 hover:bg-white/30"
                onClick={(e) => { e.stopPropagation(); onDelete?.(); }}
                data-testid={`button-delete-hub-${hub.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <MapPin className="h-3 w-3" />
            </div>
            <p className="text-lg font-bold">{stateCount}</p>
            <p className="text-xs text-muted-foreground">States</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Globe className="h-3 w-3" />
            </div>
            <p className="text-lg font-bold">{localityCount}</p>
            <p className="text-xs text-muted-foreground">Localities</p>
          </div>
          <div className="p-2 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
              <Navigation className="h-3 w-3" />
            </div>
            <p className="text-lg font-bold">{siteCount}</p>
            <p className="text-xs text-muted-foreground">Sites</p>
          </div>
        </div>
        
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Assigned States:</p>
          <div className="flex flex-wrap gap-1">
            {stateNames.map((name, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {name}
              </Badge>
            ))}
            {hub.states.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{hub.states.length - 3} more
              </Badge>
            )}
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={onViewDetails}
          data-testid={`button-view-hub-${hub.id}`}
        >
          View Details
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
