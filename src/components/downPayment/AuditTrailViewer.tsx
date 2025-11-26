import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { History, Trash2, FileEdit, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { CostAdjustmentAudit } from '@/types/cost-adjustment';
import { DeletionAuditLog } from '@/types/super-admin';

export function AuditTrailViewer() {
  const [costAdjustments, setCostAdjustments] = useState<CostAdjustmentAudit[]>([]);
  const [deletions, setDeletions] = useState<DeletionAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuditData();
  }, []);

  const loadAuditData = async () => {
    setLoading(true);
    try {
      const [costResult, deletionResult] = await Promise.all([
        supabase
          .from('cost_adjustment_audit')
          .select('*')
          .order('adjusted_at', { ascending: false })
          .limit(50),
        supabase
          .from('deletion_audit_log')
          .select('*')
          .order('deleted_at', { ascending: false })
          .limit(50),
      ]);

      if (costResult.data) {
        setCostAdjustments(
          costResult.data.map((item: any) => ({
            id: item.id,
            siteVisitCostId: item.site_visit_cost_id,
            siteVisitId: item.site_visit_id,
            mmpSiteEntryId: item.mmp_site_entry_id,
            siteName: item.site_name,
            previousTransportationCost: item.previous_transportation_cost,
            previousAccommodationCost: item.previous_accommodation_cost,
            previousMealAllowance: item.previous_meal_allowance,
            previousOtherCosts: item.previous_other_costs,
            previousTotalCost: item.previous_total_cost,
            newTransportationCost: item.new_transportation_cost,
            newAccommodationCost: item.new_accommodation_cost,
            newMealAllowance: item.new_meal_allowance,
            newOtherCosts: item.new_other_costs,
            newTotalCost: item.new_total_cost,
            adjustmentType: item.adjustment_type,
            adjustmentReason: item.adjustment_reason,
            supportingDocuments: item.supporting_documents || [],
            adjustedBy: item.adjusted_by,
            adjustedByRole: item.adjusted_by_role,
            adjustedByName: item.adjusted_by_name,
            adjustedAt: item.adjusted_at,
            additionalPaymentNeeded: item.additional_payment_needed,
            additionalPaymentTransactionId: item.additional_payment_transaction_id,
            additionalPaymentProcessed: item.additional_payment_processed,
            additionalPaymentProcessedAt: item.additional_payment_processed_at,
            createdAt: item.created_at,
            metadata: item.metadata || {},
          }))
        );
      }

      if (deletionResult.data) {
        setDeletions(
          deletionResult.data.map((item: any) => ({
            id: item.id,
            tableName: item.table_name,
            recordId: item.record_id,
            recordData: item.record_data,
            deletedBy: item.deleted_by,
            deletedByRole: item.deleted_by_role,
            deletedByName: item.deleted_by_name,
            deletionReason: item.deletion_reason,
            deletedAt: item.deleted_at,
            isRestorable: item.is_restorable,
            restoredAt: item.restored_at,
            restoredBy: item.restored_by,
            restorationNotes: item.restoration_notes,
            createdAt: item.created_at,
            metadata: item.metadata || {},
          }))
        );
      }
    } catch (error) {
      console.error('Failed to load audit data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card data-testid="card-audit-trail">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          Audit Trail
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="cost-adjustments">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cost-adjustments" data-testid="tab-cost-adjustments">
              <FileEdit className="h-4 w-4 mr-2" />
              Cost Adjustments
              <Badge variant="secondary" className="ml-2">
                {costAdjustments.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="deletions" data-testid="tab-deletions">
              <Trash2 className="h-4 w-4 mr-2" />
              Deletions
              <Badge variant="secondary" className="ml-2">
                {deletions.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cost-adjustments" className="mt-4">
            <ScrollArea className="h-[600px] pr-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading...</p>
              ) : costAdjustments.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No cost adjustments found</p>
              ) : (
                <div className="space-y-3">
                  {costAdjustments.map((adjustment) => (
                    <Card key={adjustment.id} className="hover-elevate">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{adjustment.siteName || 'Unknown Site'}</h4>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(adjustment.adjustedAt), 'MMM d, yyyy HH:mm')}
                            </p>
                          </div>
                          <Badge
                            variant={
                              adjustment.adjustmentType === 'increase'
                                ? 'destructive'
                                : adjustment.adjustmentType === 'decrease'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {adjustment.adjustmentType}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <Label className="text-xs text-muted-foreground">Previous Total</Label>
                            <p className="font-medium">{adjustment.previousTotalCost?.toFixed(2)} SDG</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">New Total</Label>
                            <p className="font-medium text-primary">
                              {adjustment.newTotalCost?.toFixed(2)} SDG
                            </p>
                          </div>
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">Difference</Label>
                            <p
                              className={`font-bold ${
                                (adjustment.newTotalCost || 0) - (adjustment.previousTotalCost || 0) > 0
                                  ? 'text-red-600'
                                  : 'text-green-600'
                              }`}
                            >
                              {((adjustment.newTotalCost || 0) - (adjustment.previousTotalCost || 0)) > 0 ? '+' : ''}
                              {((adjustment.newTotalCost || 0) - (adjustment.previousTotalCost || 0)).toFixed(2)} SDG
                            </p>
                          </div>
                        </div>

                        <div className="bg-muted/50 p-3 rounded-md">
                          <Label className="text-xs text-muted-foreground">Adjustment Reason</Label>
                          <p className="text-sm mt-1">{adjustment.adjustmentReason}</p>
                        </div>

                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                          <span>
                            Adjusted by: {adjustment.adjustedByName || 'Unknown'} ({adjustment.adjustedByRole})
                          </span>
                          {adjustment.additionalPaymentNeeded > 0 && (
                            <Badge variant="outline" className="gap-1">
                              <AlertCircle className="h-3 w-3" />
                              +{adjustment.additionalPaymentNeeded} SDG payment needed
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="deletions" className="mt-4">
            <ScrollArea className="h-[600px] pr-4">
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Loading...</p>
              ) : deletions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No deletions found</p>
              ) : (
                <div className="space-y-3">
                  {deletions.map((deletion) => (
                    <Card key={deletion.id} className="hover-elevate border-destructive/20">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium flex items-center gap-2">
                              <Trash2 className="h-4 w-4 text-destructive" />
                              {deletion.tableName} Record Deleted
                            </h4>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(deletion.deletedAt), 'MMM d, yyyy HH:mm')}
                            </p>
                          </div>
                          {deletion.restoredAt ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Restored
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <Trash2 className="h-3 w-3" />
                              Deleted
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <Label className="text-xs text-muted-foreground">Record ID</Label>
                            <p className="font-mono text-xs">{deletion.recordId}</p>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Restorable</Label>
                            <p>{deletion.isRestorable ? 'Yes' : 'No'}</p>
                          </div>
                        </div>

                        <div className="bg-destructive/10 p-3 rounded-md border border-destructive/20">
                          <Label className="text-xs text-muted-foreground">Deletion Reason</Label>
                          <p className="text-sm mt-1">{deletion.deletionReason}</p>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Deleted by: {deletion.deletedByName || 'Unknown'} ({deletion.deletedByRole})
                        </div>

                        {deletion.restoredAt && (
                          <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-md border border-green-200 dark:border-green-900">
                            <Label className="text-xs text-green-800 dark:text-green-200">
                              Restored on {format(new Date(deletion.restoredAt), 'MMM d, yyyy HH:mm')}
                            </Label>
                            {deletion.restorationNotes && (
                              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                                {deletion.restorationNotes}
                              </p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
