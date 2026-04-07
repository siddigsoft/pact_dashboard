import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/context/user/UserContext";
import { useAuthorization } from "@/hooks/use-authorization";
import { 
  ArrowLeft, 
  Save, 
  RefreshCw, 
  DollarSign,
  Users,
  Award,
  Calculator,
  Info,
  Loader2,
  CheckCircle,
  AlertCircle,
  UserCog,
  ClipboardList
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FeeStructure {
  id: string;
  classification_level: string;
  role_scope: string;
  site_visit_base_fee_cents: number;
  complexity_multiplier: number;
  is_active: boolean;
}

interface UserClassification {
  user_id: string;
  classification_level: string;
  full_name: string;
}

const LEVEL_LABELS: Record<string, { label: string; description: string; color: string }> = {
  'A': { 
    label: 'Level A - Experienced', 
    description: 'Senior staff with extensive field experience',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  },
  'B': { 
    label: 'Level B - Intermediate', 
    description: 'Staff with moderate experience',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  },
  'C': { 
    label: 'Level C - Entry Level', 
    description: 'New staff in training',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
  },
};

type RoleScope = 'dataCollector' | 'coordinator' | 'supervisor';

const ROLE_SCOPE_LABELS: Record<RoleScope, { label: string; icon: typeof Users; description: string }> = {
  'dataCollector': {
    label: 'Data Collectors',
    icon: Users,
    description: 'Field enumerators who collect data at sites'
  },
  'coordinator': {
    label: 'Coordinators',
    icon: ClipboardList,
    description: 'Team leads who coordinate field activities'
  },
  'supervisor': {
    label: 'Supervisors',
    icon: UserCog,
    description: 'Senior staff who oversee multiple teams'
  }
};

interface PendingVisitUpdate {
  visitId: string;
  siteName: string;
  collectorName: string;
  collectorLevel: string;
  currentFee: number;
  newFee: number;
  newCost: number;
  transportFee: number;
  status: string;
  source: 'mmp_site_entries' | 'site_visits';
}

const ClassificationFeeManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  
  // All fee structures for all role scopes
  const [allFeeStructures, setAllFeeStructures] = useState<FeeStructure[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useMultiplier, setUseMultiplier] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedRoleScope, setSelectedRoleScope] = useState<RoleScope>('dataCollector');
  
  // New state for bulk visit fee updates
  const [pendingVisitUpdates, setPendingVisitUpdates] = useState<PendingVisitUpdate[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [updatingVisits, setUpdatingVisits] = useState(false);
  const [showVisitUpdates, setShowVisitUpdates] = useState(false);
  
  // Wallet sync state
  const [syncingWallets, setSyncingWallets] = useState(false);
  const [walletSyncResults, setWalletSyncResults] = useState<{
    updated: number;
    skipped: number;
    failed: number;
    details: Array<{ userName: string; oldEarned: number; newEarned: number; oldBalance: number; newBalance: number }>;
  } | null>(null);

  const isAdmin = hasAnyRole(['admin', 'superAdmin', 'ict']);

  // Get fee structures for current role scope
  const feeStructures = useMemo(() => {
    return allFeeStructures.filter(f => f.role_scope === selectedRoleScope);
  }, [allFeeStructures, selectedRoleScope]);

  // Get user counts for current role scope
  const currentUserCounts = useMemo(() => {
    return userCounts[selectedRoleScope] || { A: 0, B: 0, C: 0 };
  }, [userCounts, selectedRoleScope]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Run queries in parallel for all role scopes
      const [feesResult, classificationsResult] = await Promise.all([
        supabase
          .from('classification_fee_structures')
          .select('*')
          .in('role_scope', ['dataCollector', 'coordinator', 'supervisor'])
          .order('role_scope')
          .order('classification_level'),
        supabase
          .from('user_classifications')
          .select('classification_level, role_scope')
          .in('role_scope', ['dataCollector', 'coordinator', 'supervisor'])
          .eq('is_active', true)
      ]);

      if (feesResult.error) throw feesResult.error;
      if (classificationsResult.error) throw classificationsResult.error;

      // Count classifications per role scope
      const counts: Record<string, Record<string, number>> = {
        dataCollector: { A: 0, B: 0, C: 0 },
        coordinator: { A: 0, B: 0, C: 0 },
        supervisor: { A: 0, B: 0, C: 0 }
      };
      for (const c of classificationsResult.data || []) {
        if (counts[c.role_scope] && counts[c.role_scope][c.classification_level] !== undefined) {
          counts[c.role_scope][c.classification_level]++;
        }
      }

      const fees = feesResult.data || [];
      setAllFeeStructures(fees);
      setUserCounts(counts);
      
      // Check for non-1.0 multipliers
      let hasNonOneMultiplier = false;
      for (const f of fees) {
        if (f.complexity_multiplier !== 1.0) {
          hasNonOneMultiplier = true;
          break;
        }
      }
      setUseMultiplier(hasNonOneMultiplier);
      
    } catch (error) {
      console.error('Error loading fee structures:', error);
      toast({
        title: 'Error',
        description: 'Failed to load fee structures',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadPendingVisitUpdates = useCallback(async () => {
    setLoadingVisits(true);
    try {
      const { data: entries, error: entriesError } = await supabase
        .from('mmp_site_entries')
        .select(`
          id,
          site_name,
          accepted_by,
          enumerator_fee,
          transport_fee,
          cost,
          status
        `)
        .not('accepted_by', 'is', null);

      if (entriesError) throw entriesError;

      if (!entries || entries.length === 0) {
        setPendingVisitUpdates([]);
        toast({
          title: 'No Entries Found',
          description: 'No site entries with assigned collectors found',
        });
        return;
      }

      const collectorIds = [...new Set(entries.map(e => e.accepted_by).filter(Boolean))];
      
      const [profilesResult, classificationsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', collectorIds),
        supabase
          .from('user_classifications')
          .select('user_id, classification_level, role_scope')
          .in('user_id', collectorIds)
          .eq('is_active', true)
      ]);

      if (profilesResult.error) throw profilesResult.error;
      if (classificationsResult.error) throw classificationsResult.error;

      const profileMap = new Map((profilesResult.data || []).map(p => [p.id, p.full_name]));
      const classificationMap = new Map((classificationsResult.data || []).map(c => [c.user_id, { level: c.classification_level, roleScope: c.role_scope }]));
      
      const feeCalcMap = new Map(
        allFeeStructures.map(f => [
          `${f.classification_level}_${f.role_scope}`, 
          Math.round(f.site_visit_base_fee_cents * (f.complexity_multiplier || 1.0))
        ])
      );

      const updates: PendingVisitUpdate[] = [];
      for (const entry of entries) {
        if (!entry.accepted_by) continue;
        
        const classInfo = classificationMap.get(entry.accepted_by);
        const level = classInfo?.level || 'C';
        const roleScope = classInfo?.roleScope || 'dataCollector';
        const newFee = feeCalcMap.get(`${level}_${roleScope}`) || 0;
        const currentFee = Number(entry.enumerator_fee) || 0;
        const transportFee = Number(entry.transport_fee) || 0;
        const newCost = newFee + transportFee;

        if (currentFee !== newFee) {
          updates.push({
            visitId: entry.id,
            siteName: entry.site_name || 'Unknown Site',
            collectorName: profileMap.get(entry.accepted_by) || 'Unknown',
            collectorLevel: level,
            currentFee: currentFee,
            newFee: newFee,
            newCost: newCost,
            transportFee: transportFee,
            status: entry.status || 'unknown',
            source: 'mmp_site_entries'
          });
        }
      }

      setPendingVisitUpdates(updates);
      setShowVisitUpdates(true);

      if (updates.length === 0) {
        toast({
          title: 'All Fees Current',
          description: 'All site entries already have correct fees based on classification',
        });
      } else {
        toast({
          title: `${updates.length} Entries Found`,
          description: `Found ${updates.length} entries with fees that differ from current classification rates`,
        });
      }
    } catch (error: any) {
      console.error('Error loading pending visits:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load visits',
        variant: 'destructive'
      });
    } finally {
      setLoadingVisits(false);
    }
  }, [allFeeStructures, toast]);

  const applyVisitFeeUpdates = async () => {
    if (pendingVisitUpdates.length === 0) return;

    setUpdatingVisits(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const update of pendingVisitUpdates) {
        const { error } = await supabase
          .from('mmp_site_entries')
          .update({ 
            enumerator_fee: update.newFee,
            cost: update.newCost,
            updated_at: new Date().toISOString()
          })
          .eq('id', update.visitId);

        if (error) {
          console.error(`Failed to update entry ${update.visitId}:`, error);
          failCount++;
        } else {
          successCount++;
        }
      }

      if (failCount > 0) {
        toast({
          title: 'Partial Update',
          description: `Updated ${successCount} entries, ${failCount} failed`,
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Fees Updated',
          description: `Successfully updated ${successCount} site entry fees based on classification levels`,
        });
        setPendingVisitUpdates([]);
        setShowVisitUpdates(false);
      }
    } catch (error: any) {
      console.error('Error applying visit updates:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to update entries',
        variant: 'destructive'
      });
    } finally {
      setUpdatingVisits(false);
    }
  };

  const syncWalletBalances = async () => {
    setSyncingWallets(true);
    setWalletSyncResults(null);
    
    try {
      const { data: wallets, error: walletsError } = await supabase
        .from('wallets')
        .select('id, user_id, balances, total_earned, total_withdrawn, profiles:profiles!wallets_user_id_fkey(full_name, email)');
      
      if (walletsError) throw walletsError;
      if (!wallets || wallets.length === 0) {
        toast({ title: 'No Wallets', description: 'No wallets found to sync' });
        setSyncingWallets(false);
        return;
      }

      const classResult = await supabase
        .from('user_classifications')
        .select('user_id, classification_level, role_scope')
        .eq('is_active', true);
      
      const classMap = new Map(
        (classResult.data || []).map(c => [c.user_id, { level: c.classification_level, roleScope: c.role_scope }])
      );

      const feeCalcMap = new Map(
        allFeeStructures.map(f => [
          `${f.classification_level}_${f.role_scope}`,
          Math.round(f.site_visit_base_fee_cents * (f.complexity_multiplier || 1.0))
        ])
      );

      const details: Array<{ userName: string; oldEarned: number; newEarned: number; oldBalance: number; newBalance: number }> = [];
      let updated = 0, skipped = 0, failed = 0;

      for (const wallet of wallets) {
        try {
          const { data: transactions, error: txError } = await supabase
            .from('wallet_transactions')
            .select('id, amount, type, currency, site_visit_id, related_site_visit_id')
            .eq('user_id', wallet.user_id);
          
          if (txError) { failed++; continue; }
          if (!transactions || transactions.length === 0) { skipped++; continue; }

          const earningTxs = transactions.filter(tx => 
            (tx.type === 'earning' || tx.type === 'site_visit_fee') && 
            (tx.site_visit_id || tx.related_site_visit_id)
          );

          if (earningTxs.length > 0) {
            const siteEntryIds = earningTxs
              .map(tx => tx.site_visit_id || tx.related_site_visit_id)
              .filter(Boolean) as string[];
            
            const { data: entries } = await supabase
              .from('mmp_site_entries')
              .select('id, enumerator_fee, transport_fee, cost, accepted_by')
              .in('id', siteEntryIds);

            const entryMap = new Map(
              (entries || []).map(e => [e.id, e])
            );

            for (const tx of earningTxs) {
              const entryId = tx.site_visit_id || tx.related_site_visit_id;
              if (!entryId) continue;
              
              const entry = entryMap.get(entryId);
              if (!entry) continue;

              const userId = entry.accepted_by || wallet.user_id;
              const userClass = classMap.get(userId);
              const level = userClass?.level || 'C';
              const roleScope = userClass?.roleScope || 'dataCollector';
              const classificationFee = feeCalcMap.get(`${level}_${roleScope}`);
              
              const transportFee = Number(entry.transport_fee || 0);
              const correctAmount = classificationFee !== undefined 
                ? classificationFee + transportFee
                : (Number(entry.cost || 0) > 0 ? Number(entry.cost) : (Number(entry.enumerator_fee || 0) + transportFee));
              
              if (correctAmount <= 0) continue;
              
              const currentAmount = Number(tx.amount || 0);
              if (Math.abs(currentAmount - correctAmount) < 0.01) continue;
              
              await supabase
                .from('wallet_transactions')
                .update({ amount: correctAmount })
                .eq('id', tx.id);

              if (classificationFee !== undefined) {
                await supabase
                  .from('mmp_site_entries')
                  .update({ 
                    enumerator_fee: classificationFee,
                    cost: classificationFee + transportFee,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', entryId);
              }
            }
          }

          const { data: allTxs, error: allTxError } = await supabase
            .from('wallet_transactions')
            .select('amount, type, currency')
            .eq('user_id', wallet.user_id);
          
          if (allTxError) { failed++; continue; }

          let newTotalEarned = 0;
          let newTotalWithdrawn = 0;
          const balancesByCurrency: Record<string, number> = {};

          for (const tx of (allTxs || [])) {
            const amt = Number(tx.amount || 0);
            const txCurrency = tx.currency || 'SDG';
            if (!balancesByCurrency[txCurrency]) balancesByCurrency[txCurrency] = 0;

            if (['earning', 'site_visit_fee', 'adjustment', 'bonus'].includes(tx.type)) {
              newTotalEarned += amt;
              balancesByCurrency[txCurrency] += amt;
            } else if (['withdrawal', 'penalty', 'debit'].includes(tx.type)) {
              newTotalWithdrawn += Math.abs(amt);
              balancesByCurrency[txCurrency] -= Math.abs(amt);
            }
          }

          const oldEarned = Number(wallet.total_earned || 0);
          const existingBalances = wallet.balances || {};
          const primaryCurrency = Object.keys(existingBalances)[0] || Object.keys(balancesByCurrency)[0] || 'SDG';
          const oldBalance = Number(existingBalances[primaryCurrency] ?? 0);

          const newBalances: Record<string, number> = {};
          for (const [cur, bal] of Object.entries(balancesByCurrency)) {
            newBalances[cur] = bal;
          }

          const { error: walletUpdateError } = await supabase
            .from('wallets')
            .update({
              total_earned: newTotalEarned,
              total_withdrawn: newTotalWithdrawn,
              balances: newBalances,
              updated_at: new Date().toISOString(),
            })
            .eq('id', wallet.id);

          if (walletUpdateError) {
            failed++;
            continue;
          }

          const profileData = wallet.profiles as any;
          const userName = profileData?.full_name || profileData?.email || wallet.user_id;
          const newBalance = balancesByCurrency[primaryCurrency] || 0;
          
          if (Math.abs(oldEarned - newTotalEarned) > 0.01 || Math.abs(oldBalance - newBalance) > 0.01) {
            details.push({
              userName,
              oldEarned,
              newEarned: newTotalEarned,
              oldBalance,
              newBalance,
            });
            updated++;
          } else {
            skipped++;
          }
        } catch (err) {
          console.error(`Failed to sync wallet for user ${wallet.user_id}:`, err);
          failed++;
        }
      }

      setWalletSyncResults({ updated, skipped, failed, details });
      toast({
        title: 'Wallet Sync Complete',
        description: `${updated} wallets updated, ${skipped} unchanged, ${failed} failed`,
      });
    } catch (error: any) {
      console.error('Wallet sync error:', error);
      toast({
        title: 'Sync Failed',
        description: error?.message || 'Failed to sync wallet balances',
        variant: 'destructive',
      });
    } finally {
      setSyncingWallets(false);
    }
  };

  const handleFeeChange = (level: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setAllFeeStructures(prev => 
      prev.map(f => 
        f.classification_level === level && f.role_scope === selectedRoleScope
          ? { ...f, site_visit_base_fee_cents: numValue }
          : f
      )
    );
    setHasChanges(true);
  };

  const handleMultiplierChange = (level: string, value: string) => {
    const numValue = parseFloat(value) || 1.0;
    setAllFeeStructures(prev => 
      prev.map(f => 
        f.classification_level === level && f.role_scope === selectedRoleScope
          ? { ...f, complexity_multiplier: numValue }
          : f
      )
    );
    setHasChanges(true);
  };

  const toggleMultiplierMode = (enabled: boolean) => {
    setUseMultiplier(enabled);
    if (!enabled) {
      setAllFeeStructures(prev => 
        prev.map(f => ({ ...f, complexity_multiplier: 1.0 }))
      );
    }
    setHasChanges(true);
  };

  const calculateFinalFee = (baseFee: number, multiplier: number): number => {
    return baseFee * multiplier;
  };

  const handleSave = async () => {
    if (!isAdmin) {
      toast({
        title: 'Permission Denied',
        description: 'Only administrators can modify fee structures',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    let successCount = 0;
    let failCount = 0;
    
    try {
      // Check session first
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('[ClassificationFeeManagement] No valid session:', sessionError);
        toast({
          title: 'Session Error',
          description: 'Please log in again to save changes',
          variant: 'destructive'
        });
        return;
      }
      console.log('[ClassificationFeeManagement] Session valid, user:', session.user.email);
      console.log('[ClassificationFeeManagement] Starting save for', allFeeStructures.length, 'fee structures');
      
      for (const fee of allFeeStructures) {
        const updateData = {
          site_visit_base_fee_cents: fee.site_visit_base_fee_cents,
          complexity_multiplier: useMultiplier ? fee.complexity_multiplier : 1.0,
          is_active: true,
          updated_at: new Date().toISOString()
        };
        
        console.log(`[ClassificationFeeManagement] Updating Level ${fee.classification_level} (${fee.role_scope}):`, updateData);
        console.log(`[ClassificationFeeManagement] Fee ID: ${fee.id}`);
        
        // Update by ID - more reliable than composite key matching
        const { data, error, status, statusText } = await supabase
          .from('classification_fee_structures')
          .update(updateData)
          .eq('id', fee.id)
          .select();

        console.log(`[ClassificationFeeManagement] Response status: ${status} ${statusText}`);
        console.log(`[ClassificationFeeManagement] Response data:`, data);
        console.log(`[ClassificationFeeManagement] Response error:`, error);

        if (error) {
          console.error(`[ClassificationFeeManagement] Error updating Level ${fee.classification_level}:`, error.message, error.details, error.hint);
          failCount++;
        } else if (!data || data.length === 0) {
          console.warn(`[ClassificationFeeManagement] No rows updated for Level ${fee.classification_level} - RLS policy may be blocking update`);
          failCount++;
        } else {
          console.log(`[ClassificationFeeManagement] Successfully updated Level ${fee.classification_level}:`, data);
          successCount++;
        }
      }

      if (failCount > 0) {
        toast({
          title: 'Partial Update',
          description: `Updated ${successCount} fees, ${failCount} failed. Check console for details.`,
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Fees Updated',
          description: 'Classification fee structure has been saved successfully',
        });
      }
      
      setHasChanges(false);
      
      // Refresh data after save to confirm changes persisted
      await loadData();
    } catch (error: any) {
      console.error('Error saving fees:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to save fee structures',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You don't have permission to access fee management. Only administrators can view and modify classification fees.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Classification Fee Management</h1>
            <p className="text-muted-foreground">Set fees for each classification level by role type</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate('/classifications')}
            data-testid="button-view-team-classifications"
          >
            <Users className="h-4 w-4 mr-2" />
            View Team Classifications
          </Button>
          <Button
            variant="outline"
            size="default"
            onClick={loadData}
            disabled={loading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            data-testid="button-save-fees"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {hasChanges && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            You have unsaved changes. Click "Save Changes" to apply them.
          </AlertDescription>
        </Alert>
      )}

      {/* Role Scope Tabs */}
      <Tabs value={selectedRoleScope} onValueChange={(v) => setSelectedRoleScope(v as RoleScope)}>
        <TabsList className="grid w-full grid-cols-3">
          {(Object.keys(ROLE_SCOPE_LABELS) as RoleScope[]).map(scope => {
            const RoleIcon = ROLE_SCOPE_LABELS[scope].icon;
            return (
              <TabsTrigger key={scope} value={scope} className="flex items-center gap-2">
                <RoleIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{ROLE_SCOPE_LABELS[scope].label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="mt-2 mb-4">
          <p className="text-sm text-muted-foreground">
            {ROLE_SCOPE_LABELS[selectedRoleScope].description}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {['A', 'B', 'C'].map(level => (
            <Card key={level} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge className={LEVEL_LABELS[level].color}>
                    {LEVEL_LABELS[level].label}
                  </Badge>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span className="text-sm">{currentUserCounts[level] || 0} users</span>
                </div>
              </div>
              <CardDescription className="mt-2">
                {LEVEL_LABELS[level].description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor={`fee-${level}`} className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Base Fee (SDG)
                    </Label>
                    <Input
                      id={`fee-${level}`}
                      type="number"
                      min="0"
                      step="1"
                      value={feeStructures.find(f => f.classification_level === level)?.site_visit_base_fee_cents || 0}
                      onChange={(e) => handleFeeChange(level, e.target.value)}
                      data-testid={`input-fee-${level}`}
                    />
                  </div>

                  {useMultiplier && (
                    <div className="space-y-2">
                      <Label htmlFor={`multiplier-${level}`} className="flex items-center gap-2">
                        <Calculator className="h-4 w-4" />
                        Multiplier
                        <Tooltip>
                          <TooltipTrigger>
                            <Info className="h-3 w-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>1.0 = 100% (no change)</p>
                            <p>1.2 = 120% (20% bonus)</p>
                            <p>0.8 = 80% (20% reduction)</p>
                          </TooltipContent>
                        </Tooltip>
                      </Label>
                      <Input
                        id={`multiplier-${level}`}
                        type="number"
                        min="0.1"
                        max="3"
                        step="0.1"
                        value={feeStructures.find(f => f.classification_level === level)?.complexity_multiplier || 1.0}
                        onChange={(e) => handleMultiplierChange(level, e.target.value)}
                        data-testid={`input-multiplier-${level}`}
                      />
                    </div>
                  )}

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Staff Receives:</span>
                      <span className="text-xl font-bold text-foreground" data-testid={`text-final-fee-${level}`}>
                        {calculateFinalFee(
                          feeStructures.find(f => f.classification_level === level)?.site_visit_base_fee_cents || 0,
                          useMultiplier 
                            ? (feeStructures.find(f => f.classification_level === level)?.complexity_multiplier || 1.0)
                            : 1.0
                        ).toLocaleString()} SDG
                      </span>
                    </div>
                    {useMultiplier && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {feeStructures.find(f => f.classification_level === level)?.site_visit_base_fee_cents || 0} × {feeStructures.find(f => f.classification_level === level)?.complexity_multiplier || 1.0}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Advanced Settings
          </CardTitle>
          <CardDescription>
            Configure how fees are calculated
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="use-multiplier" className="font-medium">Use Complexity Multiplier</Label>
              <p className="text-sm text-muted-foreground">
                Enable to apply bonus/reduction percentages to base fees
              </p>
            </div>
            <Switch
              id="use-multiplier"
              checked={useMultiplier}
              onCheckedChange={toggleMultiplierMode}
              data-testid="switch-use-multiplier"
            />
          </div>

          {!useMultiplier && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Simple Mode:</strong> The base fee you set is exactly what enumerators will receive. No calculations applied.
              </AlertDescription>
            </Alert>
          )}

          {useMultiplier && (
            <Alert>
              <Calculator className="h-4 w-4" />
              <AlertDescription>
                <strong>Multiplier Mode:</strong> Final fee = Base Fee × Multiplier. Use this to give bonuses (1.2 = +20%) or reductions (0.8 = -20%).
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Bulk Update Existing Visits Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                Update Existing Visit Fees
              </CardTitle>
              <CardDescription>
                Apply current fee rates to dispatched/claimed visits
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={loadPendingVisitUpdates}
              disabled={loadingVisits || feeStructures.length === 0}
              data-testid="button-check-visits"
            >
              {loadingVisits ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Check Visits
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!showVisitUpdates && (
            <p className="text-sm text-muted-foreground">
              Click "Check Visits" to find site entries where the enumerator fee doesn't match 
              the current classification-based rate. This checks all entries in mmp_site_entries.
            </p>
          )}
          
          {showVisitUpdates && pendingVisitUpdates.length === 0 && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                All dispatched visits have correct fees. No updates needed.
              </AlertDescription>
            </Alert>
          )}

          {showVisitUpdates && pendingVisitUpdates.length > 0 && (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Found <strong>{pendingVisitUpdates.length}</strong> site entries with fees that don't match current classification rates.
                </AlertDescription>
              </Alert>

              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2 font-medium">Site</th>
                      <th className="text-left p-2 font-medium">Collector</th>
                      <th className="text-left p-2 font-medium">Level</th>
                      <th className="text-right p-2 font-medium">Current Fee</th>
                      <th className="text-right p-2 font-medium">New Fee</th>
                      <th className="text-right p-2 font-medium">Total Cost</th>
                      <th className="text-left p-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingVisitUpdates.slice(0, 10).map((update, index) => (
                      <tr key={update.visitId} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                        <td className="p-2 truncate max-w-[150px]">{update.siteName}</td>
                        <td className="p-2 truncate max-w-[120px]">{update.collectorName}</td>
                        <td className="p-2">
                          <Badge className={LEVEL_LABELS[update.collectorLevel]?.color || ''}>
                            Level {update.collectorLevel}
                          </Badge>
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          {update.currentFee.toLocaleString()} SDG
                        </td>
                        <td className="p-2 text-right font-medium text-green-600 dark:text-green-400">
                          {update.newFee.toLocaleString()} SDG
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          {update.newCost.toLocaleString()} SDG
                        </td>
                        <td className="p-2">
                          <Badge variant="outline">{update.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pendingVisitUpdates.length > 10 && (
                  <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                    ... and {pendingVisitUpdates.length - 10} more visits
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowVisitUpdates(false);
                    setPendingVisitUpdates([]);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={applyVisitFeeUpdates}
                  disabled={updatingVisits}
                  data-testid="button-apply-visit-updates"
                >
                  {updatingVisits ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Update {pendingVisitUpdates.length} Entries
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync Wallet Balances Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Sync Wallet Balances
              </CardTitle>
              <CardDescription>
                Recalculate wallet totals based on updated MMP entry fees
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={syncWalletBalances}
              disabled={syncingWallets}
              data-testid="button-sync-wallets"
            >
              {syncingWallets ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync Wallets
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!walletSyncResults && !syncingWallets && (
            <p className="text-sm text-muted-foreground">
              After updating visit fees, use this to sync wallet balances. This will update each 
              wallet transaction amount to match the corrected MMP entry fees, then recalculate 
              the wallet's total earned and balance.
            </p>
          )}
          
          {syncingWallets && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing wallet balances... This may take a moment.
            </div>
          )}

          {walletSyncResults && (
            <div className="space-y-4">
              <div className="flex gap-4 flex-wrap">
                <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30">
                  {walletSyncResults.updated} Updated
                </Badge>
                <Badge variant="outline">
                  {walletSyncResults.skipped} Unchanged
                </Badge>
                {walletSyncResults.failed > 0 && (
                  <Badge variant="destructive">
                    {walletSyncResults.failed} Failed
                  </Badge>
                )}
              </div>

              {walletSyncResults.details.length > 0 && (
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2 font-medium">User</th>
                        <th className="text-right p-2 font-medium">Old Earned</th>
                        <th className="text-right p-2 font-medium">New Earned</th>
                        <th className="text-right p-2 font-medium">Old Balance</th>
                        <th className="text-right p-2 font-medium">New Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletSyncResults.details.map((d, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                          <td className="p-2 truncate max-w-[150px]">{d.userName}</td>
                          <td className="p-2 text-right text-muted-foreground">
                            {d.oldEarned.toLocaleString()} SDG
                          </td>
                          <td className="p-2 text-right font-medium text-green-600 dark:text-green-400">
                            {d.newEarned.toLocaleString()} SDG
                          </td>
                          <td className="p-2 text-right text-muted-foreground">
                            {d.oldBalance.toLocaleString()} SDG
                          </td>
                          <td className="p-2 text-right font-medium text-green-600 dark:text-green-400">
                            {d.newBalance.toLocaleString()} SDG
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" />
            How It Works
          </CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm dark:prose-invert max-w-none">
          <ol className="space-y-2 text-muted-foreground">
            <li><strong>At Dispatch:</strong> Admin sets only the transport budget (transportation, accommodation, meals, logistics). The enumerator fee shows as "Pending".</li>
            <li><strong>When Claimed:</strong> The system automatically calculates the fee based on the collector's classification level using the rates you set here.</li>
            <li><strong>After Claim:</strong> The total payout (Transport Budget + Collector Fee) is locked and visible to both admin and the enumerator.</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClassificationFeeManagement;
