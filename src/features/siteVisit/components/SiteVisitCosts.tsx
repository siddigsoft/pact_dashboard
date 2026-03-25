import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface SiteVisitCostsProps {
  siteCode?: string;
  mmpFileId?: string;
}

interface CostData {
  cost: number | null;
  enumerator_fee: number | null;
  transport_fee: number | null;
  cost_acknowledged: boolean | null;
  cost_acknowledged_at: string | null;
  cost_acknowledged_by: string | null;
  additional_data: any;
}

export const SiteVisitCosts = ({ siteCode, mmpFileId }: SiteVisitCostsProps) => {
  const [costData, setCostData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCostData = async () => {
      if (!siteCode && !mmpFileId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        let query = supabase
          .from('mmp_site_entries')
          .select('cost, enumerator_fee, transport_fee, cost_acknowledged, cost_acknowledged_at, cost_acknowledged_by, additional_data')
          .order('updated_at', { ascending: false })
          .limit(1);

        // Prioritize siteCode as it's more specific
        if (siteCode) {
          query = query.eq('site_code', siteCode);
          const { data, error: fetchError } = await query.single();

          if (fetchError) {
            // If no record found, that's okay - just show empty state
            if (fetchError.code === 'PGRST116') {
              setCostData(null);
            } else {
              throw fetchError;
            }
          } else {
            setCostData(data);
          }
        } else if (mmpFileId) {
          // If only mmpFileId is available, get the first entry (most recent)
          query = query.eq('mmp_file_id', mmpFileId);
          const { data, error: fetchError } = await query.maybeSingle();

          if (fetchError) {
            throw fetchError;
          } else if (data) {
            setCostData(data);
          } else {
            setCostData(null);
          }
        } else {
          setCostData(null);
        }
      } catch (err: any) {
        console.error('Error fetching cost data:', err);
        setError(err.message || 'Failed to load cost data');
      } finally {
        setLoading(false);
      }
    };

    fetchCostData();
  }, [siteCode, mmpFileId]);

  if (loading) {
    return (
      <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Costs & Fees
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Costs & Fees
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!costData) {
    return (
      <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Costs & Fees
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No cost information available</p>
        </CardContent>
      </Card>
    );
  }

  // Use only direct columns for fees and cost
  const additionalData = costData.additional_data || {};
  const enumeratorFee = Number(costData.enumerator_fee || 0);
  const transportFee = Number(costData.transport_fee || 0);
  const totalCost = costData.cost ?? (enumeratorFee + transportFee);

  // Format currency (default to SDG)
  const currency = additionalData.currency || 'SDG';

  return (
    <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Costs & Fees
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Item</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Enumerator Fee</TableCell>
              <TableCell className="text-right">
                {enumeratorFee ? `${enumeratorFee.toLocaleString()} ${currency}` : 'Not set'}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Transport Fee</TableCell>
              <TableCell className="text-right">
                {transportFee ? `${transportFee.toLocaleString()} ${currency}` : 'Not set'}
              </TableCell>
            </TableRow>
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell className="font-semibold">Total Cost</TableCell>
              <TableCell className="text-right font-semibold">
                {totalCost ? `${totalCost.toLocaleString()} ${currency}` : 'Not set'}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>

        {costData.cost_acknowledged && (
          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              Cost acknowledged
              {costData.cost_acknowledged_at && (
                <> on {new Date(costData.cost_acknowledged_at).toLocaleDateString()}</>
              )}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

