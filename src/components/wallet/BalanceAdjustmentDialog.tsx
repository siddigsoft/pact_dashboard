import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useWallet } from '@/context/wallet/WalletContext';
import { Plus, Minus, Loader2 } from 'lucide-react';

interface BalanceAdjustmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  currentBalance: number;
  currency: string;
  onSuccess?: () => void;
}

export function BalanceAdjustmentDialog({
  open,
  onOpenChange,
  userId,
  userName,
  currentBalance,
  currency,
  onSuccess,
}: BalanceAdjustmentDialogProps) {
  const { adminAdjustBalance } = useWallet();
  const [adjustmentType, setAdjustmentType] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return;
    }

    if (!reason.trim()) {
      return;
    }

    setProcessing(true);
    try {
      await adminAdjustBalance(userId, numAmount, currency, reason, adjustmentType);
      setAmount('');
      setReason('');
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to adjust balance:', error);
    } finally {
      setProcessing(false);
    }
  };

  const newBalance = () => {
    const numAmount = parseFloat(amount) || 0;
    if (adjustmentType === 'credit') {
      return currentBalance + numAmount;
    } else {
      return currentBalance - numAmount;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-adjust-balance">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
                {adjustmentType === 'credit' ? (
                  <Plus className="w-5 h-5 text-white" />
                ) : (
                  <Minus className="w-5 h-5 text-white" />
                )}
              </div>
              Admin Balance Adjustment
            </DialogTitle>
            <DialogDescription>
              Manually adjust wallet balance for <span className="font-semibold">{userName}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Adjustment Type</Label>
              <RadioGroup
                value={adjustmentType}
                onValueChange={(value) => setAdjustmentType(value as 'credit' | 'debit')}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="credit" id="credit" data-testid="radio-credit" />
                  <Label htmlFor="credit" className="flex items-center gap-2 cursor-pointer">
                    <Plus className="w-4 h-4 text-green-600" />
                    Credit (Add Funds)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="debit" id="debit" data-testid="radio-debit" />
                  <Label htmlFor="debit" className="flex items-center gap-2 cursor-pointer">
                    <Minus className="w-4 h-4 text-red-600" />
                    Debit (Remove Funds)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Amount ({currency})</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                data-testid="input-adjustment-amount"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Adjustment</Label>
              <Textarea
                id="reason"
                placeholder="Explain why this adjustment is being made..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                rows={3}
                data-testid="input-adjustment-reason"
              />
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Balance:</span>
                <span className="font-medium">{currency} {currentBalance.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Adjustment:</span>
                <span className={`font-medium ${adjustmentType === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                  {adjustmentType === 'credit' ? '+' : '-'} {currency} {parseFloat(amount || '0').toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-2 mt-2">
                <span>New Balance:</span>
                <span className={newBalance() < 0 ? 'text-red-600' : 'text-green-600'}>
                  {currency} {newBalance().toFixed(2)}
                </span>
              </div>
              {newBalance() < 0 && (
                <p className="text-sm text-red-600">⚠️ Warning: This will result in a negative balance</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={processing}
              data-testid="button-cancel-adjustment"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={processing || !amount || !reason.trim() || newBalance() < 0}
              data-testid="button-confirm-adjustment"
            >
              {processing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {processing ? 'Processing...' : `Confirm ${adjustmentType === 'credit' ? 'Credit' : 'Debit'}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
