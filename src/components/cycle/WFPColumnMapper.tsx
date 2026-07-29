/**
 * WFPColumnMapper
 * Shown when auto-detection fails to find required WFP columns.
 * Lets the user manually map file headers to system fields, then proceeds.
 */
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ArrowRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  allHeaders: string[];
  autoDetected: Record<string, string>; // systemField -> fileHeader (already found)
  onConfirm: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

const SYSTEM_FIELDS: { id: string; label: string; labelAr: string; required: boolean; desc: string }[] = [
  { id: 'site_name', label: 'Site Name', labelAr: 'اسم الموقع', required: true, desc: 'The name of the visited site / village' },
  { id: 'state', label: 'State / Governorate', labelAr: 'الولاية', required: false, desc: 'Improves matching accuracy' },
  { id: 'locality', label: 'Locality / District', labelAr: 'المحلية', required: false, desc: 'Improves matching accuracy' },
  { id: 'activity', label: 'Activity / Programme', labelAr: 'النشاط', required: false, desc: 'Activity or programme code' },
  { id: 'partner', label: 'Partner / Organisation', labelAr: 'الشريك', required: false, desc: 'Implementing partner name' },
  { id: 'enumerator', label: 'Enumerator Name', labelAr: 'اسم المعدد', required: false, desc: 'Data collector who did the visit' },
];

const NONE_VALUE = '__none__';

export function WFPColumnMapper({ allHeaders, autoDetected, onConfirm, onCancel }: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const f of SYSTEM_FIELDS) {
      m[f.id] = autoDetected[f.id] || NONE_VALUE;
    }
    return m;
  });

  const missingRequired = SYSTEM_FIELDS
    .filter(f => f.required && (!mapping[f.id] || mapping[f.id] === NONE_VALUE));

  const canProceed = missingRequired.length === 0;

  const handleConfirm = () => {
    const finalMapping: Record<string, string> = {};
    for (const [field, header] of Object.entries(mapping)) {
      if (header && header !== NONE_VALUE) finalMapping[field] = header;
    }
    onConfirm(finalMapping);
  };

  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-4" data-testid="wfp-column-mapper">
      {/* Header */}
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">Column Headers Not Recognised</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            The system could not automatically identify the required columns in this file.
            Map each system field to the correct column from your file below.
          </p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <span>This mapping will be used to re-read the file. Only <strong>Site Name</strong> is required — the others improve matching quality.</span>
      </div>

      {/* Mapping rows */}
      <div className="space-y-2">
        {SYSTEM_FIELDS.map(field => {
          const isAutoDetected = !!autoDetected[field.id];
          const currentVal = mapping[field.id] || NONE_VALUE;
          const isSet = currentVal !== NONE_VALUE;

          return (
            <div key={field.id} className={cn(
              'flex items-center gap-3 rounded-lg border bg-white dark:bg-background px-3 py-2.5',
              field.required && !isSet ? 'border-red-200 dark:border-red-800' : 'border-border',
            )}>
              {/* System field label */}
              <div className="w-40 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{field.label}</span>
                  {field.required && <Badge className="text-[10px] bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300 px-1 py-0">Required</Badge>}
                </div>
                <span dir="rtl" className="text-[10px] text-muted-foreground block">{field.labelAr}</span>
              </div>

              {/* Arrow */}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

              {/* File header selector */}
              <div className="flex-1 min-w-0">
                {isAutoDetected ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      Auto-detected: <code className="bg-muted px-1 rounded">{autoDetected[field.id]}</code>
                    </span>
                  </div>
                ) : (
                  <Select
                    value={currentVal}
                    onValueChange={val => setMapping(prev => ({ ...prev, [field.id]: val }))}
                  >
                    <SelectTrigger className="h-8 text-xs" data-testid={`select-col-map-${field.id}`}>
                      <SelectValue placeholder="Select column from file…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>— Not mapped —</SelectItem>
                      {allHeaders.map(h => (
                        <SelectItem key={h} value={h}>{h}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Description */}
              <span className="text-[10px] text-muted-foreground w-32 shrink-0 hidden sm:block">{field.desc}</span>
            </div>
          );
        })}
      </div>

      {/* Missing required warning */}
      {!canProceed && (
        <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          Please map the <strong>Site Name</strong> column before continuing.
        </p>
      )}

      {/* File headers reference */}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Show all {allHeaders.length} columns found in the file
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {allHeaders.map(h => (
            <code key={h} className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{h}</code>
          ))}
        </div>
      </details>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" size="sm" onClick={onCancel} data-testid="button-col-mapper-cancel">
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!canProceed}
          onClick={handleConfirm}
          data-testid="button-col-mapper-apply"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
          Apply Mapping & Match
        </Button>
      </div>
    </div>
  );
}
