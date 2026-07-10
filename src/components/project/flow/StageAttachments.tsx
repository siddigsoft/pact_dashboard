import { useRef } from 'react';
import { Paperclip, Upload, Trash2, Download, FileText, Image, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useStageAttachments } from '@/hooks/useStageData';
import { format } from 'date-fns';

interface Props {
  projectId: string;
  stageId: string;
  currentUserId?: string;
  canEdit: boolean;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: string | null }) {
  if (!type) return <FileText className="h-4 w-4 text-slate-400" />;
  if (type.startsWith('image/')) return <Image className="h-4 w-4 text-blue-500" />;
  if (type.includes('sheet') || type.includes('excel') || type.includes('csv'))
    return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
  if (type.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
  if (type.includes('word') || type.includes('doc')) return <FileText className="h-4 w-4 text-blue-600" />;
  return <FileText className="h-4 w-4 text-slate-400" />;
}

export function StageAttachments({ projectId, stageId, currentUserId, canEdit }: Props) {
  const { toast } = useToast();
  const { attachments, uploadFile, deleteAttachment, isUploading } =
    useStageAttachments(projectId, stageId);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const oversized = files.filter(f => f.size > 20 * 1024 * 1024);
    if (oversized.length > 0) {
      toast({
        title: 'File too large',
        description: `${oversized.map(f => f.name).join(', ')} exceed the 20 MB limit`,
        variant: 'destructive',
      });
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    let successCount = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        await uploadFile(file, currentUserId);
        successCount++;
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    if (successCount > 0) {
      toast({ title: successCount === 1 ? 'File uploaded' : `${successCount} files uploaded` });
    }
    if (errors.length > 0) {
      toast({ title: 'Some uploads failed', description: errors.join('\n'), variant: 'destructive' });
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAttachment(id);
      toast({ title: 'Attachment removed' });
    } catch {
      toast({ title: 'Failed to remove attachment', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Paperclip className="h-3.5 w-3.5" />
          Attachments
          {attachments.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {attachments.length}
            </Badge>
          )}
        </div>
        {canEdit && (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
              accept="*/*"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              data-testid={`btn-upload-attachment-${stageId}`}
            >
              {isUploading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Upload className="h-3 w-3 mr-1" />
              )}
              {isUploading ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No attachments yet. Click Upload to add one or more files.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map(att => (
            <div
              key={att.id}
              className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 group"
            >
              <FileIcon type={att.fileType} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{att.fileName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {formatBytes(att.fileSize)}
                  {att.uploadedByName && ` · ${att.uploadedByName}`}
                  {` · ${format(new Date(att.createdAt), 'dd MMM yyyy')}`}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <a href={att.fileUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Download className="h-3 w-3" />
                  </Button>
                </a>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                    onClick={() => handleDelete(att.id)}
                    data-testid={`btn-delete-attachment-${att.id}`}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
