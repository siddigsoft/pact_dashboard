import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBudget } from '@/context/budget/BudgetContext';
import { TrendingUp } from 'lucide-react';

interface TopUpBudgetDialogProps {
  budgetId: string;
  budgetName: string;
  currentBalance: number;
  trigger?: React.ReactNode;
}

export function TopUpBudgetDialog({ budgetId, budgetName, currentBalance, trigger }: TopUpBudgetDialogProps) {
  const { topUpMMPBudget } = useBudget();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0 || !reason) return;

    setLoading(true);
    try {
      await topUpMMPBudget({
        budgetId,
        amountCents: Math.round(parseFloat(amount) * 100),
        reason,
        category: category || undefined,
      });

      setOpen(false);
      resetForm();
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAmount('');
    setCategory('');
    setReason('');
  };

  const newBalance = amount ? currentBalance + parseFloat(amount) : currentBalance;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" data-testid="button-top-up-budget">
            <TrendingUp className="w-4 h-4 mr-2" />
            Top-Up Budget
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Top-Up Budget: {budgetName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="p-3 bg-muted rounded-md">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium">Current Balance:</span>
              <span className="text-sm font-bold">
                SDG {currentBalance.toLocaleString('en-SD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {amount && (
              <div className="flex justify-between items-center text-green-600">
                <span className="text-sm font-medium">New Balance:</span>
                <span className="text-sm font-bold">
                  SDG {newBalance.toLocaleString('en-SD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">Top-Up Amount (SDG)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10000.00"
              data-testid="input-top-up-amount"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">Category (Optional)</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category" data-testid="select-category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="site_visits">Site Visits</SelectItem>
                <SelectItem value="transportation">Transportation</SelectItem>
                <SelectItem value="accommodation">Accommodation</SelectItem>
                <SelectItem value="meals">Meals</SelectItem>
                <SelectItem value="equipment">Equipment</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reason">Reason for Top-Up *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why additional budget is needed..."
              rows={3}
              data-testid="textarea-top-up-reason"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!amount || parseFloat(amount) <= 0 || !reason || loading}
            data-testid="button-submit"
          >
            {loading ? 'Processing...' : 'Top-Up Budget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
