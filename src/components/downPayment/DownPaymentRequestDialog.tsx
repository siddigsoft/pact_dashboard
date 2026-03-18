import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, DollarSign, AlertTriangle, Banknote } from 'lucide-react';
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
  stateName?: string;
  localityName?: string;
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
  stateName,
  localityName,
}: DownPaymentRequestDialogProps) {
  const { currentUser } = useUser();
  const { createRequest } = useDownPayment();
  const { toast } = useToast();
  
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

    if (!currentUser.bankAccount?.accountNumber) {
      toast({ title: 'Bank Account Required / مطلوب حساب بنكي', description: 'Please add your bank account details in Settings → Profile → Bank Account before requesting an advance.', variant: 'destructive' });
      return;
    }

    if (!justification.trim()) {
      toast({ title: 'Justification Required / المبرر مطلوب', description: 'Please provide a justification for this request.', variant: 'destructive' });
      return;
    }

    if (requestedAmount <= 0) {
      toast({ title: 'Invalid Amount / مبلغ غير صالح', description: 'Requested amount must be greater than zero.', variant: 'destructive' });
      return;
    }

    if (requestedAmount > transportationBudget) {
      toast({ title: 'Budget Exceeded / تجاوز الميزانية', description: `Requested amount (${requestedAmount.toLocaleString()} SDG) cannot exceed the transportation budget (${transportationBudget.toLocaleString()} SDG).`, variant: 'destructive' });
      return;
    }

    if (paymentType === 'installments') {
      const total = installments.reduce((sum, inst) => sum + inst.amount, 0);
      if (total !== requestedAmount) {
        toast({ title: 'Installment Mismatch / خطأ في الأقساط', description: `Installment total (${total.toLocaleString()} SDG) must equal the requested amount (${requestedAmount.toLocaleString()} SDG).`, variant: 'destructive' });
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
      stateName,
      localityName,
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

          {/* Bank Account Gate */}
          {!currentUser?.bankAccount?.accountNumber ? (
            <div className="rounded-lg border border-red-500/40 bg-red-50 dark:bg-red-900/10 p-4 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    Bank Account Required / الحساب البنكي مطلوب
                  </p>
                  <p className="text-xs text-red-500 dark:text-red-300 mt-1">
                    You must add your bank account details in your profile Settings before requesting an advance. / يجب إضافة بيانات حسابك البنكي في الإعدادات قبل طلب السلفة.
                  </p>
                  <a
                    href="/settings"
                    className="inline-block mt-2 text-xs font-semibold text-red-600 dark:text-red-400 underline underline-offset-2"
                    onClick={() => onOpenChange(false)}
                  >
                    Go to Settings → Profile → Bank Account
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/10 p-3 flex items-start gap-2">
              <Banknote className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">Funds will be sent to / سيتم إرسال المبلغ إلى:</p>
                <p><span className="text-emerald-600 dark:text-emerald-400">Account Name:</span> {currentUser.bankAccount.accountName}</p>
                <p><span className="text-emerald-600 dark:text-emerald-400">Account No:</span> {currentUser.bankAccount.accountNumber}</p>
                <p><span className="text-emerald-600 dark:text-emerald-400">Branch:</span> {currentUser.bankAccount.branch}</p>
              </div>
            </div>
          )}

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
              min={0}
              className={requestedAmount > transportationBudget ? 'border-destructive focus-visible:ring-destructive' : ''}
              data-testid="input-requested-amount"
            />
            {requestedAmount > transportationBudget ? (
              <p className="text-sm text-destructive font-medium">
                Amount exceeds budget by {(requestedAmount - transportationBudget).toLocaleString()} SDG
              </p>
            ) : requestedAmount <= 0 ? (
              <p className="text-sm text-destructive font-medium">
                Amount must be greater than zero
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Maximum: {transportationBudget.toLocaleString()} SDG (total transportation budget)
              </p>
            )}
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
                  {installments.reduce((sum, inst) => sum + inst.amount, 0).toLocaleString()} SDG
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
          <Button 
            onClick={handleSubmit} 
            disabled={submitting || requestedAmount <= 0 || requestedAmount > transportationBudget || !currentUser?.bankAccount?.accountNumber} 
            data-testid="button-submit-request"
            title={!currentUser?.bankAccount?.accountNumber ? 'Add bank account in Settings first' : undefined}
          >
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
