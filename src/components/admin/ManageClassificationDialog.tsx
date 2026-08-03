import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, AlertCircle, History, DollarSign } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  ClassificationLevel,
  ClassificationRoleScope,
  RetainerFrequency,
  UserClassification,
  ClassificationHistory,
  CLASSIFICATION_LABELS,
  ROLE_SCOPE_LABELS,
} from '@/types/classification';
import ClassificationBadge from '@/components/user/ClassificationBadge';
import { useToast } from '@/hooks/use-toast';

interface ManageClassificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentClassification?: UserClassification;
  classificationHistory?: ClassificationHistory[];
  onSave: (data: ClassificationFormData) => Promise<void>;
}

export interface ClassificationFormData {
  classificationLevel: ClassificationLevel;
  roleScope: ClassificationRoleScope;
  effectiveFrom: string;
  effectiveUntil?: string;
  hasRetainer: boolean;
  retainerAmountCents: number;
  retainerCurrency: string;
  /** Currency that is actually credited to the wallet. When set to a different
   *  value than retainerCurrency the system looks up the exchange rate in
   *  acct_exchange_rates at processing time and converts. Null / same value
   *  means no conversion (pay in the base currency as before). */
  retainerPayoutCurrency: string;
  retainerFrequency: RetainerFrequency;
  changeReason?: string;
  notes?: string;
}

const ManageClassificationDialog: React.FC<ManageClassificationDialogProps> = ({
  open,
  onOpenChange,
  userId,
  userName,
  currentClassification,
  classificationHistory = [],
  onSave,
}) => {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [fxRateExists, setFxRateExists] = useState<boolean | null>(null);
  
  const [formData, setFormData] = useState<ClassificationFormData>({
    classificationLevel: currentClassification?.classificationLevel || 'C',
    roleScope: currentClassification?.roleScope || 'dataCollector',
    effectiveFrom: currentClassification?.effectiveFrom || new Date().toISOString(),
    effectiveUntil: currentClassification?.effectiveUntil,
    hasRetainer: currentClassification?.hasRetainer || false,
    retainerAmountCents: currentClassification?.retainerAmountCents || 0,
    retainerCurrency: currentClassification?.retainerCurrency || 'SDG',
    retainerPayoutCurrency: currentClassification?.retainerPayoutCurrency || currentClassification?.retainerCurrency || 'SDG',
    retainerFrequency: currentClassification?.retainerFrequency || 'monthly',
    changeReason: '',
    notes: '',
  });

  const [effectiveFromDate, setEffectiveFromDate] = useState<Date | undefined>(
    formData.effectiveFrom ? new Date(formData.effectiveFrom) : new Date()
  );
  const [effectiveUntilDate, setEffectiveUntilDate] = useState<Date | undefined>(
    formData.effectiveUntil ? new Date(formData.effectiveUntil) : undefined
  );

  useEffect(() => {
    if (currentClassification) {
      setFormData({
        classificationLevel: currentClassification.classificationLevel,
        roleScope: currentClassification.roleScope,
        effectiveFrom: currentClassification.effectiveFrom,
        effectiveUntil: currentClassification.effectiveUntil,
        hasRetainer: currentClassification.hasRetainer,
        retainerAmountCents: currentClassification.retainerAmountCents,
        retainerCurrency: currentClassification.retainerCurrency,
        retainerPayoutCurrency: currentClassification.retainerPayoutCurrency || currentClassification.retainerCurrency,
        retainerFrequency: currentClassification.retainerFrequency,
        changeReason: '',
        notes: '',
      });
      setEffectiveFromDate(new Date(currentClassification.effectiveFrom));
      if (currentClassification.effectiveUntil) {
        setEffectiveUntilDate(new Date(currentClassification.effectiveUntil));
      } else {
        setEffectiveUntilDate(undefined);
      }
    } else if (open && userId) {
      // Reset to defaults when opening for a user without classification
      const now = new Date();
      setFormData({
        classificationLevel: 'C',
        roleScope: 'dataCollector',
        effectiveFrom: now.toISOString(),
        effectiveUntil: undefined,
        hasRetainer: false,
        retainerAmountCents: 0,
        retainerCurrency: 'SDG',
        retainerPayoutCurrency: 'SDG',
        retainerFrequency: 'monthly',
        changeReason: '',
        notes: '',
      });
      setEffectiveFromDate(now);
      setEffectiveUntilDate(undefined);
    }
  }, [currentClassification, open, userId]);

  // Check whether an exchange rate exists whenever payout currency differs from base
  useEffect(() => {
    const fromCurrency = formData.retainerCurrency;
    const toCurrency = formData.retainerPayoutCurrency;

    if (!formData.hasRetainer || fromCurrency === toCurrency) {
      setFxRateExists(null);
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('acct_exchange_rates')
        .select('id')
        .eq('from_currency', fromCurrency)
        .eq('to_currency', toCurrency)
        .limit(1);

      if (cancelled) return;
      if (error) {
        console.error('[ClassificationDialog] Exchange rate lookup error:', error);
        setFxRateExists(null);
        return;
      }
      setFxRateExists(data && data.length > 0);
    })();

    return () => { cancelled = true; };
  }, [formData.hasRetainer, formData.retainerCurrency, formData.retainerPayoutCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.changeReason?.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Please provide a reason for this classification change',
        variant: 'destructive',
      });
      return;
    }

    if (formData.hasRetainer && formData.retainerAmountCents <= 0) {
      toast({
        title: 'Validation Error',
        description: 'Retainer amount must be greater than zero',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await onSave(formData);
      toast({
        title: 'Success',
        description: 'Classification updated successfully',
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update classification',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetainerAmountChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    setFormData({ ...formData, retainerAmountCents: Math.round(numValue * 100) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4 sm:mx-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-base sm:text-lg">Manage Classification - {userName}</span>
            {currentClassification && (
              <ClassificationBadge 
                level={currentClassification.classificationLevel} 
                roleScope={currentClassification.roleScope}
                size="md"
              />
            )}
          </DialogTitle>
          <DialogDescription className="text-sm">
            Assign or update team member classification level and retainer settings
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Classification Level */}
          <div className="space-y-2">
            <Label htmlFor="classification-level">Classification Level</Label>
            <Select
              value={formData.classificationLevel}
              onValueChange={(value) => setFormData({ ...formData, classificationLevel: value as ClassificationLevel })}
            >
              <SelectTrigger id="classification-level" data-testid="select-classification-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['A', 'B', 'C'] as ClassificationLevel[]).map((level) => (
                  <SelectItem key={level} value={level} data-testid={`option-level-${level}`}>
                    <div className="flex items-center gap-2">
                      <ClassificationBadge level={level} showTooltip={false} />
                      <span>{CLASSIFICATION_LABELS[level]}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Role Scope */}
          <div className="space-y-2">
            <Label htmlFor="role-scope">Role Scope</Label>
            <Select
              value={formData.roleScope}
              onValueChange={(value) => setFormData({ ...formData, roleScope: value as ClassificationRoleScope })}
            >
              <SelectTrigger id="role-scope" data-testid="select-role-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['coordinator', 'dataCollector', 'supervisor'] as ClassificationRoleScope[]).map((scope) => (
                  <SelectItem key={scope} value={scope} data-testid={`option-scope-${scope}`}>
                    {ROLE_SCOPE_LABELS[scope]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Effective Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Effective From</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal min-h-[44px]',
                      !effectiveFromDate && 'text-muted-foreground'
                    )}
                    data-testid="button-effective-from"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {effectiveFromDate ? format(effectiveFromDate, 'PPP') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={effectiveFromDate}
                    onSelect={(date) => {
                      setEffectiveFromDate(date);
                      setFormData({ ...formData, effectiveFrom: date?.toISOString() || '' });
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Effective Until (Optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal min-h-[44px]',
                      !effectiveUntilDate && 'text-muted-foreground'
                    )}
                    data-testid="button-effective-until"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {effectiveUntilDate ? format(effectiveUntilDate, 'PPP') : 'No end date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={effectiveUntilDate}
                    onSelect={(date) => {
                      setEffectiveUntilDate(date);
                      setFormData({ ...formData, effectiveUntil: date?.toISOString() });
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Separator />

          {/* Retainer Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="has-retainer" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Monthly Retainer
                </Label>
                <p className="text-sm text-muted-foreground">
                  Enable recurring monthly payments for this team member
                </p>
              </div>
              <Switch
                id="has-retainer"
                checked={formData.hasRetainer}
                onCheckedChange={(checked) => setFormData({ ...formData, hasRetainer: checked })}
                data-testid="switch-has-retainer"
              />
            </div>

            {formData.hasRetainer && (
              <div className="space-y-4 pl-4 sm:pl-6 border-l-2 border-primary/20">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="retainer-amount">Retainer Amount</Label>
                    <Input
                      id="retainer-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={(formData.retainerAmountCents / 100).toFixed(2)}
                      onChange={(e) => handleRetainerAmountChange(e.target.value)}
                      placeholder="0.00"
                      className="min-h-[44px]"
                      data-testid="input-retainer-amount"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="retainer-currency">Base Currency</Label>
                    <Select
                      value={formData.retainerCurrency}
                      onValueChange={(value) => {
                        // If payout was tracking base, keep them in sync
                        const payoutFollowsBase = formData.retainerPayoutCurrency === formData.retainerCurrency;
                        setFormData({
                          ...formData,
                          retainerCurrency: value,
                          retainerPayoutCurrency: payoutFollowsBase ? value : formData.retainerPayoutCurrency,
                        });
                      }}
                    >
                      <SelectTrigger id="retainer-currency" className="min-h-[44px]" data-testid="select-retainer-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['SDG','USD','EUR','GBP','SAR','AED','QAR','UGX','RWF','KES','SSP'].map((currency) => (
                          <SelectItem key={currency} value={currency} data-testid={`option-currency-${currency}`}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Payout currency — can differ from base for FX conversion */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="retainer-payout-currency">
                      Payout Currency
                      <span className="ml-1 text-xs text-muted-foreground font-normal">(wallet credit currency)</span>
                    </Label>
                    <Select
                      value={formData.retainerPayoutCurrency}
                      onValueChange={(value) => setFormData({ ...formData, retainerPayoutCurrency: value })}
                    >
                      <SelectTrigger id="retainer-payout-currency" className="min-h-[44px]" data-testid="select-retainer-payout-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['SDG','USD','EUR','GBP','SAR','AED','QAR','UGX','RWF','KES','SSP'].map((currency) => (
                          <SelectItem key={currency} value={currency} data-testid={`option-payout-currency-${currency}`}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {formData.retainerPayoutCurrency !== formData.retainerCurrency && fxRateExists === false && (
                      <Alert variant="destructive" className="py-2">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-xs">
                          No exchange rate found for {formData.retainerCurrency} → {formData.retainerPayoutCurrency}. Add one in Exchange Rates before saving, or retainers will fall back to base currency.
                        </AlertDescription>
                      </Alert>
                    )}
                    {formData.retainerPayoutCurrency !== formData.retainerCurrency && fxRateExists === true && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Amount is in {formData.retainerCurrency}. At processing time the system will look up the {formData.retainerCurrency} → {formData.retainerPayoutCurrency} rate in Exchange Rates and convert automatically.
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retainer-frequency">Payment Frequency</Label>
                  <Select
                    value={formData.retainerFrequency}
                    onValueChange={(value) => setFormData({ ...formData, retainerFrequency: value as RetainerFrequency })}
                  >
                    <SelectTrigger id="retainer-frequency" className="min-h-[44px]" data-testid="select-retainer-frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly" data-testid="option-frequency-monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly" data-testid="option-frequency-quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual" data-testid="option-frequency-annual">Annual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Change Reason (Required) */}
          <div className="space-y-2">
            <Label htmlFor="change-reason" className="flex items-center gap-2">
              Change Reason <span className="text-destructive">*</span>
            </Label>
            <Input
              id="change-reason"
              value={formData.changeReason}
              onChange={(e) => setFormData({ ...formData, changeReason: e.target.value })}
              placeholder="e.g., Promotion to Level A due to exceptional performance"
              required
              data-testid="input-change-reason"
            />
          </div>

          {/* Additional Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any additional information about this classification..."
              rows={3}
              data-testid="textarea-notes"
            />
          </div>

          {/* Classification History */}
          {classificationHistory.length > 0 && (
            <>
              <Separator />
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex items-center gap-2"
                  data-testid="button-toggle-history"
                >
                  <History className="h-4 w-4" />
                  {showHistory ? 'Hide' : 'Show'} Classification History ({classificationHistory.length})
                </Button>

                {showHistory && (
                  <div className="space-y-2 pl-4 border-l-2 border-muted">
                    {classificationHistory.map((history) => (
                      <div key={history.id} className="flex items-start gap-3 text-sm">
                        <ClassificationBadge level={history.classificationLevel} size="sm" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{ROLE_SCOPE_LABELS[history.roleScope]}</span>
                            <Badge variant="outline" className="text-xs">
                              {format(new Date(history.effectiveFrom), 'PP')}
                              {history.effectiveUntil && ` - ${format(new Date(history.effectiveUntil), 'PP')}`}
                            </Badge>
                          </div>
                          {history.changeReason && (
                            <p className="text-muted-foreground mt-1">{history.changeReason}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Warning Alert */}
          {currentClassification && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This will update the team member's classification and may affect their site visit fees and wallet calculations.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="min-h-[44px] w-full sm:w-auto order-2 sm:order-1"
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading} 
              className="min-h-[44px] w-full sm:w-auto order-1 sm:order-2"
              data-testid="button-save-classification"
            >
              {isLoading ? 'Saving...' : currentClassification ? 'Update Classification' : 'Assign Classification'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ManageClassificationDialog;
