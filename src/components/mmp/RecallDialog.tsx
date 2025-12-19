import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  RotateCcw,
  AlertTriangle,
  DollarSign,
  Users,
  MapPin,
  Calendar,
  Building2,
  Shield,
  Loader2
} from 'lucide-react';
import { MMPFile } from '@/types';
import {
  RecallTier,
  RecallScopeType,
  RecallScopeFilter,
  RecallRequest,
  RecoveryMethod,
  RECALL_TIER_LABELS,
  RECALL_SCOPE_LABELS,
  RECOVERY_METHOD_LABELS
} from '@/types/recall';
import {
  checkTieredRecallAllowed,
  performTieredRecall,
  getRecallTierForRole,
  canForceRecall,
  computeRecallImpact
} from '@/utils/recallUtils';
import { RecallImpactPreview } from '@/types/recall';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RecallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mmpFile: MMPFile;
  onRecallComplete?: () => void;
}

interface ScopeOption {
  value: string;
  label: string;
  count?: number;
}

export function RecallDialog({
  open,
  onOpenChange,
  mmpFile,
  onRecallComplete
}: RecallDialogProps) {
  const { currentUser: profile } = useAuthorization();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [step, setStep] = useState<'configure' | 'preview'>('configure');
  const [impactPreview, setImpactPreview] = useState<RecallImpactPreview | null>(null);

  const [tier, setTier] = useState<RecallTier>('admin_to_fom');
  const [scopeType, setScopeType] = useState<RecallScopeType>('full_mmp');
  const [scopeFilters, setScopeFilters] = useState<RecallScopeFilter>({});
  const [reason, setReason] = useState('');
  const [isForceRecall, setIsForceRecall] = useState(false);
  const [recoveryMethod, setRecoveryMethod] = useState<RecoveryMethod>('deduct_future');

  const [activities, setActivities] = useState<ScopeOption[]>([]);
  const [sites, setSites] = useState<ScopeOption[]>([]);
  const [localities, setLocalities] = useState<ScopeOption[]>([]);
  const [states, setStates] = useState<ScopeOption[]>([]);
  const [hubs, setHubs] = useState<ScopeOption[]>([]);
  const [cps, setCps] = useState<ScopeOption[]>([]);

  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const userRole = profile?.role || '';
  const canForce = canForceRecall(userRole);
  const defaultTier = getRecallTierForRole(userRole);

  useEffect(() => {
    if (open && defaultTier) {
      setTier(defaultTier);
      loadScopeOptions();
    }
  }, [open, defaultTier]);

  const loadScopeOptions = async () => {
    setIsLoadingOptions(true);
    try {
      const { data: siteEntries } = await supabase
        .from('mmp_site_entries')
        .select('*')
        .eq('mmp_id', mmpFile.id);

      if (siteEntries) {
        const activitySet = new Map<string, number>();
        const siteSet = new Map<string, number>();
        const localitySet = new Map<string, number>();
        const stateSet = new Map<string, number>();
        const hubSet = new Map<string, number>();
        const cpSet = new Map<string, number>();

        siteEntries.forEach((entry: any) => {
          if (entry.activity_name) {
            activitySet.set(entry.activity_name, (activitySet.get(entry.activity_name) || 0) + 1);
          }
          if (entry.site_name) {
            siteSet.set(entry.site_name, (siteSet.get(entry.site_name) || 0) + 1);
          }
          if (entry.locality) {
            localitySet.set(entry.locality, (localitySet.get(entry.locality) || 0) + 1);
          }
          if (entry.state) {
            stateSet.set(entry.state, (stateSet.get(entry.state) || 0) + 1);
          }
          if (entry.hub) {
            hubSet.set(entry.hub, (hubSet.get(entry.hub) || 0) + 1);
          }
          if (entry.cp_name) {
            cpSet.set(entry.cp_name, (cpSet.get(entry.cp_name) || 0) + 1);
          }
        });

        setActivities(Array.from(activitySet).map(([value, count]) => ({ value, label: value, count })));
        setSites(Array.from(siteSet).map(([value, count]) => ({ value, label: value, count })));
        setLocalities(Array.from(localitySet).map(([value, count]) => ({ value, label: value, count })));
        setStates(Array.from(stateSet).map(([value, count]) => ({ value, label: value, count })));
        setHubs(Array.from(hubSet).map(([value, count]) => ({ value, label: value, count })));
        setCps(Array.from(cpSet).map(([value, count]) => ({ value, label: value, count })));
      }
    } catch (error) {
      console.error('Error loading scope options:', error);
    } finally {
      setIsLoadingOptions(false);
    }
  };

  const recallCheck = checkTieredRecallAllowed(mmpFile, tier, isForceRecall, userRole);

  const handleScopeTypeChange = (value: RecallScopeType) => {
    setScopeType(value);
    setSelectedItems([]);
    setScopeFilters({});
  };

  const handleItemToggle = (item: string) => {
    setSelectedItems(prev => {
      const newItems = prev.includes(item)
        ? prev.filter(i => i !== item)
        : [...prev, item];

      const filterKey = getScopeFilterKey(scopeType);
      if (filterKey) {
        setScopeFilters({ [filterKey]: newItems });
      }
      return newItems;
    });
  };

  const getScopeFilterKey = (type: RecallScopeType): keyof RecallScopeFilter | null => {
    switch (type) {
      case 'by_activity': return 'activityIds';
      case 'by_site': return 'siteNames';
      case 'by_locality': return 'localities';
      case 'by_state': return 'states';
      case 'by_hub': return 'hubs';
      case 'by_cp': return 'cpIds';
      default: return null;
    }
  };

  const getScopeOptions = (): ScopeOption[] => {
    switch (scopeType) {
      case 'by_activity': return activities;
      case 'by_site': return sites;
      case 'by_locality': return localities;
      case 'by_state': return states;
      case 'by_hub': return hubs;
      case 'by_cp': return cps;
      default: return [];
    }
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a reason for the recall',
        variant: 'destructive'
      });
      return;
    }

    if (scopeType !== 'full_mmp' && selectedItems.length === 0) {
      toast({
        title: 'Selection Required',
        description: 'Please select at least one item to recall',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);
    try {
      const request: RecallRequest = {
        mmpId: mmpFile.id,
        tier,
        scopeType,
        scopeFilters,
        reason: reason.trim(),
        isForceRecall,
        isCancellationRecall: false,
        recoveryMethod: tier === 'coordinator_to_collector' ? recoveryMethod : undefined
      };

      const result = await performTieredRecall(
        request,
        profile?.id || '',
        profile?.fullName || 'Unknown',
        profile?.email
      );

      if (result.success) {
        toast({
          title: 'Recall Initiated',
          description: `Successfully initiated recall for ${result.affectedSites || 0} sites`,
        });
        onRecallComplete?.();
        onOpenChange(false);
        resetForm();
      } else {
        throw new Error(result.error || 'Failed to initiate recall');
      }
    } catch (error: any) {
      console.error('Recall error:', error);
      toast({
        title: 'Recall Failed',
        description: error.message || 'An error occurred while processing the recall',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setStep('configure');
    setImpactPreview(null);
    setReason('');
    setScopeType('full_mmp');
    setScopeFilters({});
    setSelectedItems([]);
    setIsForceRecall(false);
    setRecoveryMethod('deduct_future');
  };

  const handleShowPreview = async () => {
    if (!reason.trim()) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a reason for the recall',
        variant: 'destructive'
      });
      return;
    }

    if (scopeType !== 'full_mmp' && selectedItems.length === 0) {
      toast({
        title: 'Selection Required',
        description: 'Please select at least one item to recall',
        variant: 'destructive'
      });
      return;
    }

    setIsLoadingPreview(true);
    try {
      const request: RecallRequest = {
        mmpId: mmpFile.id,
        tier,
        scopeType,
        scopeFilters,
        reason: reason.trim(),
        isForceRecall,
        isCancellationRecall: false,
        recoveryMethod: tier === 'coordinator_to_collector' ? recoveryMethod : undefined
      };

      const preview = await computeRecallImpact(request);
      setImpactPreview(preview);
      setStep('preview');
    } catch (error: any) {
      console.error('Preview error:', error);
      toast({
        title: 'Preview Failed',
        description: 'Unable to compute recall impact',
        variant: 'destructive'
      });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const scopeOptions = getScopeOptions();
  const showFinancialOptions = tier === 'coordinator_to_collector' || tier === 'super_admin_approved';
  const isSuperAdmin = userRole.toLowerCase().replace(/\s+/g, '_') === 'super_admin' || 
                       userRole.toLowerCase() === 'superadmin';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="sticky top-0 bg-background z-10 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            Recall MMP
          </DialogTitle>
          <DialogDescription>
            Recall "{mmpFile.name}" from the current workflow stage
          </DialogDescription>
        </DialogHeader>

        <div className="pr-2">
          {step === 'configure' ? (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Recall Tier</Label>
              <Select
                value={tier}
                onValueChange={(v) => setTier(v as RecallTier)}
                disabled={!canForce}
              >
                <SelectTrigger data-testid="select-recall-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin_to_fom">
                    {RECALL_TIER_LABELS.admin_to_fom.en}
                  </SelectItem>
                  <SelectItem value="fom_to_coordinator">
                    {RECALL_TIER_LABELS.fom_to_coordinator.en}
                  </SelectItem>
                  <SelectItem value="coordinator_to_collector">
                    {RECALL_TIER_LABELS.coordinator_to_collector.en}
                  </SelectItem>
                  {isSuperAdmin && mmpFile.status === 'approved' && (
                    <SelectItem value="super_admin_approved">
                      {RECALL_TIER_LABELS.super_admin_approved.en}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {!canForce && (
                <p className="text-xs text-muted-foreground">
                  Your role can only initiate {RECALL_TIER_LABELS[tier].en} recalls
                </p>
              )}
            </div>

            {!recallCheck.canRecall && !isForceRecall && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-medium mb-1">Cannot recall at this stage:</div>
                  <ul className="list-disc list-inside text-sm">
                    {recallCheck.blockers.map((blocker, i) => (
                      <li key={i}>{blocker}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {canForce && (
              <div className="flex items-center gap-3 p-3 border rounded-md bg-amber-50 dark:bg-amber-900/20">
                <Checkbox
                  id="force-recall"
                  checked={isForceRecall}
                  onCheckedChange={(checked) => setIsForceRecall(checked === true)}
                  data-testid="checkbox-force-recall"
                />
                <div className="flex-1">
                  <Label htmlFor="force-recall" className="flex items-center gap-2 cursor-pointer">
                    <Shield className="h-4 w-4 text-amber-600" />
                    Force Recall (Admin Override)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bypass normal restrictions and recall immediately without approval
                  </p>
                </div>
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <Label>Recall Scope</Label>
              <Select
                value={scopeType}
                onValueChange={(v) => handleScopeTypeChange(v as RecallScopeType)}
              >
                <SelectTrigger data-testid="select-recall-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_mmp">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      {RECALL_SCOPE_LABELS.full_mmp.en}
                    </div>
                  </SelectItem>
                  <SelectItem value="by_activity">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {RECALL_SCOPE_LABELS.by_activity.en}
                    </div>
                  </SelectItem>
                  <SelectItem value="by_site">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {RECALL_SCOPE_LABELS.by_site.en}
                    </div>
                  </SelectItem>
                  <SelectItem value="by_locality">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {RECALL_SCOPE_LABELS.by_locality.en}
                    </div>
                  </SelectItem>
                  <SelectItem value="by_state">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {RECALL_SCOPE_LABELS.by_state.en}
                    </div>
                  </SelectItem>
                  <SelectItem value="by_hub">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      {RECALL_SCOPE_LABELS.by_hub.en}
                    </div>
                  </SelectItem>
                  <SelectItem value="by_cp">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {RECALL_SCOPE_LABELS.by_cp.en}
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scopeType !== 'full_mmp' && (
              <div className="space-y-2">
                <Label>
                  Select {RECALL_SCOPE_LABELS[scopeType].en.replace('By ', '')}
                </Label>
                {isLoadingOptions ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : scopeOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No options available for this scope
                  </p>
                ) : (
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-1">
                    {scopeOptions.map((option) => (
                      <div
                        key={option.value}
                        className="flex items-center gap-2 p-2 rounded hover-elevate cursor-pointer"
                        onClick={() => handleItemToggle(option.value)}
                      >
                        <Checkbox
                          checked={selectedItems.includes(option.value)}
                          data-testid={`checkbox-scope-${option.value}`}
                        />
                        <span className="flex-1 text-sm">{option.label}</span>
                        {option.count !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            {option.count} sites
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {selectedItems.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {selectedItems.length} item(s) selected
                  </p>
                )}
              </div>
            )}

            <Separator />

            {showFinancialOptions && (
              <>
                <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                  <DollarSign className="h-4 w-4 text-amber-600" />
                  <AlertDescription>
                    <div className="font-medium text-amber-800 dark:text-amber-200">
                      Financial Impact Detected
                    </div>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      This recall may involve transportation advances that need to be recovered.
                    </p>
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label>Recovery Method</Label>
                  <Select
                    value={recoveryMethod}
                    onValueChange={(v) => setRecoveryMethod(v as RecoveryMethod)}
                  >
                    <SelectTrigger data-testid="select-recovery-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deduct_future">
                        {RECOVERY_METHOD_LABELS.deduct_future.en}
                      </SelectItem>
                      <SelectItem value="cash_return">
                        {RECOVERY_METHOD_LABELS.cash_return.en}
                      </SelectItem>
                      {(userRole === 'super_admin') && (
                        <SelectItem value="write_off">
                          {RECOVERY_METHOD_LABELS.write_off.en}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Recall *</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter the reason for this recall..."
                rows={3}
                data-testid="textarea-recall-reason"
              />
            </div>

            {recallCheck.requiresApproval && !isForceRecall && (
              <Alert>
                <Users className="h-4 w-4" />
                <AlertDescription>
                  This recall requires approval from a supervisor before it takes effect.
                </AlertDescription>
              </Alert>
            )}
          </div>
          ) : (
          <div className="space-y-6 py-4">
            <div className="text-center mb-4">
              <Badge variant="outline" className="text-sm">
                Review Impact Before Confirming
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 border rounded-md bg-muted/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <MapPin className="h-4 w-4" />
                  Affected Sites
                </div>
                <div className="text-2xl font-bold">
                  {impactPreview?.affectedSiteCount || 0}
                </div>
              </div>

              <div className="p-4 border rounded-md bg-muted/30">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Users className="h-4 w-4" />
                  Affected Collectors
                </div>
                <div className="text-2xl font-bold">
                  {impactPreview?.affectedCollectorCount || 0}
                </div>
              </div>
            </div>

            {impactPreview?.hasFinancialImpact && (
              <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
                <DollarSign className="h-4 w-4 text-amber-600" />
                <AlertDescription>
                  <div className="font-medium text-amber-800 dark:text-amber-200">
                    Financial Impact: {impactPreview.financialAmount.toLocaleString()} SDG
                  </div>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    {impactPreview.sitesWithAdvances} site(s) have transportation advances that will require recovery
                  </p>
                </AlertDescription>
              </Alert>
            )}

            {impactPreview?.warnings && impactPreview.warnings.length > 0 && (
              <div className="space-y-2">
                {impactPreview.warnings.map((warning, i) => (
                  <Alert key={i} variant={warning.includes('bypass') || warning.includes('completed') ? 'destructive' : 'default'}>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      {warning}
                    </AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Tier:</span>
                <Badge variant="secondary">{RECALL_TIER_LABELS[tier].en}</Badge>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Scope:</span>
                <span>{impactPreview?.scopeSummary}</span>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Reason:</span>
                <p className="mt-1 p-2 border rounded-md bg-muted/30">{reason}</p>
              </div>
              {tier === 'coordinator_to_collector' && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Recovery Method:</span>
                  <Badge variant="outline">{RECOVERY_METHOD_LABELS[recoveryMethod].en}</Badge>
                </div>
              )}
            </div>

            {impactPreview?.affectedCollectors && impactPreview.affectedCollectors.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Affected Data Collectors ({impactPreview.affectedCollectorCount})</Label>
                  <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                    {impactPreview.affectedCollectors.slice(0, 10).map((collector, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm p-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span>{collector.name}</span>
                        {collector.email && (
                          <span className="text-muted-foreground text-xs">({collector.email})</span>
                        )}
                      </div>
                    ))}
                    {impactPreview.affectedCollectors.length > 10 && (
                      <p className="text-xs text-muted-foreground p-1">
                        +{impactPreview.affectedCollectors.length - 10} more collectors
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {step === 'configure' ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoadingPreview}
                data-testid="button-cancel-recall"
              >
                Cancel
              </Button>
              <Button
                onClick={handleShowPreview}
                disabled={isLoadingPreview || (!recallCheck.canRecall && !isForceRecall)}
                className="gap-2"
                data-testid="button-preview-recall"
              >
                {isLoadingPreview ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Computing Impact...
                  </>
                ) : (
                  <>
                    Review Impact
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep('configure')}
                disabled={isLoading}
                data-testid="button-back-recall"
              >
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isLoading || (impactPreview?.affectedSiteCount === 0)}
                className="gap-2"
                variant={isForceRecall ? 'destructive' : 'default'}
                data-testid="button-confirm-recall"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    {isForceRecall ? 'Force Recall' : 'Confirm Recall'}
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RecallDialog;
