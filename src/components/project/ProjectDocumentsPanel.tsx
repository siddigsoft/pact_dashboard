import { useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Paperclip, Upload, Trash2, Download, FileText, Image as ImageIcon, File, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useProjectDocuments, ProjectDocument } from '@/hooks/useProjectDocuments';

interface ProjectDocumentsPanelProps {
  projectId: string;
  currentUserId: string;
  isAdmin: boolean;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string | null) {
  if (!mimeType) return <File className="h-4 w-4 text-muted-foreground" />;
  if (mimeType.startsWith('image/')) return <ImageIcon className="h-4 w-4 text-blue-500" />;
  if (mimeType === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

const ProjectDocumentsPanel: React.FC<ProjectDocumentsPanelProps> = ({
  projectId,
  currentUserId,
  isAdmin,
}) => {
  const { documents, loading, uploading, uploadDocument, deleteDocument } = useProjectDocuments(projectId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (!label) setLabel(file.name.replace(/\.[^.]+$/, ''));
    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    const ok = await uploadDocument(pendingFile, label, currentUserId);
    if (ok) {
      setPendingFile(null);
      setLabel('');
    }
  };

  const handleCancel = () => {
    setPendingFile(null);
    setLabel('');
  };

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div className="border rounded-lg p-3 bg-muted/30 space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Upload className="h-3.5 w-3.5" /> Attach Document
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-file-upload"
        />
        {!pendingFile ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            data-testid="button-choose-file"
          >
            <Paperclip className="h-4 w-4 mr-1.5" />
            Choose File
          </Button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground truncate">
              {fileIcon(pendingFile.type)} <span className="ml-1">{pendingFile.name}</span>{' '}
              <span className="text-xs">({formatBytes(pendingFile.size)})</span>
            </p>
            <div className="space-y-1">
              <Label htmlFor="doc-label" className="text-xs">Label / Description</Label>
              <Input
                id="doc-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Signed SOW — Phase 1"
                className="h-8 text-sm"
                data-testid="input-document-label"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={uploading || !label.trim()}
                data-testid="button-upload-document"
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                Upload
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel} disabled={uploading} data-testid="button-cancel-upload">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Document list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg">
          <Paperclip className="h-7 w-7 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No documents attached yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc: ProjectDocument) => {
            const canDelete = isAdmin || doc.uploader_id === currentUserId;
            const uploadedAt = (() => {
              try { return format(parseISO(doc.created_at), 'PP'); } catch { return ''; }
            })();
            return (
              <div
                key={doc.id}
                className="flex items-start gap-3 p-2.5 rounded-md border bg-background hover:bg-muted/40 transition-colors group"
                data-testid={`document-row-${doc.id}`}
              >
                <div className="flex-shrink-0 mt-0.5">{fileIcon(doc.mime_type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.label}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {doc.file_name}
                    {doc.file_size ? ` · ${formatBytes(doc.file_size)}` : ''}
                    {' · '}{doc.uploader_name}
                    {uploadedAt ? ` · ${uploadedAt}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <a
                    href={doc.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={doc.file_name}
                    data-testid={`link-download-${doc.id}`}
                  >
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Download">
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                  {canDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          data-testid={`button-delete-document-${doc.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete document?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{doc.label}" will be permanently removed. This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteDocument(doc)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectDocumentsPanel;
