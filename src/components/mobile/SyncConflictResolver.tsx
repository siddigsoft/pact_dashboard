import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  Cloud, 
  Smartphone, 
  Check, 
  X, 
  GitMerge,
  Clock,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { hapticFeedback } from '@/lib/enhanced-haptics';

export interface ConflictData {
  id: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  localData: Record<string, any>;
  serverData: Record<string, any>;
  localTimestamp: number;
  serverTimestamp: number;
  conflictFields: string[];
}

export interface ConflictResolution {
  conflictId: string;
  resolution: 'local' | 'server' | 'merge';
  mergedData?: Record<string, any>;
}

interface SyncConflictResolverProps {
  conflicts: ConflictData[];
  onResolve: (resolutions: ConflictResolution[]) => Promise<void>;
  onDismiss?: () => void;
  isOpen: boolean;
}

interface FieldComparisonProps {
  field: string;
  localValue: any;
  serverValue: any;
  selectedSource: 'local' | 'server' | null;
  onSelect: (source: 'local' | 'server') => void;
}

function FieldComparison({ field, localValue, serverValue, selectedSource, onSelect }: FieldComparisonProps) {
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'Empty';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  };

  const localFormatted = formatValue(localValue);
  const serverFormatted = formatValue(serverValue);

  return (
    <div className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium capitalize">
          {field.replace(/_/g, ' ')}
        </span>
        <Badge variant="outline" className="text-xs">
          Conflict
        </Badge>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            hapticFeedback.selection();
            onSelect('local');
          }}
          className={`p-3 rounded-md border text-left transition-colors ${
            selectedSource === 'local'
              ? 'border-foreground bg-accent'
              : 'border-border hover:border-muted-foreground'
          }`}
          data-testid={`button-select-local-${field}`}
          aria-label={`Select local value for ${field}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Smartphone className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Your Device</span>
          </div>
          <p className="text-sm break-words line-clamp-3">{localFormatted}</p>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticFeedback.selection();
            onSelect('server');
          }}
          className={`p-3 rounded-md border text-left transition-colors ${
            selectedSource === 'server'
              ? 'border-foreground bg-accent'
              : 'border-border hover:border-muted-foreground'
          }`}
          data-testid={`button-select-server-${field}`}
          aria-label={`Select server value for ${field}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Cloud className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Server</span>
          </div>
          <p className="text-sm break-words line-clamp-3">{serverFormatted}</p>
        </button>
      </div>
    </div>
  );
}

interface ConflictCardProps {
  conflict: ConflictData;
  onResolve: (resolution: ConflictResolution) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function ConflictCard({ conflict, onResolve, isExpanded, onToggleExpand }: ConflictCardProps) {
  const [fieldSelections, setFieldSelections] = useState<Record<string, 'local' | 'server'>>({});
  const [resolving, setResolving] = useState(false);

  const handleFieldSelect = (field: string, source: 'local' | 'server') => {
    setFieldSelections((prev) => ({ ...prev, [field]: source }));
  };

  const handleQuickResolve = async (resolution: 'local' | 'server') => {
    setResolving(true);
    hapticFeedback.action.confirm();
    await onResolve({
      conflictId: conflict.id,
      resolution,
    });
    setResolving(false);
  };

  const handleMergeResolve = async () => {
    setResolving(true);
    hapticFeedback.action.confirm();

    const mergedData = { ...conflict.serverData };
    for (const field of conflict.conflictFields) {
      if (fieldSelections[field] === 'local') {
        mergedData[field] = conflict.localData[field];
      }
    }

    await onResolve({
      conflictId: conflict.id,
      resolution: 'merge',
      mergedData,
    });
    setResolving(false);
  };

  const allFieldsSelected = conflict.conflictFields.every((f) => fieldSelections[f]);

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {conflict.entityName || `${conflict.entityType} #${conflict.entityId.slice(0, 8)}`}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {conflict.conflictFields.length} field{conflict.conflictFields.length !== 1 ? 's' : ''} in conflict
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleExpand}
            data-testid={`button-expand-conflict-${conflict.id}`}
            aria-label={isExpanded ? 'Collapse conflict details' : 'Expand conflict details'}
          >
            {isExpanded ? 'Less' : 'More'}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <Smartphone className="h-3 w-3" />
            <Clock className="h-3 w-3" />
            <span>{format(conflict.localTimestamp, 'MMM d, HH:mm')}</span>
          </div>
          <ArrowRight className="h-3 w-3" />
          <div className="flex items-center gap-1">
            <Cloud className="h-3 w-3" />
            <Clock className="h-3 w-3" />
            <span>{format(conflict.serverTimestamp, 'MMM d, HH:mm')}</span>
          </div>
        </div>

        {!isExpanded && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => handleQuickResolve('local')}
              disabled={resolving}
              data-testid={`button-keep-local-${conflict.id}`}
              aria-label="Keep local version"
            >
              <Smartphone className="h-4 w-4 mr-1" />
              Keep Mine
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => handleQuickResolve('server')}
              disabled={resolving}
              data-testid={`button-keep-server-${conflict.id}`}
              aria-label="Keep server version"
            >
              <Cloud className="h-4 w-4 mr-1" />
              Keep Server
            </Button>
          </div>
        )}

        {isExpanded && (
          <>
            <Separator className="my-3" />
            <div className="space-y-2">
              {conflict.conflictFields.map((field) => (
                <FieldComparison
                  key={field}
                  field={field}
                  localValue={conflict.localData[field]}
                  serverValue={conflict.serverData[field]}
                  selectedSource={fieldSelections[field] || null}
                  onSelect={(source) => handleFieldSelect(field, source)}
                />
              ))}
            </div>
            <Separator className="my-3" />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleQuickResolve('local')}
                disabled={resolving}
                data-testid={`button-use-all-local-${conflict.id}`}
                aria-label="Use all local values"
              >
                <Smartphone className="h-4 w-4 mr-1" />
                All Mine
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleMergeResolve}
                disabled={resolving || !allFieldsSelected}
                data-testid={`button-merge-${conflict.id}`}
                aria-label="Merge selected values"
              >
                <GitMerge className="h-4 w-4 mr-1" />
                Merge
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => handleQuickResolve('server')}
                disabled={resolving}
                data-testid={`button-use-all-server-${conflict.id}`}
                aria-label="Use all server values"
              >
                <Cloud className="h-4 w-4 mr-1" />
                All Server
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function SyncConflictResolver({
  conflicts,
  onResolve,
  onDismiss,
  isOpen,
}: SyncConflictResolverProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolutions, setResolutions] = useState<ConflictResolution[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSingleResolve = useCallback((resolution: ConflictResolution) => {
    setResolutions((prev) => {
      const filtered = prev.filter((r) => r.conflictId !== resolution.conflictId);
      return [...filtered, resolution];
    });
  }, []);

  const handleResolveAll = async (type: 'local' | 'server') => {
    hapticFeedback.action.confirm();
    const allResolutions: ConflictResolution[] = conflicts.map((c) => ({
      conflictId: c.id,
      resolution: type,
    }));
    setIsSubmitting(true);
    try {
      await onResolve(allResolutions);
      hapticFeedback.sync.complete();
    } catch (error) {
      hapticFeedback.sync.error();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitResolutions = async () => {
    if (resolutions.length !== conflicts.length) {
      hapticFeedback.form.error();
      return;
    }

    setIsSubmitting(true);
    try {
      await onResolve(resolutions);
      hapticFeedback.sync.complete();
    } catch (error) {
      hapticFeedback.sync.error();
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolvedCount = resolutions.length;
  const totalCount = conflicts.length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onDismiss?.()}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col p-0" data-testid="dialog-sync-conflicts">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2" data-testid="dialog-title-conflicts">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Sync Conflicts
          </DialogTitle>
          <DialogDescription data-testid="dialog-desc-conflicts">
            {totalCount} item{totalCount !== 1 ? 's have' : ' has'} conflicting changes.
            Choose which version to keep.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4">
          {conflicts.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              onResolve={handleSingleResolve}
              isExpanded={expandedId === conflict.id}
              onToggleExpand={() => 
                setExpandedId(expandedId === conflict.id ? null : conflict.id)
              }
            />
          ))}
        </ScrollArea>

        <DialogFooter className="p-4 pt-2 flex-col sm:flex-col gap-2 border-t">
          <div className="flex items-center justify-between w-full text-sm text-muted-foreground">
            <span>
              {resolvedCount} of {totalCount} resolved
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResolveAll('local')}
                disabled={isSubmitting}
                data-testid="button-keep-all-local"
                aria-label="Keep all local versions"
              >
                <Smartphone className="h-4 w-4 mr-1" />
                All Mine
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResolveAll('server')}
                disabled={isSubmitting}
                data-testid="button-keep-all-server"
                aria-label="Keep all server versions"
              >
                <Cloud className="h-4 w-4 mr-1" />
                All Server
              </Button>
            </div>
          </div>

          <div className="flex gap-2 w-full">
            <Button
              variant="ghost"
              onClick={onDismiss}
              disabled={isSubmitting}
              className="flex-1"
              data-testid="button-cancel-conflict-resolution"
              aria-label="Cancel conflict resolution"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button
              onClick={handleSubmitResolutions}
              disabled={isSubmitting || resolvedCount !== totalCount}
              className="flex-1"
              data-testid="button-apply-resolutions"
              aria-label="Apply conflict resolutions"
            >
              <Check className="h-4 w-4 mr-1" />
              Apply ({resolvedCount}/{totalCount})
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
