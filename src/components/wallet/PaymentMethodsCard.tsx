import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CreditCard, Building2, Smartphone, Plus, Trash2, CheckCircle2, Edit, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { toast } from 'sonner';

interface PaymentMethod {
  id: string;
  type: 'bank' | 'mobile_money' | 'card';
  name: string;
  account_number?: string;
  bank_name?: string;
  phone_number?: string;
  card_number?: string;
  is_default: boolean;
}

export default function PaymentMethodsCard() {
  const { currentUser } = useAppContext();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMethod, setNewMethod] = useState({
    type: 'bank' as 'bank' | 'mobile_money' | 'card',
    name: '',
    accountNumber: '',
    bankName: '',
    phoneNumber: '',
    cardNumber: '',
  });
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    type: 'bank' as 'bank' | 'mobile_money' | 'card',
    name: '',
    accountNumber: '',
    bankName: '',
    phoneNumber: '',
    cardNumber: '',
  });

  // Operation states
  const [operationLoading, setOperationLoading] = useState({
    add: false,
    edit: false,
    delete: false,
    setDefault: false,
  });
  const [operationTarget, setOperationTarget] = useState<string | null>(null);

  // Prevent multiple simultaneous operations
  const operationInProgress = useRef(false);

  // Cache key for payment methods
  const CACHE_KEY = `payment_methods_${currentUser?.id}`;
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Fetch payment methods from database with caching
  const fetchPaymentMethods = useCallback(async (forceRefresh = false) => {
    if (!currentUser?.id) return;

    try {
      // Check cache first (unless force refresh)
      if (!forceRefresh) {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          const isExpired = Date.now() - timestamp > CACHE_DURATION;

          if (!isExpired) {
            setMethods(data);
            setLoading(false);
            // Fetch fresh data in background
            fetchFreshPaymentMethods();
            return;
          }
        }
      }

      setLoading(true);
      await fetchFreshPaymentMethods();
    } catch (error) {
      console.error('Error fetching payment methods:', error);
      toast.error('Failed to load payment methods');
      // Try to load from cache as fallback
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
        setMethods(data);
        setLoading(false);
      }
    }
  }, [currentUser?.id]);

  // Fetch fresh data from database
  const fetchFreshPaymentMethods = useCallback(async () => {
    if (!currentUser?.id) return;

    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setMethods(data || []);

      // Cache the data
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: data || [],
        timestamp: Date.now()
      }));

    } catch (error) {
      console.error('Error fetching fresh payment methods:', error);
      throw error; // Re-throw to be handled by caller
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, CACHE_KEY]);

  useEffect(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  // Clear cache when user changes
  useEffect(() => {
    if (currentUser?.id) {
      // Clear old cache for different users
      const existingKeys = Object.keys(localStorage).filter(key =>
        key.startsWith('payment_methods_') && key !== CACHE_KEY
      );
      existingKeys.forEach(key => localStorage.removeItem(key));
    }
  }, [currentUser?.id, CACHE_KEY]);

  // Function to clear cache and refresh
  const refreshPaymentMethods = useCallback(() => {
    localStorage.removeItem(CACHE_KEY);
    fetchPaymentMethods(true);
  }, [CACHE_KEY, fetchPaymentMethods]);

  const getDetails = (method: PaymentMethod) => {
    if (method.type === 'bank') {
      return `Account: ***${method.account_number?.slice(-4)}`;
    } else if (method.type === 'mobile_money') {
      return `Phone: ${method.phone_number}`;
    } else {
      return `Card: ***${method.card_number?.slice(-4)}`;
    }
  };

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

  const handleAddMethod = async () => {
    if (!currentUser?.id || operationInProgress.current) return;

    // Prevent empty submissions
    if (!newMethod.name && !newMethod.bankName) {
      toast.error('Please fill in the required fields');
      return;
    }

    operationInProgress.current = true;
    setOperationLoading(prev => ({ ...prev, add: true }));

    try {
      const methodData = {
        user_id: currentUser.id,
        type: newMethod.type,
        name: newMethod.type === 'bank' ? newMethod.bankName : newMethod.name,
        account_number: newMethod.accountNumber || null,
        bank_name: newMethod.bankName || null,
        phone_number: newMethod.phoneNumber || null,
        card_number: newMethod.cardNumber || null,
      };

      const { data, error } = await supabase
        .from('payment_methods')
        .insert(methodData)
        .select()
        .single();

      if (error) throw error;

      // Clear cache and refresh data
      refreshPaymentMethods();

      setNewMethod({
        type: 'bank',
        name: '',
        accountNumber: '',
        bankName: '',
        phoneNumber: '',
        cardNumber: '',
      });
      setDialogOpen(false);
      toast.success('Payment method added successfully');
    } catch (error) {
      console.error('Error adding payment method:', error);
      toast.error('Failed to add payment method');

    } finally {
      setOperationLoading(prev => ({ ...prev, add: false }));
      operationInProgress.current = false;
    }
  };

  const handleEditMethod = async () => {
    if (!editingMethod || !currentUser?.id || operationInProgress.current) return;

    // Prevent empty submissions
    if (!editForm.name && !editForm.bankName) {
      toast.error('Please fill in the required fields');
      return;
    }

    operationInProgress.current = true;
    setOperationLoading(prev => ({ ...prev, edit: true }));
    setOperationTarget(editingMethod.id);

    try {
      const updateData = {
        type: editForm.type,
        name: editForm.type === 'bank' ? editForm.bankName : editForm.name,
        account_number: editForm.accountNumber || null,
        bank_name: editForm.bankName || null,
        phone_number: editForm.phoneNumber || null,
        card_number: editForm.cardNumber || null,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('payment_methods')
        .update(updateData)
        .eq('id', editingMethod.id)
        .select()
        .single();

      if (error) throw error;

      // Clear cache and refresh data
      refreshPaymentMethods();

      setEditDialogOpen(false);
      setEditingMethod(null);
      toast.success('Payment method updated successfully');
    } catch (error) {
      console.error('Error updating payment method:', error);
      toast.error('Failed to update payment method');
      // Revert optimistic update by refetching
      await fetchPaymentMethods();
    } finally {
      setOperationLoading(prev => ({ ...prev, edit: false }));
      setOperationTarget(null);
      operationInProgress.current = false;
    }
  };

  const openEditDialog = (method: PaymentMethod) => {
    setEditingMethod(method);
    setEditForm({
      type: method.type,
      name: method.name,
      accountNumber: method.account_number || '',
      bankName: method.bank_name || '',
      phoneNumber: method.phone_number || '',
      cardNumber: method.card_number || '',
    });
    setEditDialogOpen(true);
  };

  const handleRemove = async (id: string) => {
    if (operationInProgress.current) return;

    operationInProgress.current = true;
    setOperationLoading(prev => ({ ...prev, delete: true }));
    setOperationTarget(id);

    try {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Clear cache and refresh data
      refreshPaymentMethods();

      toast.success('Payment method removed');
    } catch (error) {
      console.error('Error removing payment method:', error);
      toast.error('Failed to remove payment method');
      // Revert optimistic update
      await fetchPaymentMethods();
    } finally {
      setOperationLoading(prev => ({ ...prev, delete: false }));
      setOperationTarget(null);
      operationInProgress.current = false;
    }
  };

  const handleSetDefault = async (id: string) => {
    if (operationInProgress.current) return;

    operationInProgress.current = true;
    setOperationLoading(prev => ({ ...prev, setDefault: true }));
    setOperationTarget(id);

    try {
      // First, unset all defaults for this user
      await supabase
        .from('payment_methods')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('user_id', currentUser?.id);

      // Then set the new default
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Clear cache and refresh data
      refreshPaymentMethods();

      toast.success('Default payment method updated');
    } catch (error) {
      console.error('Error setting default payment method:', error);
      toast.error('Failed to update default payment method');
      // Revert optimistic update
      await fetchPaymentMethods();
    } finally {
      setOperationLoading(prev => ({ ...prev, setDefault: false }));
      setOperationTarget(null);
      operationInProgress.current = false;
    }
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
                    disabled={operationLoading.add || (!newMethod.name && !newMethod.bankName)}
                    className="px-4 py-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                    data-testid="button-save-payment"
                  >
                    {operationLoading.add && <Loader2 className="w-4 h-4 animate-spin" />}
                    Add Method
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Payment Method Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="bg-gradient-to-br from-slate-900 via-purple-950 to-blue-950 border-purple-500/30 shadow-[0_0_50px_rgba(168,85,247,0.3)]">
              <DialogHeader>
                <DialogTitle className="text-purple-100">Edit Payment Method</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 cyber-dialog-form">
                <div className="space-y-2">
                  <Label>Method Type</Label>
                  <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v as any })}>
                    <SelectTrigger data-testid="select-edit-payment-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank Transfer</SelectItem>
                      <SelectItem value="mobile_money">Mobile Money</SelectItem>
                      <SelectItem value="card">Debit/Credit Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {editForm.type === 'bank' && (
                  <>
                    <div className="space-y-2">
                      <Label>Bank Name</Label>
                      <Input
                        value={editForm.bankName}
                        onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                        placeholder="e.g., Bank of Khartoum"
                        data-testid="input-edit-bank-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Account Number</Label>
                      <Input
                        value={editForm.accountNumber}
                        onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })}
                        placeholder="Account number"
                        data-testid="input-edit-account-number"
                      />
                    </div>
                  </>
                )}

                {editForm.type === 'mobile_money' && (
                  <>
                    <div className="space-y-2">
                      <Label>Provider Name</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="e.g., Zain Cash, MTN"
                        data-testid="input-edit-provider-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input
                        value={editForm.phoneNumber}
                        onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                        placeholder="+249 XXX XXX XXX"
                        data-testid="input-edit-phone-number"
                      />
                    </div>
                  </>
                )}

                {editForm.type === 'card' && (
                  <>
                    <div className="space-y-2">
                      <Label>Cardholder Name</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="Name on card"
                        data-testid="input-edit-cardholder-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Card Number</Label>
                      <Input
                        value={editForm.cardNumber}
                        onChange={(e) => setEditForm({ ...editForm, cardNumber: e.target.value })}
                        placeholder="XXXX XXXX XXXX XXXX"
                        maxLength={16}
                        data-testid="input-edit-card-number"
                      />
                    </div>
                  </>
                )}

                <div className="flex gap-3 justify-end pt-4 border-t border-purple-500/20">
                  <button
                    type="button"
                    onClick={() => setEditDialogOpen(false)}
                    className="px-4 py-2 rounded-md bg-slate-800/50 hover:bg-slate-800/70 text-purple-200 border border-purple-500/20 transition"
                    data-testid="button-cancel-edit-payment"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleEditMethod}
                    disabled={operationLoading.edit || (!editForm.name && !editForm.bankName)}
                    className="px-4 py-2 rounded-md bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border border-purple-400/50 shadow-[0_0_15px_rgba(168,85,247,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center gap-2"
                    data-testid="button-save-edit-payment"
                  >
                    {operationLoading.edit && <Loader2 className="w-4 h-4 animate-spin" />}
                    Update Method
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-purple-300/40">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Loading payment methods...</p>
          </div>
        ) : methods.length === 0 ? (
          <div className="text-center py-8 text-purple-300/40">
            <CreditCard className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No payment methods added</p>
          </div>
        ) : (
          methods.map((method) => (
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
                    {method.is_default && (
                      <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-purple-300/60">{getDetails(method)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!method.is_default && (
                  <button
                    type="button"
                    onClick={() => handleSetDefault(method.id)}
                    disabled={operationLoading.setDefault && operationTarget === method.id}
                    className="px-2 py-1 text-xs rounded bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    data-testid={`button-set-default-${method.id}`}
                  >
                    {operationLoading.setDefault && operationTarget === method.id && (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    )}
                    Set Default
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEditDialog(method)}
                  disabled={operationLoading.edit && operationTarget === method.id}
                  className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`button-edit-${method.id}`}
                >
                  {operationLoading.edit && operationTarget === method.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Edit className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(method.id)}
                  disabled={operationLoading.delete && operationTarget === method.id}
                  className="p-1.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`button-remove-${method.id}`}
                >
                  {operationLoading.delete && operationTarget === method.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        ))
      )}

      </CardContent>
    </Card>
  );
}
