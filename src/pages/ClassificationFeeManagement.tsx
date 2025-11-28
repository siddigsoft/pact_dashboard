import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/context/user/UserContext";
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
  AlertCircle
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
    description: 'Senior data collectors with extensive field experience',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  },
  'B': { 
    label: 'Level B - Intermediate', 
    description: 'Data collectors with moderate experience',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
  },
  'C': { 
    label: 'Level C - Entry Level', 
    description: 'New data collectors in training',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
  },
};

const ClassificationFeeManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useUser();
  
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [useMultiplier, setUseMultiplier] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.roles?.includes('admin' as any);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: fees, error: feesError } = await supabase
        .from('classification_fee_structures')
        .select('*')
        .eq('role_scope', 'dataCollector')
        .order('classification_level');

      if (feesError) throw feesError;

      const { data: classifications, error: classError } = await supabase
        .from('user_classifications')
        .select('classification_level')
        .eq('role_scope', 'dataCollector')
        .eq('is_active', true);

      if (classError) throw classError;

      const counts: Record<string, number> = { A: 0, B: 0, C: 0 };
      classifications?.forEach(c => {
        if (counts[c.classification_level] !== undefined) {
          counts[c.classification_level]++;
        }
      });

      setFeeStructures(fees || []);
      setUserCounts(counts);
      
      const hasNonOneMultiplier = fees?.some(f => f.complexity_multiplier !== 1.0);
      setUseMultiplier(hasNonOneMultiplier || false);
      
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
  };

  const handleFeeChange = (level: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setFeeStructures(prev => 
      prev.map(f => 
        f.classification_level === level 
          ? { ...f, site_visit_base_fee_cents: numValue }
          : f
      )
    );
    setHasChanges(true);
  };

  const handleMultiplierChange = (level: string, value: string) => {
    const numValue = parseFloat(value) || 1.0;
    setFeeStructures(prev => 
      prev.map(f => 
        f.classification_level === level 
          ? { ...f, complexity_multiplier: numValue }
          : f
      )
    );
    setHasChanges(true);
  };

  const toggleMultiplierMode = (enabled: boolean) => {
    setUseMultiplier(enabled);
    if (!enabled) {
      setFeeStructures(prev => 
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
    try {
      for (const fee of feeStructures) {
        const { error } = await supabase
          .from('classification_fee_structures')
          .update({
            site_visit_base_fee_cents: fee.site_visit_base_fee_cents,
            complexity_multiplier: useMultiplier ? fee.complexity_multiplier : 1.0
          })
          .eq('id', fee.id);

        if (error) throw error;
      }

      toast({
        title: 'Fees Updated',
        description: 'Classification fee structure has been saved successfully',
      });
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving fees:', error);
      toast({
        title: 'Error',
        description: 'Failed to save fee structures',
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
            <p className="text-muted-foreground">Set fees for each data collector classification level</p>
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
                  <span className="text-sm">{userCounts[level] || 0} users</span>
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
                      <span className="text-sm text-muted-foreground">Enumerator Receives:</span>
                      <span className="text-xl font-bold text-foreground" data-testid={`text-final-fee-${level}`}>
                        {calculateFinalFee(
                          feeStructures.find(f => f.classification_level === level)?.site_visit_base_fee_cents || 0,
                          useMultiplier 
                            ? (feeStructures.find(f => f.classification_level === level)?.complexity_multiplier || 1.0)
                            : 1.0
                        ).toFixed(0)} SDG
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
