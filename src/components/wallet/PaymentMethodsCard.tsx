import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Building2, Smartphone, Plus, Trash2, CheckCircle2 } from 'lucide-react';

interface PaymentMethod {
  id: string;
  type: 'bank' | 'mobile_money' | 'card';
  name: string;
  details: string;
  isDefault: boolean;
}

export default function PaymentMethodsCard() {
  const [methods, setMethods] = useState<PaymentMethod[]>([
    {
      id: '1',
      type: 'bank',
      name: 'Bank of Khartoum',
      details: 'Account: ***4532',
      isDefault: true,
    },
  ]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMethod, setNewMethod] = useState({
    type: 'bank' as 'bank' | 'mobile_money' | 'card',
    name: '',
    accountNumber: '',
    bankName: '',
    phoneNumber: '',
    cardNumber: '',
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'bank':
        return <Building2 className="w-5 h-5 text-blue-400" />;
      case 'mobile_money':
        return <Smartphone className="w-5 h-5 text-green-400" />;
      case 'card':
        return <CreditCard className="w-5 h-5 text-purple-400" />;
      default:
        return <CreditCard className="w-5 h-5" />;
    }
  };

  const handleAddMethod = () => {
    const newId = (methods.length + 1).toString();
    let details = '';
    
    if (newMethod.type === 'bank') {
      details = `Account: ***${newMethod.accountNumber.slice(-4)}`;
    } else if (newMethod.type === 'mobile_money') {
      details = `Phone: ${newMethod.phoneNumber}`;
    } else {
      details = `Card: ***${newMethod.cardNumber.slice(-4)}`;
    }

    setMethods([
      ...methods,
      {
        id: newId,
        type: newMethod.type,
        name: newMethod.name || newMethod.bankName,
        details,
        isDefault: false,
      },
    ]);

    setNewMethod({
      type: 'bank',
      name: '',
      accountNumber: '',
      bankName: '',
      phoneNumber: '',
      cardNumber: '',
    });
    setDialogOpen(false);
  };

  const handleRemove = (id: string) => {
    setMethods(methods.filter(m => m.id !== id));
  };

  const handleSetDefault = (id: string) => {
    setMethods(methods.map(m => ({ ...m, isDefault: m.id === id })));
  };

  return (
    <Card className="bg-gradient-to-br from-slate-900/80 to-purple-900/80 border-purple-500/30 backdrop-blur-xl shadow-[0_0_20px_rgba(168,85,247,0.2)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-purple-100 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg">
              <CreditCard className="w-5 h-5 text-purple-400" />
            </div>
            Payment Methods
          </CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button
                type="button"
                className="px-3 py-1.5 text-sm rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] transition inline-flex items-center gap-2"
                data-testid="button-add-payment-method"
              >
                <Plus className="w-3 h-3" />
                Add Method
              </button>
            </DialogTrigger>
            <DialogContent className="bg-gradient-to-br from-slate-900 via-purple-950 to-blue-950 border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.3)]">
              <DialogHeader>
                <DialogTitle className="text-purple-100">Add Payment Method</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 cyber-dialog-form">
                <div className="space-y-2">
                  <Label>Method Type</Label>
                  <Select value={newMethod.type} onValueChange={(v) => setNewMethod({ ...newMethod, type: v as any })}>
                    <SelectTrigger data-testid="select-payment-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="card">Debit/Credit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newMethod.type === 'bank' && (
                  <>
                    <div className="space-y-2">
                      <Label>Bank Name</Label>
                      <Input
                        value={newMethod.bankName}
                        onChange={(e) => setNewMethod({ ...newMethod, bankName: e.target.value })}
                        placeholder="e.g., Bank of Khartoum"
                        data-testid="input-bank-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Account Number</Label>
                      <Input
                        value={newMethod.accountNumber}
                        onChange={(e) => setNewMethod({ ...newMethod, accountNumber: e.target.value })}
                        placeholder="Account number"
                        data-testid="input-account-number"
                      />
                    </div>
                  </>
                )}

                {newMethod.type === 'mobile_money' && (
                  <>
                    <div className="space-y-2">
                      <Label>Provider Name</Label>
                      <Input
                        value={newMethod.name}
                        onChange={(e) => setNewMethod({ ...newMethod, name: e.target.value })}
                        placeholder="e.g., Zain Cash, MTN"
                        data-testid="input-provider-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input
                        value={newMethod.phoneNumber}
                        onChange={(e) => setNewMethod({ ...newMethod, phoneNumber: e.target.value })}
                        placeholder="+249 XXX XXX XXX"
                        data-testid="input-phone-number"
                      />
                    </div>
                  </>
                )}

                {newMethod.type === 'card' && (
                  <>
                    <div className="space-y-2">
                      <Label>Cardholder Name</Label>
                      <Input
                        value={newMethod.name}
                        onChange={(e) => setNewMethod({ ...newMethod, name: e.target.value })}
                        placeholder="Name on card"
                        data-testid="input-cardholder-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Card Number</Label>
                      <Input
                        value={newMethod.cardNumber}
                        onChange={(e) => setNewMethod({ ...newMethod, cardNumber: e.target.value })}
                        placeholder="XXXX XXXX XXXX XXXX"
                        maxLength={16}
                        data-testid="input-card-number"
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 justify-end pt-4 border-t border-purple-500/20">
                  <button
                    type="button"
                    onClick={() => setDialogOpen(false)}
                    className="px-4 py-2 rounded-md bg-slate-800/50 hover:bg-slate-800/70 text-purple-200 border border-purple-500/20 transition"
                    data-testid="button-cancel-payment"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddMethod}
                    disabled={!newMethod.name && !newMethod.bankName}
                    className="px-4 py-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition"
                    data-testid="button-save-payment"
                  >
                    Add Method
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {methods.map((method) => (
          <div
            key={method.id}
            className="p-3 bg-gradient-to-r from-slate-900/50 to-purple-900/20 border border-purple-500/20 rounded-lg hover:border-purple-400/40 transition backdrop-blur-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  {getIcon(method.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-purple-100">{method.name}</p>
                    {method.isDefault && (
                      <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-purple-300/60">{method.details}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!method.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(method.id)}
                    className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition"
                    data-testid={`button-set-default-${method.id}`}
                  >
                    Set Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(method.id)}
                  className="p-1.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition"
                  data-testid={`button-remove-${method.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {methods.length === 0 && (
          <div className="text-center py-8 text-purple-300/40">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No payment methods added</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
