import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StoredFileImage } from '@/components/shared/StoredFileImage';
import {
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_COLORS,
  DOCUMENT_CATEGORY_ICONS,
  documentSourceRoute,
  groupSiteImages,
  isAdminOnlyDocument,
  type DocumentCategory,
  type DocumentMetadata,
} from '@/lib/workspaceDocuments';
import { fmtSize } from '@/lib/workspaceHubLogic';
import { formatDistanceToNow } from 'date-fns';
import { Clock, ExternalLink, FileText, Home, Image as ImageIcon, Lock, User } from 'lucide-react';
import { Link } from 'react-router-dom';

function fmtWhen(value?: string) {
  if (!value) return '';
  try {
    return formatDistanceToNow(new Date(value), { addSuffix: true });
  } catch {
    return value;
  }
}

export type LibraryBrowseFile = DocumentMetadata & {
  id: string;
  name: string;
  mime_type?: string | null;
  file_size?: number;
  updated_at?: string;
  created_at?: string;
  public_url?: string | null;
  _uploaderName?: string | null;
};

function previewSrc(file: LibraryBrowseFile): string | null {
  return file.public_url || file.source_url || null;
}

function RegistryRow({
  file, indexNo, onOpen,
}: {
  file: LibraryBrowseFile;
  indexNo: number;
  onOpen: (file: LibraryBrowseFile) => void;
}) {
  const category = (file.document_category ?? 'other') as DocumentCategory;
  const Icon = DOCUMENT_CATEGORY_ICONS[category] ?? FileText;
  const colorClass = DOCUMENT_CATEGORY_COLORS[category] ?? DOCUMENT_CATEGORY_COLORS.other;
  const [bg, ...textParts] = colorClass.split(' ');
  const text = textParts.join(' ');
  const source = documentSourceRoute(file);
  const when = file.updated_at ?? file.created_at;

  return (
    <div
      className="flex items-center justify-between gap-3 p-3 rounded-md border border-border hover:bg-muted/30 cursor-pointer"
      onClick={() => onOpen(file)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(file); } }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-mono font-medium text-muted-foreground">{indexNo}</span>
        </div>
        <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${bg}`}>
          <Icon className={`h-5 w-5 ${text}`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{file.name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-0.5">
            <Badge variant="outline" className="text-xs py-0 h-5">{DOCUMENT_CATEGORIES[category]}</Badge>
            {isAdminOnlyDocument(file) && (
              <Badge variant="secondary" className="text-xs py-0 h-5 gap-1"><Lock className="h-3 w-3" />Admin only</Badge>
            )}
            {file.project_label && <span className="truncate max-w-[140px]">{file.project_label}</span>}
            {file.site_label && (
              <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                <Home className="h-3 w-3" />{file.site_label}
              </span>
            )}
            {file.reporting_period && <span className="tabular-nums">{file.reporting_period}</span>}
            {file._uploaderName && (
              <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{file._uploaderName}</span>
            )}
            {when && (
              <span className="inline-flex items-center gap-1" title={when}>
                <Clock className="h-3 w-3" />{fmtWhen(when)}
              </span>
            )}
            {typeof file.file_size === 'number' && file.file_size > 0 && (
              <span className="tabular-nums">{fmtSize(file.file_size)}</span>
            )}
          </div>
          {source && (
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
              <Link to={source} className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                <ExternalLink className="h-3 w-3" />Open in Documents
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DocumentLibraryBrowse({
  files, category, onOpen,
}: {
  files: LibraryBrowseFile[];
  category: DocumentCategory | 'all';
  onOpen: (file: LibraryBrowseFile) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
        <p className="font-medium">No documents found</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-md">
          Try clearing filters, or open Folders for manually uploaded workspace files.
        </p>
      </div>
    );
  }

  if (category === 'site_image') {
    const groups = groupSiteImages(files);
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <p className="text-xs text-muted-foreground">
          {groups.length} site{groups.length === 1 ? '' : 's'} · {files.length} photo{files.length === 1 ? '' : 's'}
        </p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const thumbs = group.files.slice(0, 4);
            return (
              <Card key={`${group.projectLabel ?? ''}__${group.siteName}`} className="overflow-hidden">
                <CardHeader className="py-3 px-4 space-y-1">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-cyan-600" />
                    <span className="truncate">{group.siteName}</span>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground truncate">
                    {[group.projectLabel, `${group.files.length} photo${group.files.length === 1 ? '' : 's'}`, group.lastUpdated ? fmtWhen(group.lastUpdated) : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0 space-y-3">
                  <div className="grid grid-cols-4 gap-1.5">
                    {thumbs.map((file) => {
                      const src = previewSrc(file);
                      return (
                        <button
                          key={file.id}
                          type="button"
                          className="aspect-square rounded-md overflow-hidden bg-muted border border-border"
                          onClick={() => onOpen(file)}
                          title={file.name}
                        >
                          {src ? (
                            <StoredFileImage src={src} alt={file.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => onOpen(group.files[0])}>
                    Browse photos
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-2">
      {files.map((file, i) => (
        <RegistryRow key={file.id} file={file} indexNo={i + 1} onOpen={onOpen} />
      ))}
    </div>
  );
}
