import { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Props {
  onFileParsed: (rows: Record<string, unknown>[], filename: string) => void;
  disabled?: boolean;
}

export function WFPUploadZone({ onFileParsed, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const parse = async (file: File) => {
    setError(null);
    setLoading(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) throw new Error('No sheets found in workbook.');
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      if (rows.length === 0) throw new Error('Sheet is empty or has no data rows.');
      onFileParsed(rows, file.name);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to parse file.');
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) parse(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parse(file);
    e.target.value = '';
  };

  return (
    <div
      className={cn(
        'relative border-2 border-dashed rounded-xl p-8 text-center transition-colors',
        dragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-muted-foreground/30 bg-muted/20',
        disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-950/20',
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      data-testid="wfp-upload-zone"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleChange}
        data-testid="input-wfp-file"
      />

      {loading ? (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">Parsing WFP data…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/40">
            <FileSpreadsheet className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-semibold text-sm">Drop WFP cleaned Excel here</p>
            <p className="text-xs text-muted-foreground mt-1">
              .xlsx / .xls / .csv · Any column header variant is recognised automatically
            </p>
          </div>
          <Button size="sm" variant="outline" type="button" className="pointer-events-none" data-testid="button-wfp-browse">
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Browse file
          </Button>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-0 bottom-0 mx-4 mb-3 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2 text-xs text-destructive"
          onClick={e => { e.stopPropagation(); setError(null); }}>
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <X className="h-3 w-3 cursor-pointer shrink-0" />
        </div>
      )}
    </div>
  );
}
