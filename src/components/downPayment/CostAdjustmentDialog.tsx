import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUser } from '@/context/user/UserContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AdjustmentType } from '@/types/cost-adjustment';
import { Calculator, AlertCircle } from 'lucide-react';

interface CostAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteVisitCostId?: string;
  siteVisitId?: string;
  mmpSiteEntryId?: string;
  siteName: string;
  currentCosts: {
    transportation?: number;
    accommodation?: number;
    mealAllowance?: number;
    otherCosts?: number;
  };
  onAdjustmentComplete?: () => void;
}

export function CostAdjustmentDialog({
  open,
  onOpenChange,
  siteVisitCostId,
  siteVisitId,
  mmpSiteEntryId,
  siteName,
  currentCosts,
  onAdjustmentComplete,
}: CostAdjustmentDialogProps) {
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('correction');
  const [newTransportation, setNewTransportation] = useState(currentCosts.transportation || 0);
  const [newAccommodation, setNewAccommodation] = useState(currentCosts.accommodation || 0);
  const [newMealAllowance, setNewMealAllowance] = useState(currentCosts.mealAllowance || 0);
  const [newOtherCosts, setNewOtherCosts] = useState(currentCosts.otherCosts || 0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const previousTotal =
    (currentCosts.transportation || 0) +
    (currentCosts.accommodation || 0) +
    (currentCosts.mealAllowance || 0) +
    (currentCosts.otherCosts || 0);

  const newTotal = newTransportation + newAccommodation + newMealAllowance + newOtherCosts;
  const difference = newTotal - previousTotal;

  const handleSubmit = async () => {
    if (!currentUser) return;

    if (!adjustmentReason.trim()) {
      toast({
        title: 'Required Field',
        description: 'Please provide a reason for this cost adjustment',
        variant: 'destructive',
      });
      return;
    }

    if (newTotal === previousTotal) {
      toast({
        title: 'No Changes',
        description: 'No cost adjustments were made',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);

    try {
      const { error: auditError } = await supabase.from('cost_adjustment_audit').insert({
        site_visit_cost_id: siteVisitCostId,
        site_visit_id: siteVisitId,
        mmp_site_entry_id: mmpSiteEntryId,
        site_name: siteName,
        previous_transportation_cost: currentCosts.transportation,
        previous_accommodation_cost: currentCosts.accommodation,
        previous_meal_allowance: currentCosts.mealAllowance,
        previous_other_costs: currentCosts.otherCosts,
        previous_total_cost: previousTotal,
        new_transportation_cost: newTransportation,
        new_accommodation_cost: newAccommodation,
        new_meal_allowance: newMealAllowance,
        new_other_costs: newOtherCosts,
        new_total_cost: newTotal,
        adjustment_type: adjustmentType,
        adjustment_reason: adjustmentReason,
        adjusted_by: currentUser.id,
        adjusted_by_role: currentUser.role,
        adjusted_by_name: currentUser.name,
        additional_payment_needed: difference > 0 ? difference : 0,
      });

      if (auditError) throw auditError;

      if (siteVisitCostId) {
        const { error: updateError } = await supabase
          .from('site_visit_costs')
          .update({
            transportation_cost: newTransportation,
            accommodation_cost: newAccommodation,
            meal_allowance: newMealAllowance,
            other_costs: newOtherCosts,
            total_cost: newTotal,
            cost_status: 'adjusted',
            updated_at: new Date().toISOString(),
          })
          .eq('id', siteVisitCostId);

        if (updateError) throw updateError;
      }

      toast({
        title: 'Cost Adjusted',
        description: `Costs have been updated. ${difference > 0 ? `Additional payment needed: ${difference} SDG` : ''}`,
      });

      onOpenChange(false);
      onAdjustmentComplete?.();
      setAdjustmentReason('');
    } catch (error: any) {
      console.error('Failed to adjust costs:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to adjust costs',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-cost-adjustment">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" />
            Adjust Site Visit Costs
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 p-4 rounded-md">
            <div className="flex gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-yellow-800 dark:text-yellow-200">Admin-Only Cost Adjustment</p>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  All cost adjustments require mandatory justification and are logged in the audit trail.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 p-4 rounded-md">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Site Name</Label>
                <p className="font-medium">{siteName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Previous Total</Label>
                <p className="font-medium">{previousTotal.toFixed(2)} SDG</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Adjustment Type</Label>
            <RadioGroup value={adjustmentType} onValueChange={(val) => setAdjustmentType(val as AdjustmentType)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="increase" id="increase" data-testid="radio-increase" />
                <Label htmlFor="increase" className="font-normal cursor-pointer">
                  Increase - Costs were underestimated
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="decrease" id="decrease" data-testid="radio-decrease" />
                <Label htmlFor="decrease" className="font-normal cursor-pointer">
                  Decrease - Costs were overestimated
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="correction" id="correction" data-testid="radio-correction" />
                <Label htmlFor="correction" className="font-normal cursor-pointer">
                  Correction - Fix calculation errors
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="transportation">Transportation (SDG)</Label>
              <Input
                id="transportation"
                type="number"
                value={newTransportation}
                onChange={(e) => setNewTransportation(parseFloat(e.target.value) || 0)}
                data-testid="input-transportation"
              />
              <p className="text-xs text-muted-foreground">
                Previous: {currentCosts.transportation || 0} SDG
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accommodation">Accommodation (SDG)</Label>
              <Input
                id="accommodation"
                type="number"
                value={newAccommodation}
                onChange={(e) => setNewAccommodation(parseFloat(e.target.value) || 0)}
                data-testid="input-accommodation"
              />
              <p className="text-xs text-muted-foreground">
                Previous: {currentCosts.accommodation || 0} SDG
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meal">Meal Allowance (SDG)</Label>
              <Input
                id="meal"
                type="number"
                value={newMealAllowance}
                onChange={(e) => setNewMealAllowance(parseFloat(e.target.value) || 0)}
                data-testid="input-meal"
              />
              <p className="text-xs text-muted-foreground">
                Previous: {currentCosts.mealAllowance || 0} SDG
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="other">Other Costs (SDG)</Label>
              <Input
                id="other"
                type="number"
                value={newOtherCosts}
                onChange={(e) => setNewOtherCosts(parseFloat(e.target.value) || 0)}
                data-testid="input-other"
              />
              <p className="text-xs text-muted-foreground">
                Previous: {currentCosts.otherCosts || 0} SDG
              </p>
            </div>
          </div>

          <div className="flex justify-between items-center p-4 bg-primary/10 rounded-md border border-primary/20">
            <div>
              <p className="text-sm font-medium">New Total Cost:</p>
              <p className="text-2xl font-bold text-primary">{newTotal.toFixed(2)} SDG</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Difference:</p>
              <p className={`text-xl font-bold ${difference > 0 ? 'text-red-600' : difference < 0 ? 'text-green-600' : ''}`}>
                {difference > 0 ? '+' : ''}{difference.toFixed(2)} SDG
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="adjustment-reason">
              Adjustment Reason * <span className="text-destructive">(Required)</span>
            </Label>
            <Textarea
              id="adjustment-reason"
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="Provide detailed justification for this cost adjustment..."
              rows={4}
              data-testid="textarea-adjustment-reason"
            />
            <p className="text-xs text-muted-foreground">
              This reason will be permanently logged in the audit trail
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid="button-submit-adjustment">
            {submitting ? 'Adjusting...' : 'Submit Adjustment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
