import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-700 hover:to-cyan-700 text-white border border-green-400/50 shadow-[0_0_15px_rgba(34,197,94,0.3)] focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 transition inline-flex items-center"
            data-testid="button-top-up-budget"
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            Top-Up Budget
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="bg-gradient-to-br from-slate-900 via-green-950 to-cyan-950 border-green-500/30 shadow-[0_0_50px_rgba(34,197,94,0.3)]">
        <DialogHeader>
          <DialogTitle className="text-green-100">Top-Up Budget: {budgetName}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 cyber-dialog-form">
          <div className="p-3 bg-gradient-to-r from-green-900/20 to-cyan-900/20 backdrop-blur-sm border border-green-500/30 rounded-md shadow-[0_0_15px_rgba(34,197,94,0.2)]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-green-200">Current Balance:</span>
              <span className="text-sm font-bold text-green-100">
                SDG {currentBalance.toLocaleString('en-SD', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            {amount && (
              <div className="flex justify-between items-center text-green-300">
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

        <div className="flex gap-3 justify-end pt-4 border-t border-green-500/20">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-transparent border border-green-500/30 text-green-200 hover:bg-green-900/20 shadow-[0_0_12px_rgba(34,197,94,0.25)] focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 transition disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="button-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!amount || parseFloat(amount) <= 0 || !reason || loading}
            className="px-4 py-2 rounded-md bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-700 hover:to-cyan-700 text-white border border-green-400/50 shadow-[0_0_18px_rgba(34,197,94,0.35)] focus:outline-none focus:ring-2 focus:ring-green-400/70 focus:ring-offset-2 focus:ring-offset-slate-950 transition disabled:opacity-60 disabled:cursor-not-allowed"
            data-testid="button-submit"
          >
            {loading ? 'Processing...' : 'Top-Up Budget'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
