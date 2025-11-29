import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { 
  MapPin, 
  Clock, 
  Calendar, 
  Building2, 
  ChevronRight,
  DollarSign,
  Activity
} from 'lucide-react';
import { SiteVisit } from '@/types';
import { format, isValid } from 'date-fns';
import { getStatusColor, getStatusLabel, getStatusDescription } from '@/utils/siteVisitUtils';

interface SiteVisitCardProps {
  visit: SiteVisit;
  showActions?: boolean;
}

const priorityColors: { [key: string]: string } = {
  'high': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'medium': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'low': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

export default function SiteVisitCard({ visit, showActions = true }: SiteVisitCardProps) {
  const priorityStyle = priorityColors[visit.priority] || priorityColors['medium'];
  const dueDate = new Date(visit.dueDate || '');
  const formattedDueDate = isValid(dueDate) ? format(dueDate, 'MMM d, yyyy') : 'N/A';

  return (
    <Card 
      className="overflow-hidden transition-all duration-300 hover:shadow-lg group"
      data-testid={`card-site-visit-${visit.id}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className={`px-2 py-0.5 text-xs rounded-full ${getStatusColor(visit.status, visit.dueDate)}`}>
                {getStatusLabel(visit.status, visit.dueDate)}
              </div>
              <Badge className={priorityStyle} variant="secondary">
                {visit.priority?.charAt(0).toUpperCase() + visit.priority?.slice(1)} Priority
              </Badge>
            </div>
            <CardTitle className="text-base font-semibold truncate group-hover:text-primary transition-colors">
              {visit.siteName}
            </CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3" />
              {visit.locality || 'N/A'}, {visit.state || 'N/A'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="text-xs border-l-2 border-primary/30 pl-2 py-1 bg-primary/5 rounded-r-sm">
          <div className="font-medium text-muted-foreground">Status Details:</div>
          <div className="mt-0.5 text-muted-foreground line-clamp-2">
            {getStatusDescription(visit.status, visit.permitDetails)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">Code: {visit.siteCode || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">Due: {formattedDueDate}</span>
          </div>
        </div>

        <div className="text-sm text-muted-foreground line-clamp-1">
          <Activity className="h-3 w-3 inline mr-1" />
          {visit.activity || visit.mainActivity || 'No activity specified'}
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          {visit.hub && (
            <div className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{visit.hub}</span>
            </div>
          )}
          {(visit.visitTypeRaw || visit.visitType) && (
            <div>
              Type: <span className="font-medium">{visit.visitTypeRaw || visit.visitType}</span>
            </div>
          )}
        </div>

        {visit.cpName && (
          <div className="text-xs text-muted-foreground line-clamp-1">
            CP: <span className="font-medium">{visit.cpName}</span>
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            {visit.fees?.total && (
              <div className="flex items-center gap-1 text-sm font-medium">
                <DollarSign className="h-3 w-3" />
                {`SDG ${Number(visit.fees.total).toLocaleString()}`}
              </div>
            )}
          </div>
        </div>
      </CardContent>
      
      {showActions && (
        <CardFooter className="bg-muted/20 pt-3">
          <Button 
            asChild 
            className="w-full" 
            variant={
              ['pending', 'approved'].includes(visit.status) ? 'outline' :
              ['inProgress', 'assigned'].includes(visit.status) ? 'default' :
              'secondary'
            }
          >
            <Link to={`/site-visits/${visit.id}`}>
              {visit.status === 'completed' ? 'View Details' : 'Manage Visit'}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
