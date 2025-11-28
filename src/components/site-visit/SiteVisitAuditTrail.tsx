import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  History, 
  Upload, 
  Send, 
  UserCheck, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  MapPin,
  DollarSign,
  FileCheck,
  XCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/context/user/UserContext';
import { format } from 'date-fns';

interface SiteVisitAuditTrailProps {
  siteVisitId?: string;
  siteCode?: string;
  mmpSiteEntryId?: string;
}

interface AuditStep {
  id: string;
  action: string;
  description: string;
  timestamp: string;
  userId?: string;
  userName?: string;
  icon: any;
  color: string;
  status: 'completed' | 'current' | 'pending';
  details?: Record<string, any>;
}

export function SiteVisitAuditTrail({ 
  siteVisitId, 
  siteCode, 
  mmpSiteEntryId 
}: SiteVisitAuditTrailProps) {
  const [auditSteps, setAuditSteps] = useState<AuditStep[]>([]);
  const [loading, setLoading] = useState(true);
  const { users } = useUser();

  const resolveUserName = (id?: string) => {
    if (!id) return 'System';
    const u = (users || []).find(u => u.id === id);
    return u?.name || (u as any)?.fullName || (u as any)?.username || 'Unknown';
  };

  useEffect(() => {
    const fetchAuditData = async () => {
      try {
        setLoading(true);
        const steps: AuditStep[] = [];
        
        let mmpEntry: any = null;
        let siteVisit: any = null;

        if (mmpSiteEntryId) {
          const { data } = await supabase
            .from('mmp_site_entries')
            .select('*')
            .eq('id', mmpSiteEntryId)
            .single();
          mmpEntry = data;
        } else if (siteCode) {
          const { data } = await supabase
            .from('mmp_site_entries')
            .select('*')
            .eq('site_code', siteCode)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          mmpEntry = data;
        }

        if (siteVisitId) {
          const { data } = await supabase
            .from('site_visits')
            .select('*')
            .eq('id', siteVisitId)
            .single();
          siteVisit = data;

          if (!mmpEntry && siteVisit?.mmp_site_entry_id) {
            const { data: entryData } = await supabase
              .from('mmp_site_entries')
              .select('*')
              .eq('id', siteVisit.mmp_site_entry_id)
              .single();
            mmpEntry = entryData;
          }
        }

        if (mmpEntry?.created_at) {
          steps.push({
            id: 'created',
            action: 'Site Entry Created',
            description: 'Site was added to the Monthly Monitoring Plan',
            timestamp: mmpEntry.created_at,
            userId: mmpEntry.created_by,
            userName: resolveUserName(mmpEntry.created_by),
            icon: Upload,
            color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
            status: 'completed',
            details: {
              project: mmpEntry.project_name,
              hub: mmpEntry.hub_office,
              month: `${mmpEntry.month}/${mmpEntry.year}`
            }
          });
        }

        if (mmpEntry?.dispatched_at) {
          steps.push({
            id: 'dispatched',
            action: 'Site Dispatched',
            description: 'Site was dispatched for field visit',
            timestamp: mmpEntry.dispatched_at,
            userId: mmpEntry.dispatched_by,
            userName: resolveUserName(mmpEntry.dispatched_by),
            icon: Send,
            color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
            status: 'completed',
            details: {
              transportation: mmpEntry.transportation,
              accommodation: mmpEntry.accommodation,
              mealPerDiem: mmpEntry.meal_per_diem,
              logistics: mmpEntry.logistics
            }
          });
        }

        if (mmpEntry?.claimed_at || siteVisit?.assigned_at) {
          const claimedAt = mmpEntry?.claimed_at || siteVisit?.assigned_at;
          const claimedBy = mmpEntry?.claimed_by || siteVisit?.assigned_to;
          steps.push({
            id: 'claimed',
            action: 'Site Claimed/Assigned',
            description: 'Site was claimed by or assigned to an enumerator',
            timestamp: claimedAt,
            userId: claimedBy,
            userName: resolveUserName(claimedBy),
            icon: UserCheck,
            color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30',
            status: 'completed',
            details: {
              enumeratorFee: mmpEntry?.enumerator_fee || siteVisit?.fees?.enumerator_fee
            }
          });
        }

        if (siteVisit?.coordinates?.latitude && siteVisit?.coordinates?.longitude) {
          steps.push({
            id: 'gps_captured',
            action: 'GPS Captured',
            description: 'Location coordinates were recorded during field visit',
            timestamp: siteVisit.updated_at || siteVisit.created_at,
            icon: MapPin,
            color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
            status: 'completed',
            details: {
              latitude: siteVisit.coordinates.latitude,
              longitude: siteVisit.coordinates.longitude
            }
          });
        }

        if (mmpEntry?.cost_acknowledged_at) {
          steps.push({
            id: 'cost_acknowledged',
            action: 'Cost Acknowledged',
            description: 'Cost breakdown was reviewed and acknowledged',
            timestamp: mmpEntry.cost_acknowledged_at,
            userId: mmpEntry.cost_acknowledged_by,
            userName: resolveUserName(mmpEntry.cost_acknowledged_by),
            icon: DollarSign,
            color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
            status: 'completed'
          });
        }

        if (siteVisit?.status === 'Completed' && siteVisit?.completed_at) {
          steps.push({
            id: 'completed',
            action: 'Visit Completed',
            description: 'Field visit was successfully completed',
            timestamp: siteVisit.completed_at,
            icon: CheckCircle2,
            color: 'text-green-600 bg-green-100 dark:bg-green-900/30',
            status: 'completed'
          });
        } else if (siteVisit?.status === 'Cancelled') {
          steps.push({
            id: 'cancelled',
            action: 'Visit Cancelled',
            description: 'The site visit was cancelled',
            timestamp: siteVisit.updated_at,
            icon: XCircle,
            color: 'text-red-600 bg-red-100 dark:bg-red-900/30',
            status: 'completed'
          });
        } else if (siteVisit?.status === 'In Progress') {
          steps.push({
            id: 'in_progress',
            action: 'In Progress',
            description: 'Field visit is currently in progress',
            timestamp: siteVisit.updated_at || siteVisit.created_at,
            icon: Clock,
            color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
            status: 'current'
          });
        }

        const currentStatus = siteVisit?.status || mmpEntry?.status;
        if (currentStatus && !['Completed', 'Cancelled'].includes(currentStatus)) {
          const pendingSteps = [];
          
          if (!steps.find(s => s.id === 'dispatched') && !steps.find(s => s.id === 'claimed')) {
            pendingSteps.push({
              id: 'pending_dispatch',
              action: 'Awaiting Dispatch',
              description: 'Site is pending dispatch to field team',
              timestamp: '',
              icon: Send,
              color: 'text-gray-400 bg-gray-100 dark:bg-gray-800',
              status: 'pending' as const
            });
          }

          if (!steps.find(s => s.id === 'completed') && !steps.find(s => s.id === 'in_progress')) {
            pendingSteps.push({
              id: 'pending_completion',
              action: 'Awaiting Completion',
              description: 'Field visit to be completed',
              timestamp: '',
              icon: FileCheck,
              color: 'text-gray-400 bg-gray-100 dark:bg-gray-800',
              status: 'pending' as const
            });
          }

          steps.push(...pendingSteps);
        }

        steps.sort((a, b) => {
          if (a.status === 'pending' && b.status !== 'pending') return 1;
          if (a.status !== 'pending' && b.status === 'pending') return -1;
          if (!a.timestamp) return 1;
          if (!b.timestamp) return -1;
          return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        });

        setAuditSteps(steps);
      } catch (err) {
        console.error('Error fetching audit data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAuditData();
  }, [siteVisitId, siteCode, mmpSiteEntryId, users]);

  if (loading) {
    return (
      <Card data-testid="card-site-audit-trail">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Workflow Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (auditSteps.length === 0) {
    return (
      <Card data-testid="card-site-audit-trail">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Workflow Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No workflow history available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-site-audit-trail">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Workflow Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-auto max-h-[400px]">
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-border" />
            
            <div className="space-y-4">
              {auditSteps.map((step, index) => {
                const IconComponent = step.icon;
                return (
                  <div 
                    key={step.id} 
                    className="relative flex gap-4"
                    data-testid={`audit-step-${step.id}`}
                  >
                    <div className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full ${step.color}`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    
                    <div className="flex-1 pb-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-medium text-sm">{step.action}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {step.description}
                          </p>
                        </div>
                        {step.status === 'current' && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                            Current
                          </Badge>
                        )}
                        {step.status === 'pending' && (
                          <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-300">
                            Pending
                          </Badge>
                        )}
                      </div>
                      
                      {step.timestamp && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{format(new Date(step.timestamp), 'MMM d, yyyy HH:mm')}</span>
                          {step.userName && step.userName !== 'System' && (
                            <>
                              <span className="text-muted-foreground/50">|</span>
                              <span>by {step.userName}</span>
                            </>
                          )}
                        </div>
                      )}
                      
                      {step.details && Object.keys(step.details).length > 0 && (
                        <div className="mt-2 p-2 rounded-md bg-muted/50 text-xs">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {Object.entries(step.details).map(([key, value]) => {
                              if (value === null || value === undefined) return null;
                              const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                              const displayValue = typeof value === 'number' 
                                ? `${value.toLocaleString()} SDG` 
                                : String(value);
                              return (
                                <div key={key} className="flex justify-between">
                                  <span className="text-muted-foreground">{label}:</span>
                                  <span className="font-medium">{displayValue}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
