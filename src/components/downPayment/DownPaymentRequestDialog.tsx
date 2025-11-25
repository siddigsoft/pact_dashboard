import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useUser } from '@/context/user/UserContext';
import { Plus, Trash2, DollarSign } from 'lucide-react';
import { PaymentType, InstallmentPlan } from '@/types/down-payment';

interface DownPaymentRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteVisitId?: string;
  mmpSiteEntryId?: string;
  siteName: string;
  transportationBudget: number;
  hubId?: string;
  hubName?: string;
}

export function DownPaymentRequestDialog({
  open,
  onOpenChange,
  siteVisitId,
  mmpSiteEntryId,
  siteName,
  transportationBudget,
  hubId,
  hubName,
}: DownPaymentRequestDialogProps) {
  const { currentUser } = useUser();
  const { createRequest } = useDownPayment();
  
  const [paymentType, setPaymentType] = useState<PaymentType>('full_advance');
  const [requestedAmount, setRequestedAmount] = useState(transportationBudget);
  const [justification, setJustification] = useState('');
  const [installments, setInstallments] = useState<InstallmentPlan[]>([
    { amount: transportationBudget * 0.6, stage: 'before_travel', description: 'Initial down-payment', paid: false },
    { amount: transportationBudget * 0.4, stage: 'after_completion', description: 'Final payment', paid: false },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const handleAddInstallment = () => {
    setInstallments([...installments, { amount: 0, stage: '', description: '', paid: false }]);
  };

  const handleRemoveInstallment = (index: number) => {
    setInstallments(installments.filter((_, i) => i !== index));
  };

  const handleInstallmentChange = (index: number, field: keyof InstallmentPlan, value: any) => {
    const updated = [...installments];
    updated[index] = { ...updated[index], [field]: value };
    setInstallments(updated);
  };

  const handleSubmit = async () => {
    if (!currentUser) return;

    if (!justification.trim()) {
      alert('Please provide justification for this request');
      return;
    }

    if (paymentType === 'installments') {
      const total = installments.reduce((sum, inst) => sum + inst.amount, 0);
      if (total !== requestedAmount) {
        alert(`Installment total (${total} SDG) must equal requested amount (${requestedAmount} SDG)`);
        return;
      }
    }

    setSubmitting(true);
    const success = await createRequest({
      siteVisitId,
      mmpSiteEntryId,
      siteName,
      requestedBy: currentUser.id,
      requesterRole: currentUser.role === 'coordinator' ? 'coordinator' : 'dataCollector',
      hubId,
      hubName,
      totalTransportationBudget: transportationBudget,
      requestedAmount,
      paymentType,
      installmentPlan: paymentType === 'installments' ? installments : [],
      justification,
    });

    setSubmitting(false);
    if (success) {
      onOpenChange(false);
      setJustification('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-down-payment-request">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Request Down-Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="bg-muted/50 p-4 rounded-md">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Site Name</Label>
                <p className="font-medium">{siteName}</p>
              </div>
              <div>
                <Label className="text-muted-foreground">Transportation Budget</Label>
                <p className="font-medium">{transportationBudget} SDG</p>
              </div>
              {hubName && (
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Hub</Label>
                  <p className="font-medium">{hubName}</p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requested-amount">Requested Amount (SDG)</Label>
            <Input
              id="requested-amount"
              type="number"
              value={requestedAmount}
              onChange={(e) => setRequestedAmount(parseFloat(e.target.value) || 0)}
              max={transportationBudget}
              data-testid="input-requested-amount"
            />
            <p className="text-sm text-muted-foreground">
              Maximum: {transportationBudget} SDG (total transportation budget)
            </p>
          </div>

          <div className="space-y-3">
            <Label>Payment Type</Label>
            <RadioGroup value={paymentType} onValueChange={(val) => setPaymentType(val as PaymentType)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="full_advance" id="full_advance" data-testid="radio-full-advance" />
                <Label htmlFor="full_advance" className="font-normal cursor-pointer">
                  Full Advance - Receive entire amount upfront
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="installments" id="installments" data-testid="radio-installments" />
                <Label htmlFor="installments" className="font-normal cursor-pointer">
                  Installments - Receive payment in stages
                </Label>
              </div>
            </RadioGroup>
          </div>

          {paymentType === 'installments' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <Label>Installment Plan</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddInstallment}
                  data-testid="button-add-installment"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Installment
                </Button>
              </div>

              <div className="space-y-3">
                {installments.map((installment, index) => (
                  <div key={index} className="border rounded-md p-3 space-y-3">
                    <div className="flex justify-between items-center">
                      <Label className="text-sm font-medium">Installment {index + 1}</Label>
                      {installments.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveInstallment(index)}
                          data-testid={`button-remove-installment-${index}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`amount-${index}`} className="text-xs">Amount (SDG)</Label>
                        <Input
                          id={`amount-${index}`}
                          type="number"
                          value={installment.amount}
                          onChange={(e) =>
                            handleInstallmentChange(index, 'amount', parseFloat(e.target.value) || 0)
                          }
                          data-testid={`input-installment-amount-${index}`}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`stage-${index}`} className="text-xs">Stage</Label>
                        <Input
                          id={`stage-${index}`}
                          value={installment.stage}
                          onChange={(e) => handleInstallmentChange(index, 'stage', e.target.value)}
                          placeholder="e.g., before_travel"
                          data-testid={`input-installment-stage-${index}`}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor={`description-${index}`} className="text-xs">Description</Label>
                      <Input
                        id={`description-${index}`}
                        value={installment.description}
                        onChange={(e) => handleInstallmentChange(index, 'description', e.target.value)}
                        placeholder="Describe this payment stage"
                        data-testid={`input-installment-description-${index}`}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
                <span className="font-medium">Total Installments:</span>
                <span className="font-bold text-lg">
                  {installments.reduce((sum, inst) => sum + inst.amount, 0).toFixed(2)} SDG
                </span>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="justification">Justification *</Label>
            <Textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Explain why you need this down-payment and how it will be used..."
              rows={4}
              data-testid="textarea-justification"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting} data-testid="button-submit-request">
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
