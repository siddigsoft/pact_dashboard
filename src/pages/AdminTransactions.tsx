import React, { useMemo, useState } from "react";
import { useWallet } from "@/context/wallet/WalletContext";
import { useUser } from "@/context/user/UserContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, Check, CircleDollarSign, X } from "lucide-react";

const AdminTransactions: React.FC = () => {
  const { transactions, updateTransactionStatus } = useWallet();
  const { users, currentUser } = useUser();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isFinance = currentUser && (currentUser.role === 'admin' || currentUser.role === 'financialAdmin' || currentUser.role === 'ict');

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    users.forEach(u => { map[u.id] = u.name; });
    return map;
  }, [users]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions
      .filter(t => {
        if (status !== 'all' && t.status !== status) return false;
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;
        if (!q) return true;
        const hay = `${t.description} ${t.reference || ''} ${userMap[t.userId] || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [transactions, status, typeFilter, search, userMap]);

  const handleUpdate = async (id: string, newStatus: 'approved' | 'paid' | 'failed') => {
    setUpdatingId(id);
    try {
      await updateTransactionStatus(id, newStatus);
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground">Review and approve wallet transactions</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and narrow down results</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input placeholder="Search by description, reference, user" value={search} onChange={e => setSearch(e.target.value)} />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="debit">Debit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map(t => (
          <Card key={t.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className={`mt-1 rounded-full p-2 ${t.type === 'credit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                    {t.type === 'credit' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </div>
                  <div>
                    <div className="font-semibold">{t.description}</div>
                    <div className="text-sm text-muted-foreground">{userMap[t.userId] || t.userId}</div>
                    {t.reference && (
                      <div className="text-xs text-muted-foreground">Ref: {t.reference}</div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${t.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'credit' ? '+' : '-'}{t.currency} {t.amount.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString()}</div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="text-sm">
                  <span className="text-muted-foreground">Status: </span>
                  <span className="font-medium">{t.status}</span>
                </div>
                {isFinance && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={updatingId === t.id || t.status === 'paid'} onClick={() => handleUpdate(t.id, 'approved')}>
                      <Check className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" disabled={updatingId === t.id || t.status === 'paid'} onClick={() => handleUpdate(t.id, 'paid')}>
                      <CircleDollarSign className="h-4 w-4 mr-1" /> Mark Paid
                    </Button>
                    <Button size="sm" variant="destructive" disabled={updatingId === t.id || t.status === 'paid'} onClick={() => handleUpdate(t.id, 'failed')}>
                      <X className="h-4 w-4 mr-1" /> Fail
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full text-center text-muted-foreground py-10">No transactions found</div>
        )}
      </div>
    </div>
  );
};

export default AdminTransactions;
