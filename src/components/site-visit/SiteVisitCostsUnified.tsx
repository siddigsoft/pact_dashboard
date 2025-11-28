import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DollarSign, Truck, Home, UtensilsCrossed, Package, User, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/context/user/UserContext';
import { format } from 'date-fns';

interface SiteVisitCostsUnifiedProps {
  siteVisitId?: string;
  siteCode?: string;
  mmpSiteEntryId?: string;
  registrySiteId?: string;
}

interface UnifiedCostData {
  transportation: number;
  accommodation: number;
  mealPerDiem: number;
  logistics: number;
  enumeratorFee: number;
  totalCost: number;
  currency: string;
  source: 'mmp_entry' | 'site_visit' | 'combined';
  dispatchedAt?: string;
  dispatchedBy?: string;
  claimedAt?: string;
  claimedBy?: string;
  costAcknowledged?: boolean;
  costAcknowledgedAt?: string;
  costAcknowledgedBy?: string;
  status?: string;
}

export function SiteVisitCostsUnified({ 
  siteVisitId, 
  siteCode, 
  mmpSiteEntryId,
  registrySiteId 
}: SiteVisitCostsUnifiedProps) {
  const [costData, setCostData] = useState<UnifiedCostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { users } = useUser();

  const resolveUserName = (id?: string) => {
    if (!id) return undefined;
    const u = (users || []).find(u => u.id === id);
    return u?.name || (u as any)?.fullName || (u as any)?.username;
  };

  useEffect(() => {
    const fetchUnifiedCostData = async () => {
      try {
        setLoading(true);
        setError(null);

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

        if (!mmpEntry && !siteVisit) {
          setCostData(null);
          return;
        }

        const additionalData = mmpEntry?.additional_data || {};
        const visitData = siteVisit?.visit_data || {};
        const fees = siteVisit?.fees || {};

        const transportation = 
          mmpEntry?.transportation ?? 
          additionalData.transportation ?? 
          fees.transportation ?? 
          visitData.transportation ?? 0;
        
        const accommodation = 
          mmpEntry?.accommodation ?? 
          additionalData.accommodation ?? 
          fees.accommodation ?? 
          visitData.accommodation ?? 0;
        
        const mealPerDiem = 
          mmpEntry?.meal_per_diem ?? 
          additionalData.meal_per_diem ?? 
          fees.meal_per_diem ?? 
          visitData.mealPerDiem ?? 0;
        
        const logistics = 
          mmpEntry?.logistics ?? 
          additionalData.logistics ?? 
          fees.logistics ?? 
          visitData.logistics ?? 0;
        
        const enumeratorFee = 
          mmpEntry?.enumerator_fee ?? 
          additionalData.enumerator_fee ?? 
          fees.enumerator_fee ?? 
          visitData.enumeratorFee ?? 0;

        const totalCost = transportation + accommodation + mealPerDiem + logistics + enumeratorFee;

        setCostData({
          transportation,
          accommodation,
          mealPerDiem,
          logistics,
          enumeratorFee,
          totalCost,
          currency: 'SDG',
          source: mmpEntry && siteVisit ? 'combined' : (mmpEntry ? 'mmp_entry' : 'site_visit'),
          dispatchedAt: mmpEntry?.dispatched_at,
          dispatchedBy: mmpEntry?.dispatched_by,
          claimedAt: mmpEntry?.claimed_at || siteVisit?.assigned_at,
          claimedBy: mmpEntry?.claimed_by || siteVisit?.assigned_to,
          costAcknowledged: mmpEntry?.cost_acknowledged,
          costAcknowledgedAt: mmpEntry?.cost_acknowledged_at,
          costAcknowledgedBy: mmpEntry?.cost_acknowledged_by,
          status: siteVisit?.status || mmpEntry?.status
        });

      } catch (err: any) {
        console.error('Error fetching unified cost data:', err);
        setError(err.message || 'Failed to load cost data');
      } finally {
        setLoading(false);
      }
    };

    fetchUnifiedCostData();
  }, [siteVisitId, siteCode, mmpSiteEntryId, registrySiteId]);

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString()} SDG`;
  };

  if (loading) {
    return (
      <Card data-testid="card-site-costs-unified">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Cost Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="card-site-costs-unified">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Cost Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!costData) {
    return (
      <Card data-testid="card-site-costs-unified">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Cost Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No cost information available</p>
        </CardContent>
      </Card>
    );
  }

  const costItems = [
    { icon: Truck, label: 'Transportation', value: costData.transportation, color: 'text-blue-600' },
    { icon: Home, label: 'Accommodation', value: costData.accommodation, color: 'text-green-600' },
    { icon: UtensilsCrossed, label: 'Meal Per Diem', value: costData.mealPerDiem, color: 'text-orange-600' },
    { icon: Package, label: 'Logistics', value: costData.logistics, color: 'text-purple-600' },
    { icon: User, label: 'Enumerator Fee', value: costData.enumeratorFee, color: 'text-indigo-600' },
  ];

  return (
    <Card data-testid="card-site-costs-unified">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Cost Breakdown
          </CardTitle>
          {costData.costAcknowledged && (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Acknowledged
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {costItems.map((item) => (
            <div 
              key={item.label} 
              className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/30"
              data-testid={`cost-item-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-md bg-background ${item.color}`}>
                  <item.icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">{item.label}</span>
              </div>
              <span className="text-sm font-semibold">
                {item.value > 0 ? formatCurrency(item.value) : 'Not set'}
              </span>
            </div>
          ))}
        </div>

        <Separator />

        <div className="flex items-center justify-between py-3 px-4 rounded-md bg-primary/10">
          <span className="text-base font-semibold">Total Cost</span>
          <span className="text-lg font-bold text-primary">
            {costData.totalCost > 0 ? formatCurrency(costData.totalCost) : 'Not set'}
          </span>
        </div>

        {(costData.dispatchedAt || costData.claimedAt || costData.costAcknowledgedAt) && (
          <>
            <Separator />
            <div className="space-y-2 text-xs text-muted-foreground">
              {costData.dispatchedAt && (
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>
                    Dispatched: {format(new Date(costData.dispatchedAt), 'MMM d, yyyy HH:mm')}
                    {costData.dispatchedBy && ` by ${resolveUserName(costData.dispatchedBy) || 'Unknown'}`}
                  </span>
                </div>
              )}
              {costData.claimedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>
                    Claimed: {format(new Date(costData.claimedAt), 'MMM d, yyyy HH:mm')}
                    {costData.claimedBy && ` by ${resolveUserName(costData.claimedBy) || 'Unknown'}`}
                  </span>
                </div>
              )}
              {costData.costAcknowledgedAt && (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  <span>
                    Cost Acknowledged: {format(new Date(costData.costAcknowledgedAt), 'MMM d, yyyy HH:mm')}
                    {costData.costAcknowledgedBy && ` by ${resolveUserName(costData.costAcknowledgedBy) || 'Unknown'}`}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
