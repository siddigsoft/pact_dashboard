import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, CheckCircle2, AlertTriangle, ArrowRight, Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface LocalityInfo {
  state: string;
  locality: string;
  siteCount: number;
  requiresPermit?: boolean | null;
}

interface LocalityRequirementTriageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localities: LocalityInfo[];
  onComplete: (localityRequirements: Record<string, boolean>) => void;
  onCancel: () => void;
}

export const LocalityRequirementTriageDialog: React.FC<LocalityRequirementTriageDialogProps> = ({
  open,
  onOpenChange,
  localities,
  onComplete,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [requirements, setRequirements] = useState<Record<string, boolean | null>>(() => {
    const initial: Record<string, boolean | null> = {};
    localities.forEach(loc => {
      const key = `${loc.state}|${loc.locality}`;
      initial[key] = loc.requiresPermit ?? null;
    });
    return initial;
  });

  const allAnswered = useMemo(() => {
    return localities.every(loc => {
      const key = `${loc.state}|${loc.locality}`;
      return requirements[key] !== null && requirements[key] !== undefined;
    });
  }, [localities, requirements]);

  const handleRequirementChange = (state: string, locality: string, value: boolean) => {
    const key = `${state}|${locality}`;
    setRequirements(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleComplete = () => {
    const result: Record<string, boolean> = {};
    Object.entries(requirements).forEach(([key, value]) => {
      if (value !== null) {
        result[key] = value;
      }
    });
    onComplete(result);
  };

  const requiredCount = Object.values(requirements).filter(v => v === true).length;
  const notRequiredCount = Object.values(requirements).filter(v => v === false).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Building2 className="h-5 w-5 text-purple-600" />
            Locality Permit Requirements
          </DialogTitle>
          <DialogDescription>
            Please indicate which localities require a local permit for field operations.
            Localities that don't require a permit will be moved directly to CP Verification.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4 py-2 border-b">
          <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700">
            {localities.length} {localities.length === 1 ? 'Locality' : 'Localities'}
          </Badge>
          {requiredCount > 0 && (
            <Badge variant="outline" className="bg-orange-50 border-orange-200 text-orange-700">
              {requiredCount} Require Permit
            </Badge>
          )}
          {notRequiredCount > 0 && (
            <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
              {notRequiredCount} No Permit Needed
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-3">
            {localities.map((loc, index) => {
              const key = `${loc.state}|${loc.locality}`;
              const value = requirements[key];
              
              return (
                <Card 
                  key={key} 
                  className={`transition-colors ${
                    value === true 
                      ? 'border-orange-300 bg-orange-50/50' 
                      : value === false 
                        ? 'border-green-300 bg-green-50/50' 
                        : 'border-gray-200'
                  }`}
                  data-testid={`locality-triage-${index}`}
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          value === true 
                            ? 'bg-orange-200' 
                            : value === false 
                              ? 'bg-green-200' 
                              : 'bg-gray-200'
                        }`}>
                          <MapPin className={`h-4 w-4 ${
                            value === true 
                              ? 'text-orange-700' 
                              : value === false 
                                ? 'text-green-700' 
                                : 'text-gray-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{loc.locality}</p>
                          <p className="text-xs text-muted-foreground">{loc.state}</p>
                          <Badge variant="secondary" className="mt-1 text-xs">
                            {loc.siteCount} {loc.siteCount === 1 ? 'site' : 'sites'}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex-shrink-0">
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Is a locality permit required?
                        </p>
                        <RadioGroup
                          value={value === true ? 'yes' : value === false ? 'no' : ''}
                          onValueChange={(v) => handleRequirementChange(loc.state, loc.locality, v === 'yes')}
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem 
                              value="yes" 
                              id={`${key}-yes`} 
                              className="border-orange-400 text-orange-600"
                              data-testid={`radio-${index}-yes`}
                            />
                            <Label 
                              htmlFor={`${key}-yes`} 
                              className="text-sm cursor-pointer flex items-center gap-1"
                            >
                              <AlertTriangle className="h-3 w-3 text-orange-600" />
                              Yes
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem 
                              value="no" 
                              id={`${key}-no`}
                              className="border-green-400 text-green-600"
                              data-testid={`radio-${index}-no`}
                            />
                            <Label 
                              htmlFor={`${key}-no`} 
                              className="text-sm cursor-pointer flex items-center gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                              No
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={onCancel}
            data-testid="button-cancel-triage"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleComplete}
            disabled={!allAnswered}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="button-confirm-triage"
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            {allAnswered 
              ? `Continue (${requiredCount} need permits, ${notRequiredCount} skip to CP)`
              : `Answer all questions (${localities.length - requiredCount - notRequiredCount} remaining)`
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LocalityRequirementTriageDialog;
