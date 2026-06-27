import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink, FileText, X } from "lucide-react";

interface FilePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  filename?: string;
}

function isImage(url: string, filename?: string) {
  const target = (filename ?? url).toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(target);
}

function isPdf(url: string, filename?: string) {
  const target = (filename ?? url).toLowerCase();
  return /\.pdf(\?|$)/.test(target);
}

export function FilePreviewDialog({ open, onOpenChange, url, filename }: FilePreviewDialogProps) {
  const name = filename ?? url.split('/').pop()?.split('?')[0] ?? 'file';
  const image = isImage(url, filename);
  const pdf   = isPdf(url, filename);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden" data-testid="dialog-file-preview">
        <DialogHeader className="px-4 py-3 border-b flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-sm font-medium truncate max-w-[70%]">{name}</DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            <a href={url} download={name} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" data-testid="button-preview-download">
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </a>
            <a href={url} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs text-muted-foreground" data-testid="button-preview-open-tab">
                <ExternalLink className="h-3.5 w-3.5" />
                Open tab
              </Button>
            </a>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onOpenChange(false)} data-testid="button-preview-close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="bg-muted/30 flex items-center justify-center" style={{ minHeight: '60vh', maxHeight: '80vh' }}>
          {image && (
            <img
              src={url}
              alt={name}
              className="max-w-full max-h-full object-contain"
              style={{ maxHeight: '78vh' }}
              data-testid="preview-image"
            />
          )}
          {pdf && (
            <iframe
              src={url}
              title={name}
              className="w-full border-0"
              style={{ height: '78vh' }}
              data-testid="preview-pdf"
            />
          )}
          {!image && !pdf && (
            <div className="flex flex-col items-center gap-4 py-16 text-muted-foreground">
              <FileText className="h-12 w-12 opacity-40" />
              <p className="text-sm">{name}</p>
              <p className="text-xs opacity-70">Preview not available for this file type.</p>
              <a href={url} download={name} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-2" data-testid="button-preview-download-fallback">
                  <Download className="h-4 w-4" />
                  Download file
                </Button>
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
