import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useWallet } from '@/context/wallet/WalletContext';
import { Loader2, DollarSign, Bed, Utensils, Bus, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface SiteVisitCostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteVisitId: string;
  siteName?: string;
}

export function SiteVisitCostDialog({ open, onOpenChange, siteVisitId, siteName }: SiteVisitCostDialogProps) {
  const { assignSiteVisitCost, updateSiteVisitCost, getSiteVisitCost } = useWallet();
  const [loading, setLoading] = useState(false);
  const [existingCost, setExistingCost] = useState<any>(null);
  const [formData, setFormData] = useState({
    transportationCost: 0,
    accommodationCost: 0,
    mealAllowance: 0,
    otherCosts: 0,
    costNotes: '',
  });

  useEffect(() => {
    if (open && siteVisitId) {
      loadExistingCost();
    }
  }, [open, siteVisitId]);

  const loadExistingCost = async () => {
    const cost = await getSiteVisitCost(siteVisitId);
    if (cost) {
      setExistingCost(cost);
      setFormData({
        transportationCost: cost.transportationCost,
        accommodationCost: cost.accommodationCost,
        mealAllowance: cost.mealAllowance,
        otherCosts: cost.otherCosts,
        costNotes: cost.costNotes || '',
      });
    } else {
      setExistingCost(null);
      setFormData({
        transportationCost: 0,
        accommodationCost: 0,
        mealAllowance: 0,
        otherCosts: 0,
        costNotes: '',
      });
    }
  };

  const calculateTotal = () => {
    return (
      formData.transportationCost +
      formData.accommodationCost +
      formData.mealAllowance +
      formData.otherCosts
    );
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (existingCost) {
        await updateSiteVisitCost(existingCost.id, {
          ...formData,
          currency: 'SDG',
        });
      } else {
        await assignSiteVisitCost(siteVisitId, {
          ...formData,
          currency: 'SDG',
        });
      }
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof typeof formData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: typeof value === 'string' ? value : value,
    }));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-SD', {
      style: 'currency',
      currency: 'SDG',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" />
            {existingCost ? 'Update' : 'Assign'} Site Visit Cost
          </DialogTitle>
          <DialogDescription>
            {siteName && <span className="font-medium text-foreground">{siteName}</span>}
            {' '}Set the cost breakdown for this site visit. All amounts are in SDG.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p>
                  These costs will be automatically added to the enumerator's wallet when the site visit is marked as completed.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="transportation" className="flex items-center gap-2">
                <Bus className="w-4 h-4" />
                Transportation Cost
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  SDG
                </span>
                <Input
                  id="transportation"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.transportationCost}
                  onChange={(e) => handleInputChange('transportationCost', parseFloat(e.target.value) || 0)}
                  className="pl-14"
                  data-testid="input-transportation-cost"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accommodation" className="flex items-center gap-2">
                <Bed className="w-4 h-4" />
                Accommodation Cost
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  SDG
                </span>
                <Input
                  id="accommodation"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.accommodationCost}
                  onChange={(e) => handleInputChange('accommodationCost', parseFloat(e.target.value) || 0)}
                  className="pl-14"
                  data-testid="input-accommodation-cost"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meals" className="flex items-center gap-2">
                <Utensils className="w-4 h-4" />
                Meal Allowance
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  SDG
                </span>
                <Input
                  id="meals"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.mealAllowance}
                  onChange={(e) => handleInputChange('mealAllowance', parseFloat(e.target.value) || 0)}
                  className="pl-14"
                  data-testid="input-meal-allowance"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="other" className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Other Costs
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  SDG
                </span>
                <Input
                  id="other"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.otherCosts}
                  onChange={(e) => handleInputChange('otherCosts', parseFloat(e.target.value) || 0)}
                  className="pl-14"
                  data-testid="input-other-costs"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Cost Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any relevant notes about these costs..."
              value={formData.costNotes}
              onChange={(e) => handleInputChange('costNotes', e.target.value)}
              rows={3}
              data-testid="input-cost-notes"
            />
          </div>

          <Separator />

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Total Cost
                </span>
                <span className="text-2xl font-bold tabular-nums text-primary">
                  {formatCurrency(calculateTotal())}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This amount will be added to the enumerator's wallet upon completion
              </p>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || calculateTotal() === 0} data-testid="button-save-cost">
            {loading && <Loader2 className="mr-2 w-4 h-4 animate-spin" />}
            {existingCost ? 'Update' : 'Assign'} Cost
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
