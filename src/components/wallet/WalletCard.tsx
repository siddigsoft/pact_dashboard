import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Receipt,
  Calendar,
} from 'lucide-react';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface WalletData {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  balances: Record<string, number>;
  totalEarned?: number;
  totalWithdrawn?: number;
  pendingPayouts?: number;
  updatedAt?: string;
  transactions?: Array<{
    id: string;
    type: string;
    amount: number;
    createdAt: string;
    description?: string;
    status?: string;
  }>;
}

interface WalletCardProps {
  wallet: WalletData;
  currency?: string;
  onClick?: (userId: string) => void;
}

const formatCurrency = (cents: number, currency: string = 'SDG') => {
  return new Intl.NumberFormat('en-SD', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

export function WalletCard({ wallet, currency = 'SDG', onClick }: WalletCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  const balance = (wallet.balances?.[currency] || 0) * 100;
  const totalEarned = (wallet.totalEarned || 0) * 100;
  const totalWithdrawn = (wallet.totalWithdrawn || 0) * 100;
  const pendingPayouts = (wallet.pendingPayouts || 0) * 100;
  
  const utilizationRate = totalEarned > 0 ? (totalWithdrawn / totalEarned) * 100 : 0;
  const isActive = balance > 0 || totalEarned > 0;

  const handleCardClick = () => {
    if (onClick) {
      onClick(wallet.userId);
    } else {
      setDetailsOpen(true);
    }
  };

  return (
    <>
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer transition-all group"
        onClick={handleCardClick}
        data-testid={`wallet-card-${wallet.userId}`}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base line-clamp-1">
                  {wallet.userName || wallet.userId}
                </CardTitle>
                <p className="text-sm text-muted-foreground truncate">
                  {wallet.userEmail || 'User Wallet'}
                </p>
              </div>
            </div>
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Balance */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Current Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(balance, currency)}</p>
              </div>
              {balance > 0 ? (
                <TrendingUp className="w-5 h-5 text-green-600" />
              ) : (
                <DollarSign className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowUpRight className="w-3 h-3" />
                <span>Total Earned</span>
              </div>
              <p className="font-semibold">{formatCurrency(totalEarned, currency)}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowDownRight className="w-3 h-3" />
                <span>Withdrawn</span>
              </div>
              <p className="font-semibold">{formatCurrency(totalWithdrawn, currency)}</p>
            </div>
          </div>

          {/* Progress Bar */}
          {totalEarned > 0 && (
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                <span>Payout Progress</span>
                <span>{utilizationRate.toFixed(0)}%</span>
              </div>
              <Progress value={utilizationRate} className="h-1.5" />
            </div>
          )}

          {/* Last Updated */}
          {wallet.updatedAt && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2 border-t">
              <Clock className="w-3 h-3" />
              <span>Updated {format(new Date(wallet.updatedAt), 'MMM dd, yyyy')}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              Wallet Details: {wallet.userName || wallet.userId}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* User Info */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">User ID</p>
                  <p className="font-mono text-sm">{wallet.userId}</p>
                </div>
                {wallet.userEmail && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Email</p>
                    <p className="text-sm">{wallet.userEmail}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Balance Cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Balance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{formatCurrency(balance, currency)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-green-600" />
                    Earned
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{formatCurrency(totalEarned, currency)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-red-600" />
                    Paid Out
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{formatCurrency(totalWithdrawn, currency)}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3 text-yellow-600" />
                    Pending
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xl font-bold">{formatCurrency(pendingPayouts, currency)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Utilization Progress */}
            {totalEarned > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Payout Utilization</span>
                  <span className="text-sm text-muted-foreground">{utilizationRate.toFixed(1)}%</span>
                </div>
                <Progress value={utilizationRate} className="h-3" />
                <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                  <span>Withdrawn from total earnings</span>
                  <span>{formatCurrency(totalEarned - totalWithdrawn, currency)} remaining</span>
                </div>
              </div>
            )}

            {/* Recent Transactions */}
            {wallet.transactions && wallet.transactions.length > 0 && (
              <div>
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Receipt className="w-4 h-4" />
                  Recent Transactions
                </h4>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wallet.transactions.slice(0, 5).map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="font-medium capitalize">
                            {tx.type.replace(/_/g, ' ')}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {tx.description || '-'}
                          </TableCell>
                          <TableCell>
                            <span className={tx.amount > 0 ? 'text-green-600' : 'text-red-600'}>
                              {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount * 100, currency)}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(tx.createdAt), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            {tx.status === 'completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            ) : tx.status === 'pending' ? (
                              <Clock className="w-4 h-4 text-yellow-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-4 border-t">
              <span>Wallet ID: {wallet.id}</span>
              {wallet.updatedAt && (
                <span>Last updated: {format(new Date(wallet.updatedAt), 'MMM dd, yyyy HH:mm')}</span>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
