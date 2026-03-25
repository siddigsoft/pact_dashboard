import React, { useState, useMemo } from 'react';
import { FileText, GitBranch, GitMerge, Plus, AlertCircle, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import type { MMPFile, MMPClassification } from '@/types';

interface MMPClassificationSelectorProps {
  existingMmps: MMPFile[];
  selectedMonth?: string;
  selectedYear?: number;
  onSelect: (classification: MMPClassification, parentMmpId?: string, notes?: string) => void;
  className?: string;
}

interface ClassificationOption {
  value: MMPClassification;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  requiresParent: boolean;
}

const classificationOptions: ClassificationOption[] = [
  {
    value: 'original',
    label: 'Original MMP',
    description: 'First/primary MMP for this period. Use this for new monthly plans.',
    icon: <FileText className="h-5 w-5" />,
    color: 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
    requiresParent: false,
  },
  {
    value: 'revised',
    label: 'Revised MMP',
    description: 'Updated version of an existing MMP. Will supersede the selected parent MMP.',
    icon: <GitBranch className="h-5 w-5" />,
    color: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
    requiresParent: true,
  },
  {
    value: 'additional',
    label: 'Additional MMP',
    description: 'Extra MMP for the same period. Use for expanded coverage or new sites.',
    icon: <GitMerge className="h-5 w-5" />,
    color: 'border-green-500 bg-green-50 dark:bg-green-950/30',
    requiresParent: false,
  },
  {
    value: 'supplementary',
    label: 'Supplementary MMP',
    description: 'Top-up for specific activities. Use for emergency response or ad-hoc visits.',
    icon: <Plus className="h-5 w-5" />,
    color: 'border-purple-500 bg-purple-50 dark:bg-purple-950/30',
    requiresParent: false,
  },
];

export const MMPClassificationSelector: React.FC<MMPClassificationSelectorProps> = ({
  existingMmps,
  selectedMonth,
  selectedYear,
  onSelect,
  className,
}) => {
  const [selectedClassification, setSelectedClassification] = useState<MMPClassification>('original');
  const [selectedParentId, setSelectedParentId] = useState<string>('');
  const [revisionNotes, setRevisionNotes] = useState<string>('');

  const periodMmps = useMemo(() => {
    if (!selectedMonth || !selectedYear) return existingMmps;
    
    return existingMmps.filter(mmp => {
      if (mmp.month && mmp.year) {
        return mmp.month === selectedMonth && mmp.year === selectedYear;
      }
      return false;
    });
  }, [existingMmps, selectedMonth, selectedYear]);

  const activeMmps = useMemo(() => {
    return periodMmps.filter(mmp => 
      !mmp.versionStatus || mmp.versionStatus === 'active'
    );
  }, [periodMmps]);

  const originalMmps = useMemo(() => {
    return activeMmps.filter(mmp => 
      !mmp.classification || mmp.classification === 'original'
    );
  }, [activeMmps]);

  const selectedOption = classificationOptions.find(
    opt => opt.value === selectedClassification
  );

  const hasExistingOriginal = originalMmps.length > 0;

  const handleConfirm = () => {
    onSelect(
      selectedClassification,
      selectedParentId || undefined,
      revisionNotes || undefined
    );
  };

  const isValid = () => {
    if (selectedClassification === 'revised' && !selectedParentId) {
      return false;
    }
    return true;
  };

  return (
    <Card className={className} data-testid="mmp-classification-selector">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          MMP Classification
        </CardTitle>
        <CardDescription>
          Select the type of MMP you are uploading
          {selectedMonth && selectedYear && (
            <span className="ml-1">
              for <strong>{selectedMonth}/{selectedYear}</strong>
            </span>
          )}
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {hasExistingOriginal && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Existing MMPs Found</AlertTitle>
            <AlertDescription>
              There {activeMmps.length === 1 ? 'is' : 'are'} {activeMmps.length} active 
              MMP{activeMmps.length !== 1 ? 's' : ''} for this period. 
              Consider uploading a revision or additional MMP instead of a new original.
            </AlertDescription>
          </Alert>
        )}

        <RadioGroup
          value={selectedClassification}
          onValueChange={(value) => {
            setSelectedClassification(value as MMPClassification);
            if (value !== 'revised') {
              setSelectedParentId('');
            }
          }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {classificationOptions.map((option) => (
            <div key={option.value}>
              <RadioGroupItem
                value={option.value}
                id={option.value}
                className="peer sr-only"
              />
              <Label
                htmlFor={option.value}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-lg border-2 p-4 cursor-pointer transition-all",
                  "hover:bg-muted/50",
                  "peer-data-[state=checked]:border-primary",
                  selectedClassification === option.value && option.color
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  <div className={cn(
                    "p-2 rounded-md",
                    selectedClassification === option.value 
                      ? "bg-primary/10 text-primary" 
                      : "bg-muted text-muted-foreground"
                  )}>
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{option.label}</div>
                  </div>
                  {selectedClassification === option.value && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {option.description}
                </p>
              </Label>
            </div>
          ))}
        </RadioGroup>

        {selectedClassification === 'revised' && (
          <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
            <div className="space-y-2">
              <Label htmlFor="parent-mmp">
                Select MMP to Revise <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedParentId}
                onValueChange={setSelectedParentId}
              >
                <SelectTrigger id="parent-mmp" data-testid="select-parent-mmp">
                  <SelectValue placeholder="Choose the MMP to revise" />
                </SelectTrigger>
                <SelectContent>
                  {activeMmps.map((mmp) => (
                    <SelectItem key={mmp.id} value={mmp.id}>
                      <div className="flex items-center gap-2">
                        <span>{mmp.name}</span>
                        {mmp.version && (
                          <Badge variant="secondary" className="text-xs">
                            v{mmp.version.major}.{mmp.version.minor}
                          </Badge>
                        )}
                        {mmp.classification && (
                          <Badge variant="outline" className="text-xs">
                            {mmp.classification}
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedParentId && (
                <p className="text-sm text-amber-600">
                  Please select the MMP you want to revise
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="revision-notes">Revision Notes (Optional)</Label>
              <Textarea
                id="revision-notes"
                placeholder="Describe what changed in this revision..."
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                className="min-h-[80px]"
                data-testid="revision-notes"
              />
            </div>

            {selectedParentId && (
              <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700 dark:text-amber-400">
                  The selected MMP will be marked as "Superseded" when this revision is approved.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {selectedClassification === 'additional' && hasExistingOriginal && (
          <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200">
            <GitMerge className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-400">
              This MMP will be linked to existing MMPs for this period and tracked separately.
            </AlertDescription>
          </Alert>
        )}

        {selectedClassification === 'original' && hasExistingOriginal && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              An original MMP already exists for this period. Creating another original 
              may cause confusion. Consider using "Additional" or "Revised" instead.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-sm text-muted-foreground">
            Selected: <strong>{selectedOption?.label}</strong>
          </div>
          <Button 
            onClick={handleConfirm}
            disabled={!isValid()}
            data-testid="confirm-classification"
          >
            Continue with Upload
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default MMPClassificationSelector;
