import { useState, useRef, useCallback, useMemo, useEffect, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isValid, formatDistanceToNow, isBefore } from 'date-fns';
import {
  Folder, FolderOpen, FolderPlus, Folders, FileText, Upload, Search, MoreVertical, MoreHorizontal,
  Download, Trash2, Share2, Eye, MessageSquare, Clock, Shield, Lock, LockOpen,
  Users, ChevronRight, ChevronDown, X, Plus, Edit2, AlertTriangle,
  CheckCircle2, Star, StarOff, Grid, List, Filter, Tag, Link,
  Globe, Building2, User, UserCheck, UserX, Calendar, ArrowUpDown,
  File, FileImage, FileVideo, FileArchive, FileSpreadsheet,
  Activity, History, RefreshCw, Loader2, Send, Check, RotateCcw, Home,
  EyeOff, Key, Copy, ExternalLink, Info, ShieldCheck, QrCode, Printer, Palette, ImageDown, ChevronUp, Ban,
  SquareCheck, Square, ArrowLeft,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import PactLogo from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuPortal,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { r2Upload, r2SignedUrl, r2Delete, isZipFile, r2ExtractZip, MAX_ZIP_BYTES } from '@/lib/r2Storage';
import { insertNotificationsToDb } from '@/services/notification-insert';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { NavBadgeCountsProvider } from '@/context/NavBadgeCountsContext';
import Navbar from '@/components/Navbar';
import { WorkspaceAccessGate } from '@/components/workspace/WorkspaceAccessGate';
import { WorkspaceAccessManager } from '@/components/workspace/WorkspaceAccessManager';

// ─── Types ────────────────────────────────────────────────────────────────────

type SecurityLevel = 'public' | 'internal' | 'confidential' | 'restricted' | 'top_secret';
type AccessLevel = 'owner' | 'editor' | 'commenter' | 'viewer' | 'no_access';
type GranteeType = 'user' | 'role' | 'department' | 'hub' | 'all_staff';

interface WFolder {
  id: string; name: string; description: string | null;
  parent_folder_id: string | null; security_level: SecurityLevel;
  created_by: string | null; color: string; icon: string;
  is_system_folder: boolean; archived: boolean; created_at: string;
  password_hash: string | null;
  _childCount?: number; _fileCount?: number;
}
interface PasswordTarget {
  id: string; name: string; password_hash: string | null; isFolder: boolean;
}
interface WFile {
  id: string; folder_id: string | null; name: string; description: string | null;
  storage_path: string; public_url: string | null; file_size: number;
  storage_provider: 'supabase' | 'r2';
  mime_type: string | null; extension: string | null;
  security_level: SecurityLevel; version: number; version_label: string | null;
  tags: string[]; created_by: string | null; last_modified_by: string | null;
  is_pinned: boolean; expires_at: string | null;
  download_count: number; view_count: number; archived: boolean;
  created_at: string; updated_at: string;
  password_hash: string | null;
  short_code: string | null;
  allow_download: boolean;
  _uploaderName?: string;
}
interface WPermission {
  id: string; file_id: string | null; folder_id: string | null;
  grantee_type: GranteeType; grantee_id: string | null;
  access_level: AccessLevel; granted_by: string | null;
  expires_at: string | null; notes: string | null; created_at: string;
}
interface WComment {
  id: string; file_id: string; author_id: string | null; content: string;
  parent_id: string | null; resolved: boolean; created_at: string;
  _authorName?: string;
}
interface WActivity {
  id: string; file_id: string | null; folder_id: string | null;
  user_id: string | null; action: string; metadata: Record<string, any>;
  created_at: string; _userName?: string;
}
interface ProfileOption { id: string; full_name: string | null; role: string | null; }

// ─── Constants ───────────────────────────────────────────────────────────────

const CLEARANCE_ORDER: Record<SecurityLevel, number> = {
  public: 0, internal: 1, confidential: 2, restricted: 3, top_secret: 4,
};

const SEC_CFG: Record<SecurityLevel, {
  label: string; icon: React.ElementType; bg: string; text: string; border: string; desc: string;
}> = {
  public:       { label: 'Public',       icon: Globe,      bg: 'bg-emerald-100',  text: 'text-emerald-700', border: 'border-emerald-200', desc: 'All PACT staff can view' },
  internal:     { label: 'Internal',     icon: Users,      bg: 'bg-blue-100',     text: 'text-blue-700',    border: 'border-blue-200',    desc: 'Specific roles & departments' },
  confidential: { label: 'Confidential', icon: Shield,     bg: 'bg-amber-100',    text: 'text-amber-700',   border: 'border-amber-200',   desc: 'Explicit permission required' },
  restricted:   { label: 'Restricted',   icon: Lock,       bg: 'bg-orange-100',   text: 'text-orange-700',  border: 'border-orange-200',  desc: 'Senior management only' },
  top_secret:   { label: 'Top Secret',   icon: Key,        bg: 'bg-red-100',      text: 'text-red-700',     border: 'border-red-200',     desc: 'Super admin + explicit grant' },
};

const ACCESS_CFG: Record<AccessLevel, { label: string; icon: React.ElementType; desc: string; color: string }> = {
  owner:     { label: 'Owner',     icon: UserCheck, desc: 'Full control, can delete & reshare', color: 'text-purple-700' },
  editor:    { label: 'Editor',    icon: Edit2,     desc: 'Can upload versions & rename',       color: 'text-blue-700' },
  commenter: { label: 'Commenter', icon: MessageSquare, desc: 'Can view and add comments',      color: 'text-teal-700' },
  viewer:    { label: 'Viewer',    icon: Eye,       desc: 'View and download only',              color: 'text-emerald-700' },
  no_access: { label: 'No Access', icon: UserX,     desc: 'Blocked (revokes access)',            color: 'text-red-700' },
};

const ICON_MAP: Record<string, React.ElementType> = {
  'image/': FileImage, 'video/': FileVideo, 'application/pdf': FileText,
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
  'application/zip': FileArchive, 'application/x-zip-compressed': FileArchive,
  'text/': FileText,
};

function getFileIcon(mime: string | null): React.ElementType {
  if (!mime) return File;
  for (const [k, v] of Object.entries(ICON_MAP)) if (mime.startsWith(k) || mime === k) return v;
  return File;
}
function fmtSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  try { const d = parseISO(s); return isValid(d) ? format(d, 'dd MMM yyyy') : '—'; } catch { return '—'; }
}
function fmtRelative(s: string | null | undefined) {
  if (!s) return '—';
  try { const d = parseISO(s); return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '—'; } catch { return '—'; }
}

async function hashPassword(pwd: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode('pact-ws-salt:' + pwd));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Security badge ───────────────────────────────────────────────────────────

function SecBadge({ level, size = 'sm' }: { level: SecurityLevel; size?: 'xs' | 'sm' }) {
  const cfg = SEC_CFG[level];
  const Icon = cfg.icon;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full font-semibold border',
      cfg.bg, cfg.text, cfg.border,
      size === 'xs' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
    )}>
      <Icon className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {cfg.label}
    </span>
  );
}

// ─── Share dialog ─────────────────────────────────────────────────────────────

function UserPickerCombobox({ profiles, value, onChange }: {
  profiles: ProfileOption[]; value: string; onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = profiles.find(p => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="w-full h-8 px-3 text-xs rounded-md border border-input bg-background flex items-center justify-between hover:bg-accent/50 transition"
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? (
              <>
                {selected.full_name ?? selected.id.slice(0, 8)}
                {selected.role && <span className="text-muted-foreground ml-1">({selected.role})</span>}
              </>
            ) : 'Select user…'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[280px]" align="start">
        <Command
          filter={(itemValue, search) => {
            // itemValue includes name + role (lowercased) so search matches both
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Search by name or role…" className="h-9 text-xs" />
          <CommandList className="max-h-[260px]">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">No users found.</CommandEmpty>
            <CommandGroup>
              {profiles.map(p => {
                const label = `${p.full_name ?? p.id.slice(0, 8)} ${p.role ?? ''}`.trim();
                return (
                  <CommandItem
                    key={p.id}
                    value={label}
                    onSelect={() => { onChange(p.id); setOpen(false); }}
                    className="text-xs cursor-pointer"
                  >
                    <Check className={cn('h-3.5 w-3.5 mr-2', value === p.id ? 'opacity-100 text-[#1D3461]' : 'opacity-0')} />
                    <span className="flex-1 truncate">{p.full_name ?? p.id.slice(0, 8)}</span>
                    {p.role && <span className="text-muted-foreground ml-2 text-[10px]">{p.role}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ShareDialog({ file, folder, open, onClose, currentUserId }: {
  file?: WFile; folder?: WFolder; open: boolean; onClose: () => void; currentUserId: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [granteeType, setGranteeType] = useState<GranteeType>('user');
  const [granteeId, setGranteeId] = useState('');
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('viewer');
  const [expiresAt, setExpiresAt] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const targetId = file?.id ?? folder?.id;
  const isFile = !!file;
  const targetName = file?.name ?? folder?.name ?? '';

  const { data: permissions = [], refetch: refetchPerms } = useQuery<WPermission[]>({
    queryKey: ['workspace_permissions', isFile ? 'file' : 'folder', targetId],
    queryFn: async () => {
      if (!targetId) return [];
      const q = supabase.from('workspace_permissions').select('*').order('created_at', { ascending: false });
      const { data } = isFile ? await q.eq('file_id', targetId) : await q.eq('folder_id', targetId);
      return (data ?? []) as WPermission[];
    },
    enabled: open && !!targetId,
  });

  const { data: profiles = [] } = useQuery<ProfileOption[]>({
    queryKey: ['profiles_for_sharing'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').limit(200);
      return (data ?? []) as ProfileOption[];
    },
    enabled: open,
  });

  async function addPermission() {
    if (!targetId) return;
    setAdding(true);
    try {
      const payload: any = {
        grantee_type: granteeType, grantee_id: granteeId || null,
        access_level: accessLevel, granted_by: currentUserId,
        expires_at: expiresAt || null, notes: notes || null,
      };
      if (isFile) payload.file_id = targetId; else payload.folder_id = targetId;
      const { error } = await supabase.from('workspace_permissions').insert(payload);
      if (error) throw error;
      await refetchPerms();
      setGranteeId(''); setNotes(''); setExpiresAt('');
      toast({ title: 'Permission added', description: `${ACCESS_CFG[accessLevel].label} access granted` });
      if (granteeType === 'user' && granteeId) {
        // Fire bell + email + WhatsApp via dispatch-notification (fire-and-forget)
        supabase.functions.invoke('dispatch-notification', {
          body: {
            event_type:    'workspace_share',
            entity_type:   isFile ? 'workspace_file' : 'workspace_folder',
            entity_id:     targetId,
            recipient_ids: [granteeId],
            triggered_by:  currentUserId,
            priority:      'high',
            title_en:      `You have been given access to "${targetName}"`,
            title_ar:      `تم منحك الوصول إلى "${targetName}"`,
            message_en:    `You have been granted ${ACCESS_CFG[accessLevel].label} access to the ${isFile ? 'file' : 'folder'} "${targetName}" in the Workspace Hub.`,
            message_ar:    `تم منحك صلاحية ${ACCESS_CFG[accessLevel].label} على ${isFile ? 'الملف' : 'المجلد'} "${targetName}" في مركز مساحة العمل.`,
            action_url:    '/workspace',
            metadata: {
              file_name:    isFile ? targetName : '',
              folder_name:  !isFile ? targetName : '',
              access_level: ACCESS_CFG[accessLevel].label,
            },
          },
        }).catch(() => { /* non-blocking */ });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setAdding(false); }
  }

  async function revokePermission(id: string) {
    const { error } = await supabase.from('workspace_permissions').delete().eq('id', id);
    if (error) { toast({ title: 'Failed to revoke permission', description: error.message, variant: 'destructive' }); return; }
    refetchPerms();
  }

  const granteeLabel = (p: WPermission) => {
    if (p.grantee_type === 'all_staff') return 'All Staff';
    if (p.grantee_type === 'user' && p.grantee_id) {
      const prof = profiles.find(x => x.id === p.grantee_id);
      return prof?.full_name ?? p.grantee_id.slice(0, 8);
    }
    if (p.grantee_type === 'role') return `Role: ${p.grantee_id}`;
    if (p.grantee_type === 'department') return `Dept: ${p.grantee_id}`;
    if (p.grantee_type === 'hub') return `Hub: ${p.grantee_id}`;
    return p.grantee_id ?? '—';
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-[#1D3461]" />
            Share &amp; Permissions
          </DialogTitle>
          <p className="text-sm text-muted-foreground truncate">{targetName}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current security level */}
          {(file || folder) && (
            <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-xl border">
              <Shield className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-semibold">Security Level</p>
                <p className="text-[11px] text-muted-foreground">{SEC_CFG[file?.security_level ?? folder!.security_level].desc}</p>
              </div>
              <SecBadge level={file?.security_level ?? folder!.security_level} />
            </div>
          )}

          {/* Add new permission */}
          <div className="border rounded-xl p-3 space-y-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Grant Access</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Grant to</label>
                <Select value={granteeType} onValueChange={v => { setGranteeType(v as GranteeType); setGranteeId(''); }}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_staff" className="text-xs">All Staff</SelectItem>
                    <SelectItem value="user" className="text-xs">Specific User</SelectItem>
                    <SelectItem value="role" className="text-xs">By Role</SelectItem>
                    <SelectItem value="department" className="text-xs">Department</SelectItem>
                    <SelectItem value="hub" className="text-xs">Hub</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Access Level</label>
                <Select value={accessLevel} onValueChange={v => setAccessLevel(v as AccessLevel)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ACCESS_CFG) as [AccessLevel, any][]).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {granteeType !== 'all_staff' && (
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                  {granteeType === 'user' ? 'Select User' : granteeType === 'role' ? 'Role Name' : granteeType === 'department' ? 'Department Name' : 'Hub Name'}
                </label>
                {granteeType === 'user' ? (
                  <UserPickerCombobox
                    profiles={profiles}
                    value={granteeId}
                    onChange={setGranteeId}
                  />
                ) : (
                  <Input value={granteeId} onChange={e => setGranteeId(e.target.value)}
                    placeholder={granteeType === 'role' ? 'e.g. admin, supervisor' : 'Enter name'} className="h-8 text-xs" />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Expires (optional)</label>
                <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason…" className="h-8 text-xs" />
              </div>
            </div>

            <Button size="sm" className="w-full bg-[#1D3461] hover:bg-[#0F2041] h-8 text-xs" onClick={addPermission} disabled={adding || (granteeType !== 'all_staff' && !granteeId)}>
              {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              Grant Permission
            </Button>
          </div>

          {/* Existing permissions */}
          {permissions.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Current Access ({permissions.length})</p>
              {permissions.map(p => {
                const aCfg = ACCESS_CFG[p.access_level];
                const AIcon = aCfg.icon;
                const expired = p.expires_at ? isBefore(parseISO(p.expires_at), new Date()) : false;
                return (
                  <div key={p.id} className={cn('flex items-center gap-2 p-2.5 rounded-xl border', expired ? 'opacity-50 border-red-200' : 'border-border')}>
                    <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <AIcon className={cn('h-3.5 w-3.5', aCfg.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{granteeLabel(p)}</p>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[10px] font-medium', aCfg.color)}>{aCfg.label}</span>
                        {p.expires_at && <span className={cn('text-[10px]', expired ? 'text-red-600' : 'text-muted-foreground')}>Exp: {fmtDate(p.expires_at)}</span>}
                      </div>
                    </div>
                    <button onClick={() => revokePermission(p.id)} className="p-1 rounded text-muted-foreground hover:text-red-600 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Drag-drop folder reader (recursive, uses FileSystem API) ──────────────────

async function readDroppedItems(dataTransfer: DataTransfer): Promise<{file: File; relativePath: string}[]> {
  const result: {file: File; relativePath: string}[] = [];

  async function readEntry(entry: FileSystemEntry, pathPrefix: string): Promise<void> {
    if (entry.isFile) {
      const fe = entry as FileSystemFileEntry;
      const file = await new Promise<File>((res, rej) => fe.file(res, rej));
      result.push({ file, relativePath: pathPrefix + file.name });
    } else if (entry.isDirectory) {
      const de = entry as FileSystemDirectoryEntry;
      const reader = de.createReader();
      const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((res, rej) => reader.readEntries(res, rej));
      let batch: FileSystemEntry[];
      do {
        batch = await readBatch();
        for (const child of batch) await readEntry(child, pathPrefix + de.name + '/');
      } while (batch.length > 0);
    }
  }

  // Try FileSystem API first (supports folders + correct relative paths)
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const entry = (dataTransfer.items[i] as any).webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    for (const entry of entries) await readEntry(entry, '');
  }

  // Fallback: plain file list (no folder support)
  if (result.length === 0 && dataTransfer.files.length > 0) {
    for (const f of Array.from(dataTransfer.files)) {
      result.push({ file: f, relativePath: f.name });
    }
  }

  return result;
}

// ─── Upload dialog ─────────────────────────────────────────────────────────────

function UploadDialog({ folderId, folderName, open, onClose, currentUserId, onUploaded, initialEntries }: {
  folderId: string | null; folderName: string; open: boolean; onClose: () => void;
  currentUserId: string; onUploaded: () => void; initialEntries?: {file: File; relativePath: string}[];
}) {
  const { toast } = useToast();
  const fileRef   = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Array<{ file: File; relativePath: string }>>([]);
  const [secLevel, setSecLevel] = useState<SecurityLevel>('internal');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentUploadingName, setCurrentUploadingName] = useState('');
  const [extractZips, setExtractZips] = useState(true);
  const cancelledRef = useRef(false);

  const hasZipSelected = files.some(item => isZipFile(item.file));

  // Pre-populate with entries dropped onto the main area
  useEffect(() => {
    if (open && initialEntries && initialEntries.length > 0) {
      setFiles(initialEntries);
    }
    if (!open) { setFiles([]); setDescription(''); setTags(''); setProgress(0); setCurrentUploadingName(''); setExtractZips(true); }
  }, [open, initialEntries]);

  const addFiles = (raw: FileList | File[]) => {
    const entries = Array.from(raw).map(f => ({
      file: f,
      relativePath: (f as any).webkitRelativePath || f.name,
    }));
    setFiles(prev => [...prev, ...entries]);
  };

  async function handleUpload() {
    if (files.length === 0) return;
    cancelledRef.current = false;
    setUploading(true); setProgress(0);
    const pendingOrphanPaths: string[] = [];
    let completed = 0;

    // Race any promise against a per-file 45-second timeout
    function withTimeout<T>(p: Promise<T>, ms = 45000): Promise<T> {
      return Promise.race([
        p,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Request timed out after ${ms / 1000}s — check your connection`)), ms)
        ),
      ]);
    }

    try {
      // ── Folder-upload: reconstruct subfolder hierarchy in workspace_folders ──
      const isFolderUpload = files.some(item => item.relativePath.includes('/'));
      const folderIdMap: Record<string, string> = {};

      if (isFolderUpload) {
        const folderPaths = new Set<string>();
        for (const item of files) {
          const parts = item.relativePath.split('/');
          for (let depth = 1; depth < parts.length; depth++) {
            folderPaths.add(parts.slice(0, depth).join('/'));
          }
        }
        const sorted = Array.from(folderPaths).sort((a, b) => a.split('/').length - b.split('/').length);
        for (const folderPath of sorted) {
          const parts      = folderPath.split('/');
          const name       = parts[parts.length - 1];
          const parentPath = parts.slice(0, -1).join('/');
          const parentId   = parentPath ? (folderIdMap[parentPath] ?? null) : folderId;
          const { data: created, error: folderErr } = await withTimeout(
            (async () => {
              const res = await (supabase as any)
                .from('workspace_folders')
                .insert({ name, parent_folder_id: parentId, security_level: secLevel, created_by: currentUserId, is_system_folder: false, archived: false })
                .select('id').single();
              return res as { data: { id: string } | null; error: { message: string } | null };
            })()
          );
          if (folderErr) throw folderErr;
          if (!created?.id) throw new Error('Failed to create folder');
          folderIdMap[folderPath] = created.id;
        }
      }

      // ── Upload files in parallel (up to 4 concurrent) ──────────────────────
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);

      async function uploadOne(item: { file: File; relativePath: string }) {
        if (cancelledRef.current) throw new Error('Upload cancelled');
        const { file: f, relativePath } = item;
        setCurrentUploadingName(f.name);
        let targetFolderId: string | null = folderId;
        if (isFolderUpload) {
          const parts = relativePath.split('/');
          const parentPath = parts.slice(0, -1).join('/');
          targetFolderId = parentPath ? (folderIdMap[parentPath] ?? folderId) : folderId;
        }
        // New uploads go to Cloudflare R2; the edge function generates the key
        // under the caller's user-id prefix (see supabase/functions/r2-sign).
        const shouldExtract = extractZips && isZipFile(f);
        if (shouldExtract && f.size > MAX_ZIP_BYTES) {
          throw new Error(`"${f.name}" exceeds the 100MB ZIP extract limit. Upload without extract, or split the archive.`);
        }
        const { key: path } = await withTimeout(r2Upload(f), 600000);
        pendingOrphanPaths.push(path);
        const ext = f.name.split('.').pop()?.toLowerCase() ?? null;
        const insertPayload = {
          folder_id: targetFolderId, name: f.name, description: description || null,
          storage_path: path, public_url: null, storage_provider: 'r2',
          file_size: f.size, mime_type: f.type, extension: ext,
          security_level: secLevel, created_by: currentUserId, last_modified_by: currentUserId,
          tags: tagList,
          ...(shouldExtract ? { extract_status: 'pending' } : {}),
        };
        const { data: inserted, error: dbErr } = await withTimeout(
          (async () => {
            const res = await supabase.from('workspace_files').insert(insertPayload as any).select('id').single();
            return res as { data: { id: string } | null; error: { message: string } | null };
          })()
        );
        if (dbErr) throw dbErr;
        if (!inserted?.id) throw new Error('Failed to register uploaded file');

        // Zip is registered — don't orphan-delete it if extract fails later.
        const idx = pendingOrphanPaths.indexOf(path);
        if (idx >= 0) pendingOrphanPaths.splice(idx, 1);

        if (shouldExtract) {
          setCurrentUploadingName(`Extracting ${f.name}…`);
          await withTimeout(
            r2ExtractZip({
              zipKey: path,
              zipFileId: inserted.id,
              folderId: targetFolderId,
              securityLevel: secLevel,
            }),
            300000,
          );
        }

        completed++;
        setProgress(Math.round((completed / files.length) * 100));
      }

      const CONCURRENCY = 4;
      for (let i = 0; i < files.length; i += CONCURRENCY) {
        if (cancelledRef.current) break;
        const batch = files.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(uploadOne));
      }

      if (cancelledRef.current) {
        if (pendingOrphanPaths.length > 0) {
          try { await r2Delete(pendingOrphanPaths); } catch { /* best effort */ }
        }
        toast({ title: 'Upload cancelled', description: `${completed} of ${files.length} file${files.length !== 1 ? 's' : ''} were uploaded before cancellation.` });
      } else {
        const zipCount = extractZips ? files.filter(f => isZipFile(f.file)).length : 0;
        toast({
          title: `${files.length} file${files.length !== 1 ? 's' : ''} uploaded`,
          description: zipCount > 0
            ? `Extracted ${zipCount} ZIP${zipCount !== 1 ? 's' : ''} · Security: ${SEC_CFG[secLevel].label}`
            : isFolderUpload
              ? `Folder structure recreated · Security: ${SEC_CFG[secLevel].label}`
              : `Security: ${SEC_CFG[secLevel].label}`,
        });
        onUploaded(); onClose(); setFiles([]); setDescription(''); setTags('');
      }
    } catch (e: any) {
      if (pendingOrphanPaths.length > 0) {
        try { await r2Delete(pendingOrphanPaths); } catch { /* best effort */ }
      }
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); cancelledRef.current = false; }
  }

  const isFolderMode = files.some(item => item.relativePath.includes('/'));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent hideCloseButton className="max-w-lg flex flex-col gap-0 p-0 max-h-[88vh] overflow-hidden">
        {/* ── Fixed header ── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b flex-shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#1D3461] to-[#0F2041] flex items-center justify-center flex-shrink-0">
                <Upload className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0F2041]">Upload Files or Folders</h2>
                <p className="text-[11px] text-muted-foreground">to <span className="font-medium text-[#1D3461]">{folderName || 'Root'}</span></p>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-[#1D3461]/30 hover:border-[#1D3461]/60 rounded-2xl p-5 text-center transition-colors bg-[#0F2041]/[0.02]"
            onDragOver={e => e.preventDefault()}
            onDrop={async e => {
              e.preventDefault();
              const entries = await readDroppedItems(e.dataTransfer);
              if (entries.length > 0) setFiles(prev => [...prev, ...entries]);
            }}
          >
            <Upload className="h-7 w-7 text-[#1D3461]/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-[#1D3461] mb-2.5">Drag files or a folder here</p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#1D3461]/30 hover:bg-[#1D3461]/5 text-[#1D3461] transition-colors"
                data-testid="button-pick-files"
              >
                <FileText className="h-3.5 w-3.5" />Choose Files
              </button>
              <button
                type="button"
                onClick={() => folderRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#1D3461]/30 hover:bg-[#1D3461]/5 text-[#1D3461] transition-colors"
                data-testid="button-pick-folder"
              >
                <FolderOpen className="h-3.5 w-3.5" />Choose Folder
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">All file types supported · No size limit per file</p>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files ?? [])} />
            {/* @ts-ignore */}
            <input ref={folderRef} type="file" multiple className="hidden" webkitdirectory="" onChange={e => addFiles(e.target.files ?? [])} />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="rounded-xl border bg-muted/20 overflow-hidden">
              {isFolderMode && (
                <div className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border-b text-[11px] text-blue-700 font-medium">
                  <FolderOpen className="h-3 w-3" />
                  Folder upload — subfolders will be created automatically
                </div>
              )}
              <div className="divide-y max-h-36 overflow-y-auto">
                {files.map((item, i) => {
                  const Icon = getFileIcon(item.file.type);
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs flex-1 truncate text-foreground" title={item.relativePath}>
                        {isFolderMode ? item.relativePath : item.file.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0 px-1.5 py-0.5 bg-muted rounded">{fmtSize(item.file.size)}</span>
                      <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="px-3 py-1.5 border-t bg-muted/10 text-[10px] text-muted-foreground">
                {files.length} file{files.length !== 1 ? 's' : ''} · {fmtSize(files.reduce((s, f) => s + f.file.size, 0))} total
              </div>
            </div>
          )}

          {/* ZIP extract toggle */}
          {hasZipSelected && (
            <label className="flex items-start gap-2.5 rounded-xl border border-[#1D3461]/20 bg-[#0F2041]/[0.03] px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={extractZips}
                onChange={e => setExtractZips(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-[#1D3461]/40"
                data-testid="checkbox-extract-zips"
              />
              <span className="min-w-0">
                <span className="text-xs font-semibold text-[#0F2041] block">Extract ZIP into this folder</span>
                <span className="text-[11px] text-muted-foreground">
                  Server unpacks archives (max 100MB, 500 files). Folder structure is recreated. Original ZIP is kept.
                </span>
              </span>
            </label>
          )}

          {/* Security level */}
          <div>
            <label className="text-xs font-semibold mb-2 block text-foreground">Security Level</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(SEC_CFG) as [SecurityLevel, any][]).map(([level, cfg]) => {
                const Icon = cfg.icon;
                const isSelected = secLevel === level;
                return (
                  <button key={level} onClick={() => setSecLevel(level)}
                    className={cn(
                      'flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all text-[11px] font-semibold',
                      isSelected ? `${cfg.bg} ${cfg.text} ${cfg.border} border-2 shadow-sm` : 'border-border hover:bg-muted/40 text-muted-foreground'
                    )}>
                    <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', isSelected ? '' : 'opacity-60')} />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 px-0.5">{SEC_CFG[secLevel].desc}</p>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold mb-1 block text-foreground">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description of these files…" className="text-xs min-h-[56px] resize-none" />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-semibold mb-1 block text-foreground">Tags <span className="font-normal text-muted-foreground">(comma-separated)</span></label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="report, finance, Q1…" className="h-8 text-xs" />
          </div>

          {/* Upload progress */}
          {uploading && (
            <div className="rounded-xl border bg-[#0F2041]/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Loader2 className="h-3 w-3 text-[#1D3461] animate-spin flex-shrink-0" />
                  <p className="text-[11px] text-muted-foreground truncate">{currentUploadingName || 'Preparing…'}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-[11px] font-bold text-[#1D3461]">{progress}%</p>
                  <button
                    onClick={() => { cancelledRef.current = true; }}
                    className="text-[10px] text-red-500 hover:text-red-600 font-medium px-1.5 py-0.5 rounded border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <Progress value={progress} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground text-center">
                {Math.floor(progress * files.length / 100)}/{files.length} file{files.length !== 1 ? 's' : ''} uploaded · times out after 45s per file
              </p>
            </div>
          )}
        </div>

        {/* ── Fixed footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20 flex-shrink-0 gap-3">
          <p className="text-[11px] text-muted-foreground">
            {files.length > 0
              ? <><span className="font-semibold text-foreground">{files.length}</span> file{files.length !== 1 ? 's' : ''} ready to upload</>
              : 'No files selected yet'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={uploading} className="h-8 text-xs">Cancel</Button>
            <Button size="sm" className="bg-[#1D3461] hover:bg-[#0F2041] h-8 text-xs gap-1.5 min-w-[120px]" onClick={handleUpload} disabled={uploading || files.length === 0}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {isFolderMode
                ? `Upload Folder (${files.length})`
                : files.length > 0 ? `Upload ${files.length} File${files.length !== 1 ? 's' : ''}` : 'Upload'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── File detail panel ────────────────────────────────────────────────────────

function FileDetailPanel({ file, currentUserId, onClose, onRefresh, canManage, isLocked, openShareSignal, onShareConsumed }: {
  file: WFile; currentUserId: string; onClose: () => void; onRefresh: () => void;
  canManage: boolean; isLocked: boolean;
  openShareSignal?: string | null;
  onShareConsumed?: () => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('info');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // Auto-open share dialog when external signal matches this file
  useEffect(() => {
    if (openShareSignal && openShareSignal === file.id) {
      setShareOpen(true);
      onShareConsumed?.();
    }
  }, [openShareSignal, file.id, onShareConsumed]);

  const { data: comments = [], refetch: refetchComments } = useQuery<WComment[]>({
    queryKey: ['workspace_comments', file.id],
    queryFn: async () => {
      const { data: comms } = await supabase.from('workspace_comments').select('*').eq('file_id', file.id).order('created_at', { ascending: true });
      if (!comms) return [];
      const authorIds = [...new Set(comms.map(c => c.author_id).filter(Boolean))];
      let nameMap: Record<string, string> = {};
      if (authorIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', authorIds);
        (profs ?? []).forEach(p => { nameMap[p.id] = p.full_name ?? 'Unknown'; });
      }
      return comms.map(c => ({ ...c, _authorName: c.author_id ? (nameMap[c.author_id] ?? 'Unknown') : 'Unknown' })) as WComment[];
    },
  });

  const { data: activity = [] } = useQuery<WActivity[]>({
    queryKey: ['workspace_activity', file.id],
    queryFn: async () => {
      const { data } = await supabase.from('workspace_activity').select('*').eq('file_id', file.id).order('created_at', { ascending: false }).limit(30);
      return (data ?? []) as WActivity[];
    },
    enabled: activeTab === 'activity',
  });

  const { data: versions = [] } = useQuery({
    queryKey: ['workspace_file_versions', file.id],
    queryFn: async () => {
      const { data } = await supabase.from('workspace_file_versions').select('*').eq('file_id', file.id).order('version', { ascending: false });
      return data ?? [];
    },
    enabled: activeTab === 'versions',
  });

  const Icon = getFileIcon(file.mime_type);

  async function submitComment() {
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const content = comment.trim();
      const { error } = await supabase.from('workspace_comments').insert({ file_id: file.id, author_id: currentUserId, content });
      if (error) throw error;
      await supabase.from('workspace_activity').insert({ file_id: file.id, user_id: currentUserId, action: 'commented', metadata: {} });
      await supabase.from('workspace_files').update({ updated_at: new Date().toISOString() }).eq('id', file.id);

      // ── @mention notifications ─────────────────────────────────────────
      const mentionMatches = [...content.matchAll(/@([A-Za-z][A-Za-z\s]*?)(?=\s|$|[^A-Za-z\s])/g)];
      if (mentionMatches.length > 0) {
        const names = [...new Set(mentionMatches.map(m => m[1].trim().toLowerCase()))];
        const { data: profs } = await supabase.from('profiles').select('id, full_name').neq('id', currentUserId);
        const mentioned = (profs ?? []).filter(p => names.some(n => p.full_name?.toLowerCase().includes(n)));
        if (mentioned.length > 0) {
          await insertNotificationsToDb(
            mentioned.map(p => ({
              recipient_id: p.id,
              user_id: p.id,
              title_en: 'You were mentioned in a file comment',
              message_en: `Someone mentioned you in a comment on "${file.name}": ${content.substring(0, 100)}`,
              event_type: 'mention',
              type: 'mention',
              action_url: '/workspace',
              is_read: false,
            }))
          );
        }
      }

      setComment(''); refetchComments();
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setSubmitting(false); }
  }

  async function downloadFile() {
    try {
      if (file.storage_provider === 'r2') {
        const signedUrl = await r2SignedUrl(file.storage_path, file.name);
        const a = document.createElement('a'); a.href = signedUrl; a.download = file.name; a.click();
      } else {
        const { data, error } = await supabase.storage.from('workspace-files').download(file.storage_path);
        if (error || !data) throw error ?? new Error('Download failed');
        const url = URL.createObjectURL(data);
        const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
      }
      await supabase.from('workspace_files').update({ download_count: (file.download_count ?? 0) + 1 }).eq('id', file.id);
      await supabase.from('workspace_activity').insert({ file_id: file.id, user_id: currentUserId, action: 'downloaded', metadata: {} });
      onRefresh();
    } catch (e: any) { toast({ title: 'Download failed', description: e.message, variant: 'destructive' }); }
  }

  async function togglePin() {
    const { error } = await supabase.from('workspace_files').update({ is_pinned: !file.is_pinned }).eq('id', file.id);
    if (error) { toast({ title: 'Failed to update pin', description: error.message, variant: 'destructive' }); return; }
    onRefresh();
  }

  return (
    <div className="flex flex-col h-full bg-background border-l">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b">
        <div className="h-12 w-12 rounded-xl bg-[#1D3461]/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-6 w-6 text-[#1D3461]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight truncate">{file.name}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <SecBadge level={file.security_level} size="xs" />
            <span className="text-[10px] text-muted-foreground">{fmtSize(file.file_size)}</span>
            <span className="text-[10px] text-muted-foreground">v{file.version}</span>
          </div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Image preview */}
      {file.mime_type?.startsWith('image/') && file.public_url && (
        <div className="border-b bg-muted/10 flex items-center justify-center p-3" style={{ maxHeight: 180 }}>
          <img
            src={file.public_url}
            alt={file.name}
            className="max-h-40 max-w-full rounded-lg object-contain shadow-sm border"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-muted/20">
        {(file.allow_download || canManage) && !isLocked && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={downloadFile}>
            <Download className="h-3 w-3" />Download
          </Button>
        )}
        {!file.allow_download && !canManage && (
          <span className="flex items-center gap-1 text-[11px] text-orange-600 bg-orange-50 border border-orange-200 px-2 py-1 rounded-md">
            <Ban className="h-3 w-3" />Downloads disabled · التحميل معطل
          </span>
        )}
        {canManage && (
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShareOpen(true)}>
            <Share2 className="h-3 w-3" />Share
          </Button>
        )}
        <button onClick={togglePin} className={cn('p-1.5 rounded-lg border transition-all', file.is_pinned ? 'bg-amber-100 border-amber-300 text-amber-700' : 'border-border text-muted-foreground hover:text-foreground')}>
          {file.is_pinned ? <Star className="h-3.5 w-3.5" /> : <StarOff className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full rounded-none border-b bg-transparent h-9 px-4 justify-start gap-0">
          {[
            { id: 'info', label: 'Info', icon: Info },
            { id: 'comments', label: `Comments${comments.length > 0 ? ` (${comments.length})` : ''}`, icon: MessageSquare },
            { id: 'versions', label: 'Versions', icon: History },
            { id: 'activity', label: 'Activity', icon: Activity },
          ].map(t => (
            <TabsTrigger key={t.id} value={t.id} className="h-8 text-xs gap-1 rounded-none border-b-2 border-transparent data-[state=active]:border-[#1D3461] data-[state=active]:bg-transparent">
              <t.icon className="h-3 w-3" />{t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Info tab */}
        <TabsContent value="info" className="flex-1 overflow-y-auto p-4 mt-0 space-y-3">
          {file.description && <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">{file.description}</p>}
          <div className="space-y-2">
            {[
              { label: 'Created', value: fmtDate(file.created_at) },
              { label: 'Modified', value: fmtRelative(file.updated_at) },
              { label: 'Downloads', value: file.download_count.toString() },
              { label: 'Views', value: file.view_count.toString() },
              { label: 'Version', value: `v${file.version}${file.version_label ? ` — ${file.version_label}` : ''}` },
              ...(file.expires_at ? [{ label: 'Expires', value: fmtDate(file.expires_at) }] : []),
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center py-1.5 border-b last:border-b-0">
                <span className="text-[11px] text-muted-foreground">{r.label}</span>
                <span className="text-[11px] font-medium">{r.value}</span>
              </div>
            ))}
          </div>
          {file.tags.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Tags</p>
              <div className="flex flex-wrap gap-1">{file.tags.map(t => <span key={t} className="text-[10px] bg-muted px-2 py-0.5 rounded-full border">{t}</span>)}</div>
            </div>
          )}
        </TabsContent>

        {/* Comments tab */}
        <TabsContent value="comments" className="flex-1 flex flex-col min-h-0 mt-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
                <MessageSquare className="h-8 w-8 opacity-30" />
                <p className="text-xs">No comments yet</p>
              </div>
            ) : (
              comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <div className="h-6 w-6 rounded-full bg-[#1D3461]/15 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#1D3461]">
                    {(c._authorName ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[11px] font-semibold">{c._authorName}</span>
                      <span className="text-[10px] text-muted-foreground">{fmtRelative(c.created_at)}</span>
                    </div>
                    <p className="text-xs mt-0.5 bg-muted/30 rounded-lg px-2.5 py-2">{c.content}</p>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="p-3 border-t flex gap-2">
            <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Add a comment… (use @Name to notify someone)" className="text-xs min-h-[60px] resize-none" onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) submitComment(); }} />
            <Button size="sm" className="self-end bg-[#1D3461] hover:bg-[#0F2041] h-8 w-8 p-0" onClick={submitComment} disabled={submitting || !comment.trim()}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </TabsContent>

        {/* Versions tab */}
        <TabsContent value="versions" className="flex-1 overflow-y-auto p-4 mt-0 space-y-3">
          {/* Current version always shown */}
          <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-[#1D3461]/30 bg-[#1D3461]/5">
            <div className="h-8 w-8 rounded-lg bg-[#1D3461] flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-white">v{file.version}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold">{file.version_label || `Version ${file.version}`}</p>
                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">Current</span>
              </div>
              <p className="text-[11px] text-muted-foreground">{fmtRelative(file.updated_at)} · {fmtSize(file.file_size)}</p>
            </div>
          </div>

          {/* Previous versions */}
          {versions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Previous Versions</p>
              {(versions as any[]).map((v, idx) => (
                <div key={v.id ?? idx} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/20 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-muted-foreground">v{v.version ?? (file.version - idx - 1)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{v.version_label || `Version ${v.version ?? (file.version - idx - 1)}`}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {v.created_at ? fmtRelative(v.created_at) : '—'}
                      {v.file_size ? ` · ${fmtSize(v.file_size)}` : ''}
                    </p>
                  </div>
                  {v.storage_path && (
                    <button
                      onClick={async () => {
                        let signedUrl: string | undefined;
                        if (v.storage_provider === 'r2') {
                          signedUrl = await r2SignedUrl(v.storage_path, file.name).catch(() => undefined);
                        } else {
                          const { data: signed } = await supabase.storage.from('workspace-files').createSignedUrl(v.storage_path, 3600, { download: file.name });
                          signedUrl = signed?.signedUrl;
                        }
                        if (signedUrl) { const a = document.createElement('a'); a.href = signedUrl; a.download = file.name; a.click(); }
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-[#1D3461] hover:bg-[#1D3461]/5 transition-colors"
                      title="Download this version"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-muted-foreground gap-2">
              <History className="h-8 w-8 opacity-20" />
              <p className="text-xs">No previous versions recorded</p>
              <p className="text-[11px] opacity-70">Upload a new version to see version history here</p>
            </div>
          )}
        </TabsContent>

        {/* Activity tab */}
        <TabsContent value="activity" className="flex-1 overflow-y-auto p-4 mt-0 space-y-2">
          {activity.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-muted-foreground gap-2">
              <Activity className="h-8 w-8 opacity-30" /><p className="text-xs">No activity recorded</p>
            </div>
          ) : (
            activity.map(a => (
              <div key={a.id} className="flex gap-2 py-1.5 border-b last:border-b-0">
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Activity className="h-2.5 w-2.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px]"><span className="font-medium">{a._userName ?? 'Someone'}</span> {a.action}</p>
                  <p className="text-[10px] text-muted-foreground">{fmtRelative(a.created_at)}</p>
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>

      <ShareDialog file={file} open={shareOpen} onClose={() => setShareOpen(false)} currentUserId={currentUserId} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface TaskDocEntry {
  taskId: string; taskTitle: string; assignedToName: string | null;
  dueDate: string | null; status: string;
  attachments: { name: string; url: string; uploadedAt: string; size?: number; type?: string }[];
}

export default function WorkspaceHub() {
  const navigate = useNavigate();
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'Admin']);
  const isSuperAdmin = hasAnyRole(['super_admin']);
  const isExecutive = hasAnyRole(['super_admin', 'admin', 'Admin', 'CEO', 'COO', 'CTO', 'country_director', 'countryDirector']);

  const userId = currentUser?.id ?? '';

  // Permission helpers — owner of the file/folder, or admin/superadmin
  const canManageFile = useCallback(
    (f: { created_by: string | null }) => isSuperAdmin || isAdmin || f.created_by === userId,
    [isSuperAdmin, isAdmin, userId]
  );
  const canManageFolder = useCallback(
    (f: { created_by: string | null }) => isSuperAdmin || isAdmin || f.created_by === userId,
    [isSuperAdmin, isAdmin, userId]
  );
  // Pending "open share for this file" — set by file menu Share item, consumed by FileDetailPanel
  const [openShareForFileId, setOpenShareForFileId] = useState<string | null>(null);
  const [shareFileTarget, setShareFileTarget] = useState<WFile | null>(null);

  // Fetch current user's security clearance
  const { data: myClearance } = useQuery<SecurityLevel>({
    queryKey: ['my-workspace-clearance', userId],
    queryFn: async () => {
      if (!userId) return 'internal' as SecurityLevel;
      const { data } = await supabase
        .from('workspace_security_clearances')
        .select('clearance_level')
        .eq('user_id', userId)
        .maybeSingle();
      return (data?.clearance_level ?? 'internal') as SecurityLevel;
    },
    enabled: !!userId && !isSuperAdmin,
    staleTime: 60_000,
  });

  const effectiveClearance: SecurityLevel = isSuperAdmin ? 'top_secret' : (myClearance ?? 'internal');

  // ── Task Documents ─────────────────────────────────────────────────────────
  const { data: taskDocsRaw = [] } = useQuery<TaskDocEntry[]>({
    queryKey: ['workspace-task-docs', userId, isExecutive],
    queryFn: async () => {
      if (!userId) return [];
      let q = supabase.from('personal_tasks')
        .select('id, title, status, due_date, assigned_to_name, tools, user_id, assigned_to, co_assignees')
        .not('tools', 'is', null)
        .ilike('tools', '__meta:%')
        .limit(300);
      if (!isExecutive) {
        q = q.or(`user_id.eq.${userId},assigned_to.eq.${userId}`);
      }
      const { data } = await q;
      const results: TaskDocEntry[] = [];
      for (const row of (data ?? []) as any[]) {
        try {
          const meta = JSON.parse(String(row.tools ?? '').slice(7));
          const atts = meta?.attachments;
          if (!Array.isArray(atts) || atts.length === 0) continue;
          // For non-executive: also check co_assignees
          if (!isExecutive) {
            const isCreator = row.user_id === userId;
            const isAssignee = row.assigned_to === userId;
            const coAssignees: any[] = Array.isArray(row.co_assignees) ? row.co_assignees : (row.co_assignees ? Object.values(row.co_assignees) : []);
            const isCo = coAssignees.some((a: any) => a?.id === userId);
            if (!isCreator && !isAssignee && !isCo) continue;
          }
          results.push({ taskId: row.id, taskTitle: String(row.title ?? ''), assignedToName: row.assigned_to_name, dueDate: row.due_date, status: row.status, attachments: atts });
        } catch { /* skip */ }
      }
      return results;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const [accessManagerOpen, setAccessManagerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'manage-access' && isSuperAdmin) {
      setAccessManagerOpen(true);
    }
  }, [location.search, isSuperAdmin]);

  // ESC key closes the file detail panel
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedFile(null);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<WFile | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [secFilter, setSecFilter] = useState<SecurityLevel | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'pdf' | 'excel' | 'word' | 'zip' | 'other'>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderDesc, setNewFolderDesc] = useState('');
  const [newFolderSec, setNewFolderSec] = useState<SecurityLevel>('internal');
  // ── Bulk selection state ──────────────────────────────────────────────────
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkMoveFolderId, setBulkMoveFolderId] = useState<string>('__root__');
  const [bulkMoving, setBulkMoving] = useState(false);
  const [shareFolderTarget, setShareFolderTarget] = useState<WFolder | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('date');
  const [renameTarget, setRenameTarget] = useState<{ type: 'file' | 'folder'; id: string; currentName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [moveTarget, setMoveTarget] = useState<WFile | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null | '__root__'>('__root__');
  const [moving, setMoving] = useState(false);
  const [qrFile, setQrFile] = useState<WFile | null>(null);
  const [qrFgColor, setQrFgColor] = useState('#0F2041');
  const [qrBgColor, setQrBgColor] = useState('#FFFFFF');
  const [showQrCustomize, setShowQrCustomize] = useState(false);

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [dragFileId, setDragFileId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [isExternalDragOver, setIsExternalDragOver] = useState(false);
  const [pendingDropEntries, setPendingDropEntries] = useState<{file: File; relativePath: string}[]>([]);
  const externalDragCounter = useRef(0);

  // ── Folder customization state ────────────────────────────────────────────
  const [folderCustomizeTarget, setFolderCustomizeTarget] = useState<{ id: string; name: string; color: string; icon: string } | null>(null);
  const [customColor, setCustomColor] = useState('#1D3461');
  const [customIcon, setCustomIcon] = useState('');

  // ── Password protection state ─────────────────────────────────────────────
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [unlockedFolderIds, setUnlockedFolderIds] = useState<Set<string>>(new Set());
  const [passwordPromptTarget, setPasswordPromptTarget] = useState<PasswordTarget | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordWrong, setPasswordWrong] = useState(false);
  const [showPromptPwd, setShowPromptPwd] = useState(false);
  const [passwordSetTarget, setPasswordSetTarget] = useState<PasswordTarget | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const { data: folders = [], refetch: refetchFolders } = useQuery<WFolder[]>({
    queryKey: ['workspace_folders', userId],
    queryFn: async () => {
      const { data } = await supabase.from('workspace_folders').select('*').eq('archived', false).order('name');
      return (data ?? []) as WFolder[];
    },
    staleTime: 300_000,
  });

  // Deep-link: /workspace?folder=<id> opens that folder in the tree
  useEffect(() => {
    const folderId = new URLSearchParams(location.search).get('folder');
    if (!folderId || folders.length === 0) return;
    const target = folders.find(f => f.id === folderId);
    if (!target) return;

    setSelectedFolderId(folderId);
    setExpandedFolders(prev => {
      const next = new Set(prev);
      let current: WFolder | undefined = target;
      while (current) {
        next.add(current.id);
        current = current.parent_folder_id
          ? folders.find(f => f.id === current!.parent_folder_id)
          : undefined;
      }
      return next;
    });
  }, [location.search, folders]);

  const { data: allFiles = [], refetch: refetchFiles } = useQuery<WFile[]>({
    queryKey: ['workspace_files', userId],
    queryFn: async () => {
      const { data: files } = await supabase.from('workspace_files').select('*').eq('archived', false).order('updated_at', { ascending: false });
      if (!files) return [];
      const uploaderIds = [...new Set(files.map(f => f.created_by).filter(Boolean))];
      let nameMap: Record<string, string> = {};
      if (uploaderIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', uploaderIds);
        (profs ?? []).forEach(p => { nameMap[p.id] = p.full_name ?? 'Unknown'; });
      }
      return files.map(f => ({ ...f, _uploaderName: f.created_by ? (nameMap[f.created_by] ?? 'Unknown') : 'Unknown' })) as WFile[];
    },
    staleTime: 300_000,
  });

  const { data: archivedFiles = [], refetch: refetchArchived } = useQuery<WFile[]>({
    queryKey: ['workspace_archived_files', userId],
    queryFn: async () => {
      const { data } = await supabase.from('workspace_files').select('*').eq('archived', true).order('updated_at', { ascending: false });
      if (!data) return [];
      const ids = [...new Set(data.map(f => f.created_by).filter(Boolean))];
      let nameMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        (profs ?? []).forEach(p => { nameMap[p.id] = p.full_name ?? 'Unknown'; });
      }
      return data.map(f => ({ ...f, _uploaderName: f.created_by ? (nameMap[f.created_by] ?? 'Unknown') : 'Unknown' })) as WFile[];
    },
    enabled: selectedFolderId === '__trash__',
    staleTime: 120_000,
  });

  const { data: archivedFolders = [], refetch: refetchArchivedFolders } = useQuery<WFolder[]>({
    queryKey: ['workspace_archived_folders', userId],
    queryFn: async () => {
      const { data } = await supabase.from('workspace_folders').select('*').eq('archived', true).order('name');
      return (data ?? []) as WFolder[];
    },
    enabled: selectedFolderId === '__trash__',
    staleTime: 120_000,
  });

  const refetch = useCallback(() => { refetchFolders(); refetchFiles(); if (selectedFolderId === '__trash__') { refetchArchived(); refetchArchivedFolders(); } }, [refetchFolders, refetchFiles, refetchArchived, refetchArchivedFolders, selectedFolderId]);

  // ── Folder tree helpers ───────────────────────────────────────────────────

  // Filter folders by security clearance — folder creator and admins always see their own folders
  const visibleFolders = useMemo(() =>
    folders.filter(f =>
      isSuperAdmin || isAdmin || f.created_by === userId ||
      CLEARANCE_ORDER[f.security_level] <= CLEARANCE_ORDER[effectiveClearance]
    ),
  [folders, isSuperAdmin, isAdmin, userId, effectiveClearance]);

  const rootFolders = visibleFolders.filter(f => !f.parent_folder_id);
  const childMap = useMemo(() => {
    const m: Record<string, WFolder[]> = {};
    visibleFolders.forEach(f => { if (f.parent_folder_id) { if (!m[f.parent_folder_id]) m[f.parent_folder_id] = []; m[f.parent_folder_id].push(f); } });
    return m;
  }, [visibleFolders]);

  // Sub-folders visible in the main content area for the current folder
  const VIRTUAL_VIEWS = new Set(['__recent__', '__pinned__', '__mine__', '__all__', '__task_docs__', '__trash__']);
  const currentSubFolders = useMemo<WFolder[]>(() => {
    if (selectedFolderId && VIRTUAL_VIEWS.has(selectedFolderId)) return [];
    if (selectedFolderId === null) return rootFolders; // root — show top-level folders
    return childMap[selectedFolderId] ?? [];
  }, [selectedFolderId, childMap, rootFolders]);

  const fileCounts = useMemo(() => {
    const m: Record<string, number> = {};
    allFiles.forEach(f => { if (f.folder_id) m[f.folder_id] = (m[f.folder_id] ?? 0) + 1; });
    return m;
  }, [allFiles]);

  function toggleExpand(id: string) {
    setExpandedFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Displayed files ───────────────────────────────────────────────────────

  const lockedFolderIdSet = useMemo(() =>
    new Set(folders.filter(f => f.password_hash && !unlockedFolderIds.has(f.id)).map(f => f.id)),
  [folders, unlockedFolderIds]);

  const displayedFiles = useMemo(() => {
    let files = allFiles;
    // The uploader (created_by === userId) ALWAYS keeps access to their file
    // unless ownership has been transferred. Admins and superadmins also bypass.
    const isOwnerOrAdmin = (f: WFile) => isSuperAdmin || isAdmin || f.created_by === userId;
    // Enforce security clearance — hide files above user's clearance level (uploader/admin bypass)
    files = files.filter(f => isOwnerOrAdmin(f) || CLEARANCE_ORDER[f.security_level] <= CLEARANCE_ORDER[effectiveClearance]);
    if (selectedFolderId === '__pinned__') files = files.filter(f => f.is_pinned);
    else if (selectedFolderId === '__recent__') files = [...files].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20);
    else if (selectedFolderId === '__mine__') files = files.filter(f => f.created_by === userId);
    else if (selectedFolderId === '__all__') { /* no-op: show every visible file */ }
    else if (selectedFolderId) files = files.filter(f => f.folder_id === selectedFolderId);
    else files = files.filter(f => !f.folder_id); // null = root only (no folder)
    // Hide files that belong to locked folders (uploader/admin bypass)
    files = files.filter(f => isOwnerOrAdmin(f) || !f.folder_id || !lockedFolderIdSet.has(f.folder_id));
    if (secFilter !== 'all') files = files.filter(f => f.security_level === secFilter);
    if (typeFilter !== 'all') {
      files = files.filter(f => {
        const mime = f.mime_type ?? '';
        const ext  = (f.extension ?? '').toLowerCase();
        if (typeFilter === 'image') return mime.startsWith('image/');
        if (typeFilter === 'pdf')   return mime === 'application/pdf' || ext === 'pdf';
        if (typeFilter === 'excel') return mime.includes('spreadsheet') || mime.includes('excel') || ['xlsx','xls','csv'].includes(ext);
        if (typeFilter === 'word')  return mime.includes('word') || mime.includes('document') || ['docx','doc'].includes(ext);
        if (typeFilter === 'zip')   return mime.includes('zip') || mime.includes('compressed') || ['zip','rar','7z','tar','gz'].includes(ext);
        // 'other' = anything not in the above
        return !mime.startsWith('image/') && mime !== 'application/pdf' && !mime.includes('spreadsheet') && !mime.includes('excel') && !mime.includes('word') && !mime.includes('document') && !mime.includes('zip') && !['pdf','xlsx','xls','csv','docx','doc','zip','rar','7z','tar','gz'].includes(ext);
      });
    }
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); files = files.filter(f => f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q) || f.tags.some(t => t.toLowerCase().includes(q)) || (f._uploaderName ?? '').toLowerCase().includes(q)); }
    return [...files].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.file_size - a.file_size;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [allFiles, selectedFolderId, secFilter, typeFilter, searchQuery, sortBy, userId, lockedFolderIdSet, effectiveClearance]);

  // ── Folder actions ────────────────────────────────────────────────────────

  const selectedFolder = selectedFolderId ? folders.find(f => f.id === selectedFolderId) : null;

  async function createFolder() {
    if (!newFolderName.trim()) return;
    // Enforce ancestor floor — never save a level below the most restrictive ancestor
    const enforcedLevel: SecurityLevel =
      CLEARANCE_ORDER[newFolderSec] >= CLEARANCE_ORDER[ancestorSecFloor] ? newFolderSec : ancestorSecFloor;
    const { error } = await supabase.from('workspace_folders').insert({
      name: newFolderName.trim(), description: newFolderDesc.trim() || null,
      security_level: enforcedLevel, created_by: userId,
      parent_folder_id: selectedFolder?.id ?? null,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    refetchFolders(); setNewFolderOpen(false); setNewFolderName(''); setNewFolderDesc(''); setNewFolderSec('internal');
    toast({ title: 'Folder created' });
  }

  async function duplicateFolder(folder: WFolder) {
    const { data: newFolder, error } = await supabase.from('workspace_folders').insert({
      name: `${folder.name} (Copy)`, description: folder.description,
      security_level: folder.security_level, created_by: userId,
      parent_folder_id: folder.parent_folder_id, color: folder.color, icon: folder.icon,
    }).select().single();
    if (error || !newFolder) { toast({ title: 'Duplicate failed', description: error?.message, variant: 'destructive' }); return; }
    // Copy files from the source folder into the new one
    const sourceFiles = allFiles.filter(f => f.folder_id === folder.id);
    if (sourceFiles.length > 0) {
      await supabase.from('workspace_files').insert(
        sourceFiles.map(f => ({
          folder_id: newFolder.id, name: f.name, description: f.description,
          storage_path: f.storage_path, public_url: f.public_url, file_size: f.file_size,
          storage_provider: f.storage_provider ?? 'supabase',
          mime_type: f.mime_type, extension: f.extension, security_level: f.security_level,
          tags: f.tags, created_by: userId, version: 1, allow_download: f.allow_download,
        }))
      );
    }
    refetchFolders(); refetchFiles();
    toast({ title: 'Folder duplicated', description: `"${folder.name} (Copy)" created with ${sourceFiles.length} file${sourceFiles.length !== 1 ? 's' : ''}` });
  }

  async function restoreFile(file: WFile) {
    const { error } = await supabase.from('workspace_files').update({ archived: false, updated_at: new Date().toISOString() }).eq('id', file.id);
    if (error) { toast({ title: 'Failed to restore file', description: error.message, variant: 'destructive' }); return; }
    await supabase.from('workspace_activity').insert({ file_id: file.id, user_id: userId, action: 'restored', metadata: {} });
    refetchArchived(); refetchFiles();
    toast({ title: 'File restored', description: file.name });
  }

  async function restoreFolder(folder: WFolder) {
    const { error } = await supabase.from('workspace_folders').update({ archived: false }).eq('id', folder.id);
    if (error) { toast({ title: 'Failed to restore folder', description: error.message, variant: 'destructive' }); return; }
    refetchArchivedFolders(); refetchFolders();
    toast({ title: 'Folder restored', description: folder.name });
  }

  async function permanentlyDeleteFile(file: WFile) {
    if (file.storage_provider === 'r2') {
      try { await r2Delete(file.storage_path); } catch { /* best effort — row delete below is the source of truth */ }
    } else {
      await supabase.storage.from('workspace-files').remove([file.storage_path]);
    }
    const { error } = await supabase.from('workspace_files').delete().eq('id', file.id);
    if (error) { toast({ title: 'Failed to delete file', description: error.message, variant: 'destructive' }); return; }
    refetchArchived();
    toast({ title: 'File permanently deleted' });
  }

  async function bulkDeleteFiles() {
    const ids = [...selectedFileIds];
    const toDelete = allFiles.filter(f => ids.includes(f.id));
    const results = await Promise.all(toDelete.map(f => supabase.from('workspace_files').update({ archived: true }).eq('id', f.id)));
    const failed = results.filter(r => r.error);
    if (failed.length > 0) { toast({ title: 'Some files could not be moved to trash', description: failed[0].error?.message, variant: 'destructive' }); return; }
    setSelectedFileIds(new Set());
    refetchFiles();
    toast({ title: `${ids.length} file${ids.length !== 1 ? 's' : ''} moved to trash` });
  }

  async function bulkMoveFiles() {
    if (!bulkMoveOpen) return;
    setBulkMoving(true);
    const ids = [...selectedFileIds];
    const targetFolder = bulkMoveFolderId === '__root__' ? null : bulkMoveFolderId;
    await Promise.all(ids.map(id => supabase.from('workspace_files').update({ folder_id: targetFolder, updated_at: new Date().toISOString() }).eq('id', id)));
    setSelectedFileIds(new Set());
    setBulkMoveOpen(false);
    setBulkMoveFolderId('__root__');
    setBulkMoving(false);
    refetchFiles();
    toast({ title: `${ids.length} file${ids.length !== 1 ? 's' : ''} moved` });
  }

  const lastSelectedIdxRef = useRef<number>(-1);
  function toggleFileSelection(fileId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const currentIdx = displayedFiles.findIndex(f => f.id === fileId);
    if (e.shiftKey && lastSelectedIdxRef.current >= 0 && currentIdx >= 0) {
      const start = Math.min(lastSelectedIdxRef.current, currentIdx);
      const end   = Math.max(lastSelectedIdxRef.current, currentIdx);
      const rangeIds = displayedFiles.slice(start, end + 1).map(f => f.id);
      setSelectedFileIds(prev => { const n = new Set(prev); rangeIds.forEach(id => n.add(id)); return n; });
    } else {
      lastSelectedIdxRef.current = currentIdx;
      setSelectedFileIds(prev => { const n = new Set(prev); n.has(fileId) ? n.delete(fileId) : n.add(fileId); return n; });
    }
  }

  async function togglePinFile(file: WFile) {
    const next = !file.is_pinned;
    // Optimistic update
    refetchFiles();
    const { error } = await supabase.from('workspace_files').update({ is_pinned: next, updated_at: new Date().toISOString() }).eq('id', file.id);
    if (error) { toast({ title: 'Failed to update pin', description: error.message, variant: 'destructive' }); return; }
    if (selectedFile?.id === file.id) setSelectedFile(prev => prev ? { ...prev, is_pinned: next } : null);
    refetchFiles();
    toast({ title: next ? 'File pinned' : 'File unpinned', description: file.name });
  }

  async function deleteFile(file: WFile) {
    // Archive only — do NOT remove from storage; permanent deletion happens in the Recycle Bin
    const { error } = await supabase.from('workspace_files').update({ archived: true }).eq('id', file.id);
    if (error) { toast({ title: 'Failed to remove file', description: error.message, variant: 'destructive' }); return; }
    await supabase.from('workspace_activity').insert({ file_id: file.id, user_id: userId, action: 'deleted', metadata: {} });
    if (selectedFile?.id === file.id) setSelectedFile(null);
    refetchFiles();
    toast({ title: 'File moved to Recycle Bin', description: 'You can restore it from the Trash tab.' });
  }

  async function changeFileSecurity(file: WFile, level: SecurityLevel) {
    const { error } = await supabase.from('workspace_files').update({ security_level: level, updated_at: new Date().toISOString() }).eq('id', file.id);
    if (error) { toast({ title: 'Failed to update security level', description: error.message, variant: 'destructive' }); return; }
    refetchFiles();
    if (selectedFile?.id === file.id) setSelectedFile(prev => prev ? { ...prev, security_level: level } : null);
    toast({ title: 'Security level updated', description: `${file.name} → ${SEC_CFG[level].label}` });
  }

  async function changeFolderSecurity(folderId: string, folderName: string, level: SecurityLevel) {
    const { error } = await supabase.from('workspace_folders').update({ security_level: level }).eq('id', folderId);
    if (error) { toast({ title: 'Failed to update folder security', description: error.message, variant: 'destructive' }); return; }
    refetchFolders();
    toast({ title: 'Folder security updated', description: `${folderName} → ${SEC_CFG[level].label}` });
  }

  function SecuritySubMenu({ current, onSelect }: { current: SecurityLevel; onSelect: (l: SecurityLevel) => void }) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs cursor-pointer">
          <Shield className="h-3.5 w-3.5 mr-2 text-blue-600" />Change Security…
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="text-xs min-w-[180px]">
            {(Object.entries(SEC_CFG) as [SecurityLevel, any][]).map(([level, cfg]) => {
              const Icon = cfg.icon;
              const isActive = level === current;
              return (
                <DropdownMenuItem key={level} onClick={() => onSelect(level)}
                  className={isActive ? `${cfg.bg} ${cfg.text} font-semibold` : ''}>
                  <Icon className={`h-3.5 w-3.5 mr-2 ${isActive ? cfg.text : ''}`} />
                  <span className="flex-1">{cfg.label}</span>
                  {isActive && <span className="text-[9px] ml-2 opacity-70">current</span>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  }

  async function toggleDownload(file: WFile) {
    const next = !file.allow_download;
    const { error } = await supabase.from('workspace_files').update({ allow_download: next, updated_at: new Date().toISOString() }).eq('id', file.id);
    if (error) { toast({ title: 'Failed to update download setting', description: error.message, variant: 'destructive' }); return; }
    refetchFiles();
    if (selectedFile?.id === file.id) setSelectedFile(prev => prev ? { ...prev, allow_download: next } : null);
    toast({ title: next ? 'Downloads enabled' : 'Downloads disabled', description: file.name });
  }

  async function moveFileTo(fileId: string, folderId: string | null) {
    const { error } = await supabase.from('workspace_files').update({ folder_id: folderId, updated_at: new Date().toISOString() }).eq('id', fileId);
    if (error) { toast({ title: 'Failed to move file', description: error.message, variant: 'destructive' }); return; }
    refetchFiles();
    setDragFileId(null);
    setDragOverFolderId(null);
    toast({ title: 'File moved' });
  }

  async function saveFolderCustomize() {
    if (!folderCustomizeTarget) return;
    const { error } = await supabase.from('workspace_folders').update({ color: customColor, icon: customIcon }).eq('id', folderCustomizeTarget.id);
    if (error) { toast({ title: 'Failed to update folder', description: error.message, variant: 'destructive' }); return; }
    refetchFolders();
    setFolderCustomizeTarget(null);
    toast({ title: 'Folder updated' });
  }

  async function renameItem() {
    if (!renameTarget || !renameValue.trim()) return;
    setRenaming(true);
    try {
      const newName = renameValue.trim();
      if (renameTarget.type === 'file') {
        const { error } = await supabase.from('workspace_files').update({ name: newName, updated_at: new Date().toISOString() }).eq('id', renameTarget.id);
        if (error) throw error;
        await supabase.from('workspace_activity').insert({ file_id: renameTarget.id, user_id: userId, action: 'renamed', metadata: { from: renameTarget.currentName, to: newName } });
        if (selectedFile?.id === renameTarget.id) setSelectedFile(prev => prev ? { ...prev, name: newName } : null);
      } else {
        const { error } = await supabase.from('workspace_folders').update({ name: newName }).eq('id', renameTarget.id);
        if (error) throw error;
        refetchFolders();
      }
      refetchFiles();
      setRenameTarget(null);
      setRenameValue('');
      toast({ title: 'Renamed successfully' });
    } catch (e: any) {
      toast({ title: 'Rename failed', description: e.message, variant: 'destructive' });
    } finally { setRenaming(false); }
  }

  async function moveFile() {
    if (!moveTarget) return;
    setMoving(true);
    const targetFolder = moveFolderId === '__root__' ? null : moveFolderId as string | null;
    try {
      const { error } = await supabase.from('workspace_files').update({ folder_id: targetFolder, updated_at: new Date().toISOString() }).eq('id', moveTarget.id);
      if (error) throw error;
      await supabase.from('workspace_activity').insert({ file_id: moveTarget.id, user_id: userId, action: 'moved', metadata: { to_folder_id: targetFolder } });
      refetchFiles();
      setMoveTarget(null);
      setMoveFolderId('__root__');
      toast({ title: 'File moved' });
    } catch (e: any) {
      toast({ title: 'Move failed', description: e.message, variant: 'destructive' });
    } finally { setMoving(false); }
  }

  // ── Password protection helpers ───────────────────────────────────────────

  function openFile(file: WFile) {
    if (file.password_hash && !unlockedIds.has(file.id)) {
      setPasswordPromptTarget({ id: file.id, name: file.name, password_hash: file.password_hash, isFolder: false });
      setPasswordInput('');
      setPasswordWrong(false);
      setShowPromptPwd(false);
    } else {
      setSelectedFile(prev => prev?.id === file.id ? null : file);
    }
  }

  function openFolder(folder: WFolder) {
    // Block navigation if this folder's security level exceeds user's clearance
    // (owner and admins always pass through)
    const isOwner = folder.created_by === userId;
    if (!isOwner && !isSuperAdmin && !isAdmin && CLEARANCE_ORDER[folder.security_level] > CLEARANCE_ORDER[effectiveClearance]) {
      toast({ title: 'Access denied', description: `You need ${SEC_CFG[folder.security_level].label} clearance to open this folder.`, variant: 'destructive' });
      return;
    }
    if (folder.password_hash && !unlockedFolderIds.has(folder.id)) {
      setPasswordPromptTarget({ id: folder.id, name: folder.name, password_hash: folder.password_hash, isFolder: true });
      setPasswordInput('');
      setPasswordWrong(false);
      setShowPromptPwd(false);
    } else {
      setSelectedFolderId(folder.id);
      setExpandedFolders(prev => { const n = new Set(prev); n.add(folder.id); return n; });
    }
  }

  async function submitPasswordPrompt() {
    if (!passwordPromptTarget) return;
    const hash = await hashPassword(passwordInput);
    if (hash === passwordPromptTarget.password_hash) {
      if (passwordPromptTarget.isFolder) {
        setUnlockedFolderIds(prev => new Set([...prev, passwordPromptTarget.id]));
        setSelectedFolderId(passwordPromptTarget.id);
        setExpandedFolders(prev => { const n = new Set(prev); n.add(passwordPromptTarget.id); return n; });
      } else {
        setUnlockedIds(prev => new Set([...prev, passwordPromptTarget.id]));
        const file = allFiles.find(f => f.id === passwordPromptTarget.id);
        if (file) setSelectedFile(file);
      }
      setPasswordPromptTarget(null);
      setPasswordInput('');
      setPasswordWrong(false);
    } else {
      setPasswordWrong(true);
    }
  }

  async function savePassword() {
    if (!passwordSetTarget) return;
    if (newPasswordValue && newPasswordValue !== confirmPasswordValue) {
      toast({ title: 'Passwords do not match', variant: 'destructive' }); return;
    }
    setPwdSaving(true);
    try {
      const hash = newPasswordValue ? await hashPassword(newPasswordValue) : null;
      const table = passwordSetTarget.isFolder ? 'workspace_folders' : 'workspace_files';
      const { error } = await supabase.from(table).update({ password_hash: hash, updated_at: new Date().toISOString() }).eq('id', passwordSetTarget.id);
      if (error) throw error;
      if (passwordSetTarget.isFolder) {
        if (hash) setUnlockedFolderIds(prev => new Set([...prev, passwordSetTarget.id]));
        else setUnlockedFolderIds(prev => { const n = new Set(prev); n.delete(passwordSetTarget.id); return n; });
        refetchFolders();
      } else {
        if (hash) setUnlockedIds(prev => new Set([...prev, passwordSetTarget.id]));
        else setUnlockedIds(prev => { const n = new Set(prev); n.delete(passwordSetTarget.id); return n; });
        refetchFiles();
      }
      setPasswordSetTarget(null);
      setNewPasswordValue('');
      setConfirmPasswordValue('');
      const label = passwordSetTarget.isFolder ? 'Folder' : 'File';
      toast({ title: hash ? 'Password set' : 'Password removed', description: hash ? `${label} is now password-protected.` : `${label} is now accessible without a password.` });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setPwdSaving(false); }
  }

  // ── Folder tree renderer ──────────────────────────────────────────────────

  const FOLDER_COLORS = [
    '#1D3461','#0D9488','#16A34A','#7C3AED',
    '#DC2626','#EA580C','#D97706','#DB2777','#475569',
  ];
  const FOLDER_ICONS = ['📁','🗂️','📂','📊','📋','📝','📌','⭐','💼','🌍','🔒','📅','✅','🔖','🚨','👥','📈','💡','🎯','🏠'];

  function FolderNode({ folder, depth }: { folder: WFolder; depth: number }) {
    const children = childMap[folder.id] ?? [];
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const count = fileCounts[folder.id] ?? 0;
    const sCfg = SEC_CFG[folder.security_level];
    const SecIcon = sCfg.icon;
    const isFolderLocked = !!folder.password_hash && !unlockedFolderIds.has(folder.id);
    const folderColor = folder.color || '#1D3461';
    const isDragOver = dragOverFolderId === folder.id;

    return (
      <div>
        <div
          className={cn('flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer group transition-all text-sm',
            isSelected ? 'bg-gray-200 dark:bg-[#1D3461] text-gray-900 dark:text-white' : 'text-gray-700 dark:text-foreground hover:bg-gray-200/60 dark:hover:bg-muted/60',
            isDragOver && !isSelected && 'ring-2 ring-offset-1 bg-blue-50')}
          style={{ paddingLeft: `${8 + depth * 14}px`, ['--tw-ring-color']: folderColor } as CSSProperties}
          onClick={() => openFolder(folder)}
          onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverFolderId(folder.id); }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolderId(null); }}
          onDrop={e => { e.preventDefault(); e.stopPropagation(); const fid = e.dataTransfer.getData('fileId'); if (fid) moveFileTo(fid, folder.id); }}
        >
          {children.length > 0 && !isFolderLocked ? (
            <button onClick={e => { e.stopPropagation(); toggleExpand(folder.id); }} className="flex-shrink-0">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : <span className="w-3 flex-shrink-0" />}

          {/* Folder icon — custom emoji or colored folder */}
          {isFolderLocked ? (
            <Lock className={cn('h-3.5 w-3.5 flex-shrink-0', isSelected ? 'text-amber-300' : 'text-amber-500')} />
          ) : folder.icon && /[^\u0000-\u007F]/.test(folder.icon) ? (
            <span className="text-sm flex-shrink-0 leading-none">{folder.icon}</span>
          ) : (
            <span className="h-3.5 w-3.5 rounded flex-shrink-0 flex items-center justify-center" style={{ color: isSelected ? '#fff' : folderColor }}>
              {isExpanded ? <FolderOpen className="h-3.5 w-3.5" /> : <Folder className="h-3.5 w-3.5" />}
            </span>
          )}

          <span className="flex-1 text-xs font-medium truncate">{folder.name.replace(/^folder\s+/i, '').trim()}</span>
          {isDragOver && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-semibold flex-shrink-0">Drop</span>}
          {isFolderLocked && <span className={cn('text-[9px] px-1 rounded-full flex-shrink-0 font-medium', isSelected ? 'bg-amber-500/30 text-amber-200' : 'bg-amber-100 text-amber-700')}>locked</span>}
          <SecIcon className={cn('h-3 w-3 flex-shrink-0 opacity-60', isSelected ? 'text-white' : sCfg.text)} />
          {count > 0 && <span className={cn('text-[9px] px-1 rounded-full flex-shrink-0', isSelected ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>{count}</span>}
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <button className={cn('opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all flex-shrink-0', isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-muted text-muted-foreground')}>
                  <MoreVertical className="h-2.5 w-2.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => { setRenameTarget({ type: 'folder', id: folder.id, currentName: folder.name }); setRenameValue(folder.name); }}>
                  <Edit2 className="h-3.5 w-3.5 mr-2" />Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setCustomColor(folder.color || '#1D3461'); setCustomIcon(folder.icon || ''); setFolderCustomizeTarget({ id: folder.id, name: folder.name, color: folder.color, icon: folder.icon }); }}>
                  <Palette className="h-3.5 w-3.5 mr-2" />Customize Color & Icon
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => duplicateFolder(folder)}>
                  <Folders className="h-3.5 w-3.5 mr-2 text-blue-600" />Duplicate Folder
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setPasswordSetTarget({ id: folder.id, name: folder.name, password_hash: folder.password_hash, isFolder: true }); setNewPasswordValue(''); setConfirmPasswordValue(''); }}>
                  <Key className="h-3.5 w-3.5 mr-2" />{folder.password_hash ? 'Change Password' : 'Set Password'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <SecuritySubMenu current={folder.security_level} onSelect={l => changeFolderSecurity(folder.id, folder.name, l)} />
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600" onClick={async () => {
                  await supabase.from('workspace_folders').delete().eq('id', folder.id);
                  refetchFolders(); refetchFiles();
                  toast({ title: 'Folder deleted' });
                }}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete Folder</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {isExpanded && !isFolderLocked && children.map(child => <FolderNode key={child.id} folder={child} depth={depth + 1} />)}
      </div>
    );
  }

  // ── File open actions helper ───────────────────────────────────────────────

  async function openFileAs(file: WFile, mode: 'browser' | 'google' | 'office' | 'download') {
    if (mode === 'browser') {
      window.open(`/view/${file.short_code || file.id}`, '_blank');
      return;
    }
    const url = file.storage_provider === 'r2'
      ? await r2SignedUrl(file.storage_path).catch(() => null)
      : file.public_url;
    if (!url) return;
    if (mode === 'google') {
      window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(url)}`, '_blank');
    } else if (mode === 'office') {
      window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`, '_blank');
    } else if (mode === 'download') {
      // Generate a signed URL with download flag so the browser always saves the file
      let downloadHref = url;
      if (file.storage_provider === 'r2') {
        downloadHref = await r2SignedUrl(file.storage_path, file.name).catch(() => url);
      } else {
        const { data: signed } = await supabase.storage
          .from('workspace-files')
          .createSignedUrl(file.storage_path, 3600, { download: file.name });
        downloadHref = signed?.signedUrl ?? url;
      }
      const a = document.createElement('a');
      a.href = downloadHref;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function OpenAsSubMenu({ file }: { file: WFile }) {
    if (!file.public_url && file.storage_provider !== 'r2') return null;
    const n = file.name.toLowerCase();
    const mime = file.mime_type || '';
    const isOffice = /\.(docx?|xlsx?|pptx?)$/.test(n);
    const isPDF = n.endsWith('.pdf') || mime.includes('pdf');
    const isSpreadsheet = /\.(xlsx?|csv)$/.test(n);
    const isPresentation = /\.pptx?$/.test(n);
    const canDownload = file.allow_download !== false && !['top_secret', 'restricted'].includes(file.security_level);
    const googleLabel = isSpreadsheet ? 'Google Sheets' : isPresentation ? 'Google Slides' : 'Google Docs';
    const officeLabel = isSpreadsheet ? 'Excel Online' : isPresentation ? 'PowerPoint Online' : 'Word Online';
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="text-xs cursor-pointer">
          <ExternalLink className="h-3.5 w-3.5 mr-2 text-blue-600" />Open As…
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="text-xs min-w-[170px]">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); openFileAs(file, 'browser'); }}>
              <Globe className="h-3.5 w-3.5 mr-2 text-blue-500" />Open in Browser
            </DropdownMenuItem>
            {(isPDF || isOffice) && (
              <DropdownMenuItem onClick={e => { e.stopPropagation(); openFileAs(file, 'google'); }}>
                <span className="h-3.5 w-3.5 mr-2 flex items-center justify-center text-[10px] font-bold" style={{ color: '#4285F4' }}>G</span>
                {googleLabel}
              </DropdownMenuItem>
            )}
            {isOffice && (
              <DropdownMenuItem onClick={e => { e.stopPropagation(); openFileAs(file, 'office'); }}>
                <Building2 className="h-3.5 w-3.5 mr-2" style={{ color: '#D83B01' }} />
                {officeLabel}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {canDownload ? (
              <DropdownMenuItem onClick={e => { e.stopPropagation(); openFileAs(file, 'download'); }}>
                <Download className="h-3.5 w-3.5 mr-2 text-green-600" />Download
              </DropdownMenuItem>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground cursor-not-allowed select-none opacity-60 rounded">
                    <Ban className="h-3.5 w-3.5 text-orange-400" />
                    <span>Download blocked</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs leading-relaxed">
                  <p className="font-semibold mb-1">Downloads are disabled</p>
                  <p>Users can view and share this file, but cannot save it to their device.</p>
                  <p className="mt-1 text-muted-foreground">An admin can re-enable downloads from the file menu (⋮ → Allow Downloads).</p>
                </TooltipContent>
              </Tooltip>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  }

  // ── File card / row renderers ──────────────────────────────────────────────

  function FileRow({ file }: { file: WFile }) {
    const isSelected = selectedFile?.id === file.id;
    const isBulkSelected = selectedFileIds.has(file.id);
    const isLocked = !!file.password_hash && !unlockedIds.has(file.id);
    const isImage = file.mime_type?.startsWith('image/') && file.public_url;
    const ext = (file.extension ?? file.name.split('.').pop() ?? '').toUpperCase().slice(0, 4);
    const mime = file.mime_type ?? '';
    const fext = (file.extension ?? '').toLowerCase();
    const typeColor = mime.startsWith('image/') ? '#a855f7'
      : (mime === 'application/pdf' || fext === 'pdf') ? '#ef4444'
      : (mime.includes('spreadsheet') || mime.includes('excel') || ['xlsx','xls','csv'].includes(fext)) ? '#22c55e'
      : (mime.includes('word') || mime.includes('document') || ['docx','doc'].includes(fext)) ? '#3b82f6'
      : (mime.includes('zip') || mime.includes('compressed') || ['zip','rar','7z','tar','gz'].includes(fext)) ? '#f59e0b'
      : '#64748b';
    const vl = (file.version_label ?? '').toLowerCase();
    const statusLabel = vl.includes('final') ? 'Final'
      : vl.includes('draft') ? 'Draft'
      : vl.includes('review') ? 'Review'
      : file.security_level === 'public' ? 'Active'
      : file.security_level === 'internal' ? 'Internal'
      : file.security_level === 'confidential' ? 'Confidential'
      : 'Restricted';
    const statusCls = statusLabel === 'Final' || statusLabel === 'Active'
      ? 'bg-green-100 text-green-700'
      : statusLabel === 'Draft'
      ? 'bg-yellow-100 text-yellow-700'
      : statusLabel === 'Review' || statusLabel === 'Internal'
      ? 'bg-blue-100 text-blue-700'
      : 'bg-orange-100 text-orange-700';
    return (
      <tr onClick={() => openFile(file)}
        draggable
        onDragStart={e => { e.dataTransfer.setData('fileId', file.id); e.dataTransfer.effectAllowed = 'move'; setDragFileId(file.id); }}
        onDragEnd={() => { setDragFileId(null); setDragOverFolderId(null); }}
        className={cn('group cursor-pointer hover:bg-gray-50 dark:hover:bg-muted/30 transition-colors select-none',
          isSelected && 'bg-blue-50/60 dark:bg-[#1D3461]/5',
          isBulkSelected && 'bg-blue-50 dark:bg-[#1D3461]/8',
          dragFileId === file.id && 'opacity-40')}>
        {/* Name + type badge */}
        <td className="py-3 pr-4">
          <div className="flex items-center gap-3">
            {isImage ? (
              <img src={file.public_url!} alt={file.name} className="h-7 w-7 rounded-md object-cover flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="h-7 w-7 rounded-md flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: typeColor }}>
                {ext.slice(0, 3) || '?'}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-800 dark:text-foreground truncate" title={file.name}>{file.name}</span>
                {file.is_pinned && <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                {isLocked && <Lock className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                {file.password_hash && !isLocked && <LockOpen className="h-3 w-3 text-green-500 flex-shrink-0" />}
                {!file.allow_download && <span title="Downloads disabled"><Ban className="h-3 w-3 text-orange-400 flex-shrink-0" /></span>}
              </div>
              {file.tags.length > 0 && (
                <div className="flex items-center gap-1 mt-0.5">
                  {file.tags.slice(0, 2).map(t => <span key={t} className="text-[9px] bg-gray-100 dark:bg-muted px-1.5 py-0 rounded-full text-gray-500">{t}</span>)}
                </div>
              )}
            </div>
          </div>
        </td>
        {/* Size */}
        <td className="py-3 pr-4 hidden md:table-cell">
          <span className="text-xs text-gray-500 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtSize(file.file_size)}</span>
        </td>
        {/* Modified */}
        <td className="py-3 pr-4 hidden md:table-cell">
          <span className="text-xs text-gray-500 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtRelative(file.updated_at)}</span>
        </td>
        {/* By */}
        <td className="py-3 pr-4 hidden sm:table-cell">
          <span className="text-sm text-gray-500 truncate">{file._uploaderName ?? '—'}</span>
        </td>
        {/* Status */}
        <td className="py-3 hidden sm:table-cell">
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', statusCls)}>{statusLabel}</span>
        </td>
        {/* Actions */}
        <td className="py-3 pr-4">
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
            {(file.allow_download || canManageFile(file)) && !file.password_hash && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={e => { e.stopPropagation(); openFileAs(file, 'download'); }}
                    className="p-1 rounded text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Download</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={e => { e.stopPropagation(); togglePinFile(file); }}
                  className={cn('p-1 rounded transition-colors', file.is_pinned ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50')}>
                  <Star className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{file.is_pinned ? 'Unpin' : 'Pin'}</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <button className="p-1 rounded text-gray-400 hover:text-gray-700 transition-colors">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={() => openFile(file)}><Eye className="h-3.5 w-3.5 mr-2" />View Details</DropdownMenuItem>
              {(!file.password_hash || unlockedIds.has(file.id) || canManageFile(file)) && <OpenAsSubMenu file={file} />}
              {canManageFile(file) && <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setRenameTarget({ type: 'file', id: file.id, currentName: file.name }); setRenameValue(file.name); }}><Edit2 className="h-3.5 w-3.5 mr-2" />Rename</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setMoveTarget(file); setMoveFolderId(file.folder_id ?? '__root__'); }}><ArrowUpDown className="h-3.5 w-3.5 mr-2" />Move to…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={e => { e.stopPropagation(); setPasswordSetTarget({ id: file.id, name: file.name, password_hash: file.password_hash, isFolder: false }); setNewPasswordValue(''); setConfirmPasswordValue(''); }}>
                  <Key className="h-3.5 w-3.5 mr-2" />{file.password_hash ? 'Change Password' : 'Set Password'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShareFileTarget(file)}><Share2 className="h-3.5 w-3.5 mr-2" />Share / Manage Access</DropdownMenuItem>
              </>}
              {(file.public_url || file.storage_provider === 'r2') && !['top_secret','restricted'].includes(file.security_level) && file.allow_download && (!file.password_hash || unlockedIds.has(file.id)) && (
                <DropdownMenuItem onClick={e => { e.stopPropagation(); setQrFile(file); }}>
                  <QrCode className="h-3.5 w-3.5 mr-2 text-[#1D3461]" />Share QR Code
                </DropdownMenuItem>
              )}
              {canManageFile(file) && <>
                <DropdownMenuSeparator />
                <SecuritySubMenu current={file.security_level} onSelect={l => changeFileSecurity(file, l)} />
                <DropdownMenuItem onClick={e => { e.stopPropagation(); toggleDownload(file); }}>
                  {file.allow_download
                    ? <><Ban className="h-3.5 w-3.5 mr-2 text-orange-500" />Block Downloads</>
                    : <><Download className="h-3.5 w-3.5 mr-2 text-green-600" />Allow Downloads</>}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600" onClick={() => deleteFile(file)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
              </>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        </td>
      </tr>
    );
  }

  function FileCard({ file }: { file: WFile }) {
    const Icon = getFileIcon(file.mime_type);
    const isSelected = selectedFile?.id === file.id;
    const isBulkSelected = selectedFileIds.has(file.id);
    const isLocked = !!file.password_hash && !unlockedIds.has(file.id);
    const isImage = file.mime_type?.startsWith('image/') && file.public_url;
    const ext = (file.extension ?? file.name.split('.').pop() ?? '').toUpperCase().slice(0, 6);
    const secCfg = SEC_CFG[file.security_level];
    return (
      <div onClick={() => openFile(file)}
        draggable
        onDragStart={e => { e.dataTransfer.setData('fileId', file.id); e.dataTransfer.effectAllowed = 'move'; setDragFileId(file.id); }}
        onDragEnd={() => { setDragFileId(null); setDragOverFolderId(null); }}
        className={cn('flex flex-col rounded-xl border border-blue-100 dark:border-blue-900 bg-white dark:bg-[#0f1422] cursor-default hover:shadow-md hover:border-[#2865eb]/40 hover:-translate-y-0.5 transition-all ease-[cubic-bezier(0.16,1,0.3,1)] group relative overflow-hidden select-none',
          isSelected ? 'border-[#1D3461] ring-2 ring-[#1D3461]/20' : '',
          isBulkSelected && 'ring-2 ring-[#1D3461] border-[#1D3461]',
          dragFileId === file.id && 'opacity-40')}>

        {/* Thumbnail / icon area */}
        <div className="relative overflow-hidden flex-shrink-0">
          {isImage ? (
            <div className="h-28 bg-muted/20">
              <img src={file.public_url!} alt={file.name} className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).parentElement!.className = 'h-28 bg-muted/20 flex items-center justify-center'; (e.target as HTMLImageElement).replaceWith((() => { const d = document.createElement('div'); d.innerHTML = ''; return d; })()); }} />
            </div>
          ) : (
            <div className="h-20 bg-gradient-to-br from-[#1D3461]/5 to-[#1D3461]/10 flex items-center justify-center">
              <Icon className="h-9 w-9 text-[#1D3461]/60" />
            </div>
          )}
          {/* Checkbox overlay */}
          <button onClick={e => toggleFileSelection(file.id, e)} className="absolute top-1.5 left-1.5 z-10">
            {isBulkSelected
              ? <SquareCheck className="h-4 w-4 text-[#1D3461] bg-white rounded drop-shadow" />
              : <Square className="h-4 w-4 text-white opacity-0 group-hover:opacity-80 drop-shadow" />}
          </button>
          {/* Lock badge */}
          {isLocked && <span className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center"><Lock className="h-3 w-3 text-white" /></span>}
          {/* Extension pill for non-images */}
          {!isImage && ext && (
            <span className="absolute bottom-1.5 left-1.5 text-[9px] font-bold bg-white/80 dark:bg-black/50 text-muted-foreground px-1.5 py-0.5 rounded backdrop-blur-sm">
              {ext}
            </span>
          )}
          {/* Quick actions on hover */}
          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <button className="h-6 w-6 rounded bg-white/80 dark:bg-black/50 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shadow-sm">
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => openFile(file)}><Eye className="h-3.5 w-3.5 mr-2" />View Details</DropdownMenuItem>
                {(!file.password_hash || unlockedIds.has(file.id) || canManageFile(file)) && <OpenAsSubMenu file={file} />}
                {canManageFile(file) && <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setRenameTarget({ type: 'file', id: file.id, currentName: file.name }); setRenameValue(file.name); }}><Edit2 className="h-3.5 w-3.5 mr-2" />Rename</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setMoveTarget(file); setMoveFolderId(file.folder_id ?? '__root__'); }}><ArrowUpDown className="h-3.5 w-3.5 mr-2" />Move to…</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); setPasswordSetTarget({ id: file.id, name: file.name, password_hash: file.password_hash, isFolder: false }); setNewPasswordValue(''); setConfirmPasswordValue(''); }}>
                    <Key className="h-3.5 w-3.5 mr-2" />{file.password_hash ? 'Change Password' : 'Set Password'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setShareFileTarget(file)}><Share2 className="h-3.5 w-3.5 mr-2" />Share / Manage Access</DropdownMenuItem>
                </>}
                {(file.public_url || file.storage_provider === 'r2') && !['top_secret','restricted'].includes(file.security_level) && file.allow_download && (!file.password_hash || unlockedIds.has(file.id)) && (
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); setQrFile(file); }}>
                    <QrCode className="h-3.5 w-3.5 mr-2 text-[#1D3461]" />Share QR Code
                  </DropdownMenuItem>
                )}
                {canManageFile(file) && <>
                  <DropdownMenuSeparator />
                  <SecuritySubMenu current={file.security_level} onSelect={l => changeFileSecurity(file, l)} />
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); toggleDownload(file); }}>
                    {file.allow_download
                      ? <><Ban className="h-3.5 w-3.5 mr-2 text-orange-500" />Block Downloads</>
                      : <><Download className="h-3.5 w-3.5 mr-2 text-green-600" />Allow Downloads</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600" onClick={() => deleteFile(file)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Info area */}
        <div className="flex flex-col px-2.5 py-2 gap-1 flex-1">
          {/* File name */}
          <p className="text-xs font-semibold line-clamp-2 leading-tight text-foreground group-hover:text-[#1D3461] transition-colors" title={file.name}>
            {file.name}
          </p>
          {/* Meta row */}
          <div className="flex items-center gap-1.5 mt-auto">
            <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0', secCfg.bg, secCfg.text)}>
              {secCfg.label}
            </span>
            {file.is_pinned && <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />}
            {file.password_hash && !isLocked && <LockOpen className="h-3 w-3 text-green-500 flex-shrink-0" />}
            {!file.allow_download && <Ban className="h-3 w-3 text-orange-500 flex-shrink-0" />}
          </div>
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] text-muted-foreground">{fmtRelative(file.updated_at)}</span>
            <span className="text-[10px] text-muted-foreground font-medium">{fmtSize(file.file_size)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Summary stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const visibleFiles = allFiles.filter(f => !f.folder_id || !lockedFolderIdSet.has(f.folder_id));
    const totalSize = visibleFiles.reduce((s, f) => s + f.file_size, 0);
    const byLevel: Record<SecurityLevel, number> = { public: 0, internal: 0, confidential: 0, restricted: 0, top_secret: 0 };
    visibleFiles.forEach(f => { byLevel[f.security_level]++; });
    return { total: visibleFiles.length, totalSize, byLevel, pinned: visibleFiles.filter(f => f.is_pinned).length, mine: visibleFiles.filter(f => f.created_by === userId).length, root: visibleFiles.filter(f => !f.folder_id).length };
  }, [allFiles, userId, lockedFolderIdSet]);

  const VIRTUAL_FOLDER_NAMES: Record<string, string> = {
    '__pinned__': 'Pinned Files', '__recent__': 'Recent Files', '__mine__': 'My Files',
    '__task_docs__': 'Task Documents', '__all__': 'All Files', '__trash__': 'Recycle Bin',
  };
  const currentFolderName = selectedFolderId && VIRTUAL_FOLDER_NAMES[selectedFolderId]
    ? VIRTUAL_FOLDER_NAMES[selectedFolderId]
    : selectedFolder?.name ?? 'All Files';
  const totalTaskAttachments = taskDocsRaw.reduce((sum, t) => sum + t.attachments.length, 0);

  // ── Breadcrumb path ────────────────────────────────────────────────────────
  function getBreadcrumbPath(folderId: string | null): WFolder[] {
    if (!folderId || VIRTUAL_FOLDER_NAMES[folderId]) return [];
    const path: WFolder[] = [];
    let current = folders.find(f => f.id === folderId);
    while (current) {
      path.unshift(current);
      current = current.parent_folder_id ? folders.find(f => f.id === current!.parent_folder_id) : undefined;
    }
    return path;
  }
  const breadcrumbs = getBreadcrumbPath(selectedFolderId);

  // Most restrictive security level among ALL ancestor folders — new subfolders cannot go below this
  const ancestorSecFloor: SecurityLevel = useMemo(() => {
    if (!breadcrumbs.length) return 'public';
    return breadcrumbs.reduce<SecurityLevel>((max, f) =>
      CLEARANCE_ORDER[f.security_level] > CLEARANCE_ORDER[max] ? f.security_level : max,
      'public'
    );
  }, [breadcrumbs]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <NavBadgeCountsProvider>
    <WorkspaceAccessGate>
    <TooltipProvider>
      <div className="flex h-screen bg-[#f3f6f9] dark:bg-[#080c16] overflow-hidden">

        {/* ══ Left Sidebar ════════════════════════════════════════════════ */}
        <div className="w-60 flex-shrink-0 border-r border-blue-100 dark:border-blue-900 flex flex-col bg-white dark:bg-[#0f1422] overflow-y-auto">
          {/* Sidebar header — Notion style */}
          <div className="px-4 pt-5 pb-3">
            {/* Back to main app */}
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-foreground mb-3 w-full px-1 py-1 rounded hover:bg-gray-200/60 dark:hover:bg-muted/60 transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Back to app</span>
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center flex-shrink-0">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-semibold text-gray-800 dark:text-foreground truncate flex-1">PACT Workspace</span>
              {isSuperAdmin && (
                <button
                  onClick={() => setAccessManagerOpen(true)}
                  className="flex-shrink-0 p-1 rounded hover:bg-gray-200 text-gray-400 transition-colors"
                  data-testid="btn-workspace-access-manager"
                  title="Manage Access"
                >
                  <Key className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Notion-style nav: Search / Recent / Starred */}
            <button onClick={() => { setSelectedFolderId('__all__'); setTimeout(() => document.querySelector<HTMLInputElement>('[placeholder="Search files…"]')?.focus(), 100); }}
              className={cn('w-full flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-muted rounded px-2 py-1.5 cursor-pointer mb-0.5 transition-colors',
                selectedFolderId === '__all__' && searchQuery ? 'bg-gray-200 dark:bg-[#1D3461] text-gray-900 dark:text-white' : '')}>
              <Search className="w-3.5 h-3.5 flex-shrink-0" /> Search
            </button>
            <button onClick={() => setSelectedFolderId('__recent__')}
              className={cn('w-full flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-muted rounded px-2 py-1.5 cursor-pointer mb-0.5 transition-colors',
                selectedFolderId === '__recent__' ? 'bg-[#2865eb]/10 dark:bg-[#1D3461] text-[#2865eb] dark:text-white font-semibold' : '')}>
              <Clock className="w-3.5 h-3.5 flex-shrink-0" /> Recent
              {Math.min(20, allFiles.length) > 0 && <span className="ml-auto text-[10px] text-gray-400">{Math.min(20, allFiles.length)}</span>}
            </button>
            <button onClick={() => setSelectedFolderId('__pinned__')}
              className={cn('w-full flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-muted rounded px-2 py-1.5 cursor-pointer mb-3 transition-colors',
                selectedFolderId === '__pinned__' ? 'bg-[#2865eb]/10 dark:bg-[#1D3461] text-[#2865eb] dark:text-white font-semibold' : '')}>
              <Star className="w-3.5 h-3.5 flex-shrink-0" /> Starred
              {stats.pinned > 0 && <span className="ml-auto text-[10px] text-gray-400">{stats.pinned}</span>}
            </button>
          </div>

          {/* Folder tree */}
          <div className="p-2 flex-1">
            <div className="flex items-center px-2 mb-1 mt-2">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-muted-foreground uppercase tracking-wider">Folders</p>
            </div>
            {rootFolders.length === 0 ? (
              <p className="text-[11px] text-gray-400 dark:text-muted-foreground text-center py-4 px-2">No folders yet</p>
            ) : (
              rootFolders.map(f => <FolderNode key={f.id} folder={f} depth={0} />)
            )}
          </div>

          {/* Bottom: new folder + clearance */}
          <div className="mt-auto p-3 border-t border-gray-200 space-y-2">
            {isAdmin && (
              <button onClick={() => { setNewFolderSec(ancestorSecFloor); setNewFolderOpen(true); }}
                className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded hover:bg-gray-200/60 dark:hover:bg-muted transition-colors">
                <Plus className="h-3.5 w-3.5" /> New folder
              </button>
            )}
            <div className={cn(
              'flex items-center gap-1.5 rounded-lg px-2 py-1',
              SEC_CFG[effectiveClearance].bg, SEC_CFG[effectiveClearance].border, 'border'
            )}>
              <Shield className={cn('h-3 w-3 shrink-0', SEC_CFG[effectiveClearance].text)} />
              <span className={cn('text-[10px] flex-1', SEC_CFG[effectiveClearance].text)}>Clearance</span>
              <span className={cn('text-[10px] font-bold', SEC_CFG[effectiveClearance].text)}>
                {SEC_CFG[effectiveClearance].label}
              </span>
            </div>
          </div>
        </div>

        {/* ══ Main Content ════════════════════════════════════════════════ */}
        <div
          className={cn('flex-1 flex flex-col min-w-0 overflow-hidden relative', selectedFile ? 'mr-[380px]' : '')}
          onDragEnter={e => {
            if (e.dataTransfer.types.includes('Files')) {
              externalDragCounter.current++;
              setIsExternalDragOver(true);
            }
          }}
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
          onDragLeave={e => {
            if (e.dataTransfer.types.includes('Files')) {
              externalDragCounter.current--;
              if (externalDragCounter.current <= 0) { externalDragCounter.current = 0; setIsExternalDragOver(false); }
            }
          }}
          onDrop={async e => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            externalDragCounter.current = 0;
            setIsExternalDragOver(false);
            const entries = await readDroppedItems(e.dataTransfer);
            if (entries.length > 0) { setPendingDropEntries(entries); setUploadOpen(true); }
          }}
        >
          {/* Navbar — notification bell, user menu, theme toggle */}
          <Navbar />
          {/* Full-area drop overlay */}
          {isExternalDragOver && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#1D3461]/10 backdrop-blur-[2px] border-4 border-dashed border-[#1D3461]/50 rounded-none pointer-events-none">
              <div className="bg-white rounded-3xl shadow-2xl px-10 py-8 flex flex-col items-center gap-3 border border-[#1D3461]/20">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-[#1D3461] to-[#0F2041] flex items-center justify-center">
                  <Upload className="h-8 w-8 text-white" />
                </div>
                <p className="text-lg font-bold text-[#0F2041]">Drop to upload</p>
                <p className="text-sm text-muted-foreground">Release to add files to <span className="font-semibold text-[#1D3461]">{currentFolderName}</span></p>
              </div>
            </div>
          )}
          {/* Breadcrumb bar */}
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 px-5 py-2 border-b bg-muted/20 text-xs flex-shrink-0 flex-wrap">
              <button onClick={() => setSelectedFolderId(null)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                <Home className="h-3 w-3" />Root
              </button>
              {breadcrumbs.map((crumb, idx) => (
                <span key={crumb.id} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-muted-foreground" />
                  {idx === breadcrumbs.length - 1 ? (
                    <span className="font-semibold text-foreground">{crumb.name}</span>
                  ) : (
                    <button onClick={() => setSelectedFolderId(crumb.id)} className="text-muted-foreground hover:text-foreground transition-colors">{crumb.name}</button>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* Active filter chips */}
          {(secFilter !== 'all' || typeFilter !== 'all' || searchQuery.trim()) && (
            <div className="flex items-center gap-2 px-5 py-1.5 border-b bg-muted/20 flex-shrink-0 flex-wrap">
              <span className="text-[10px] text-muted-foreground font-medium">Filters:</span>
              {searchQuery.trim() && (
                <span className="flex items-center gap-1 text-[10px] bg-[#1D3461]/10 text-[#1D3461] border border-[#1D3461]/20 px-2 py-0.5 rounded-full font-medium">
                  <Search className="h-2.5 w-2.5" />"{searchQuery}"
                  <button onClick={() => setSearchQuery('')} className="hover:text-red-600 ml-0.5"><X className="h-2.5 w-2.5" /></button>
                </span>
              )}
              {typeFilter !== 'all' && (
                <span className="flex items-center gap-1 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">
                  {typeFilter === 'image' ? '🖼' : typeFilter === 'pdf' ? '📄' : typeFilter === 'excel' ? '📊' : typeFilter === 'word' ? '📝' : typeFilter === 'zip' ? '📦' : '📁'} {typeFilter}
                  <button onClick={() => setTypeFilter('all')} className="hover:text-red-600 ml-0.5"><X className="h-2.5 w-2.5" /></button>
                </span>
              )}
              {secFilter !== 'all' && (
                <span className="flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full font-medium">
                  <Shield className="h-2.5 w-2.5" />{SEC_CFG[secFilter].label}
                  <button onClick={() => setSecFilter('all')} className="hover:text-red-600 ml-0.5"><X className="h-2.5 w-2.5" /></button>
                </span>
              )}
              <button onClick={() => { setSearchQuery(''); setTypeFilter('all'); setSecFilter('all'); }}
                className="text-[10px] text-muted-foreground hover:text-red-600 ml-auto transition-colors font-medium">
                Clear all
              </button>
            </div>
          )}

          {/* Bulk action bar */}
          {selectedFileIds.size > 0 && (
            <div className="flex items-center gap-2 px-5 py-2 border-b bg-[#1D3461]/5 flex-shrink-0">
              <span className="text-xs font-semibold text-[#1D3461]">{selectedFileIds.size} file{selectedFileIds.size !== 1 ? 's' : ''} selected</span>
              <div className="flex-1" />
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setBulkMoveFolderId('__root__'); setBulkMoveOpen(true); }}>
                <ArrowUpDown className="h-3 w-3" />Move
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={bulkDeleteFiles}>
                <Trash2 className="h-3 w-3" />Delete
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => setSelectedFileIds(new Set())}>
                <X className="h-3 w-3" />Clear
              </Button>
            </div>
          )}

          {/* Masthead */}
          <div className="px-8 pt-6 pb-1 flex-shrink-0">
            <div className="flex items-start justify-between mb-1">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  PACT Workspace
                </p>
                <h1 className="text-[1.75rem] font-bold leading-[1.1] tracking-[-0.03em] text-slate-900 dark:text-foreground" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>
                  {currentFolderName}
                </h1>
                <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  {displayedFiles.length} file{displayedFiles.length !== 1 ? 's' : ''}
                  {displayedFiles.length > 0 && ` / ${fmtSize(displayedFiles.reduce((s, f) => s + f.file_size, 0))}`}
                  {displayedFiles.length > 0 && ` / updated ${fmtRelative(displayedFiles[0]?.updated_at ?? '')}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4 flex-wrap justify-end">
                {isAdmin && selectedFolderId && !['__pinned__', '__recent__', '__mine__', '__trash__', '__task_docs__', '__all__'].includes(selectedFolderId ?? '') && (
                  <button className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#0f1422] border border-blue-100 dark:border-blue-900 rounded-lg px-3 py-1.5 hover:bg-blue-50/60 dark:hover:bg-blue-950/40 active:scale-[0.98] transition-all" onClick={() => setShareFolderTarget(selectedFolder ?? null)}>
                    <Share2 className="h-3 w-3" /> Share
                  </button>
                )}
                <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
                  <SelectTrigger className="h-8 w-28 text-xs bg-white dark:bg-[#0f1422] border-blue-100 dark:border-blue-900 text-slate-600 dark:text-slate-300 gap-1"><Filter className="h-3 w-3 flex-shrink-0" /><SelectValue placeholder="Filter" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Types</SelectItem>
                    <SelectItem value="image" className="text-xs">🖼 Images</SelectItem>
                    <SelectItem value="pdf" className="text-xs">📄 PDF</SelectItem>
                    <SelectItem value="excel" className="text-xs">📊 Excel / CSV</SelectItem>
                    <SelectItem value="word" className="text-xs">📝 Word</SelectItem>
                    <SelectItem value="zip" className="text-xs">📦 Archives</SelectItem>
                    <SelectItem value="other" className="text-xs">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
                  <SelectTrigger className="h-8 w-32 text-xs bg-white dark:bg-[#0f1422] border-blue-100 dark:border-blue-900 text-slate-600 dark:text-slate-300 gap-1"><ArrowUpDown className="h-3 w-3 flex-shrink-0" /><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date" className="text-xs">Date Modified</SelectItem>
                    <SelectItem value="name" className="text-xs">Name</SelectItem>
                    <SelectItem value="size" className="text-xs">Size</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold text-white rounded-lg px-3.5 py-2 bg-gradient-to-br from-sky-600 to-blue-700 shadow-lg shadow-blue-600/25 hover:brightness-110 hover:-translate-y-px active:scale-[0.98] transition-all ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}
                  onClick={() => setUploadOpen(true)}
                >
                  <Upload className="h-3.5 w-3.5" /> Upload
                </button>
              </div>
            </div>
          </div>

          {/* KPI tiles — each reports a number and filters the view; click again to clear */}
          {breadcrumbs.length === 0 && selectedFolderId !== '__trash__' && (
            <div className="px-8 pt-4 pb-1 flex-shrink-0">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { id: '__all__', label: 'All Files', value: stats.total, caption: `${fmtSize(stats.totalSize)} in the workspace`, icon: Folders, from: '#0284c7', to: '#1e40af' },
                  { id: '__pinned__', label: 'Starred', value: stats.pinned, caption: 'pinned for quick access', icon: Star, from: '#d97706', to: '#c2410c' },
                  { id: '__mine__', label: 'My Files', value: stats.mine, caption: 'uploaded by you', icon: User, from: '#059669', to: '#115e59' },
                  { id: '__task_docs__', label: 'Task Documents', value: totalTaskAttachments, caption: `across ${taskDocsRaw.length} task${taskDocsRaw.length !== 1 ? 's' : ''}`, icon: CheckCircle2, from: '#6366f1', to: '#4338ca' },
                ].map(tile => {
                  const TileIcon = tile.icon;
                  const active = selectedFolderId === tile.id;
                  return (
                    <button
                      key={tile.id}
                      onClick={() => setSelectedFolderId(active ? '__all__' : tile.id)}
                      className={cn(
                        'relative overflow-hidden rounded-xl p-4 text-left text-white transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.98] group',
                        active && 'ring-2 ring-white ring-offset-2 ring-offset-[#f3f6f9] dark:ring-offset-[#080c16]'
                      )}
                      style={{ background: `linear-gradient(to bottom right, ${tile.from}, ${tile.to})` }}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-white/90" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>{tile.label}</span>
                        <TileIcon className="h-4 w-4 text-white/80 flex-shrink-0" />
                      </div>
                      <p className="mt-2 text-[1.75rem] leading-none tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{tile.value}</p>
                      <p className="mt-1.5 text-[11px] text-white/75 truncate">{tile.caption}</p>
                      <TileIcon className="absolute -bottom-4 -right-4 h-24 w-24 text-white/10 transition-transform duration-200 group-hover:scale-110 pointer-events-none" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inline search + secondary controls */}
          <div className="flex items-center gap-3 px-8 py-3 flex-shrink-0 flex-wrap">
            <div className="flex items-center gap-2 bg-white dark:bg-[#0f1422] border border-blue-100 dark:border-blue-900 shadow-[0_1px_2px_rgb(15_23_42/0.06)] rounded-lg px-4 py-2 flex-1 max-w-md focus-within:border-[#2865eb]/40 focus-within:ring-[3px] focus-within:ring-[#2865eb]/15 transition-all">
              <Search className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search files…"
                className="bg-transparent border-0 text-sm flex-1 placeholder:text-gray-400 h-auto p-0 focus-visible:ring-0 shadow-none" />
            </div>
            <Select value={secFilter} onValueChange={v => setSecFilter(v as any)}>
              <SelectTrigger className="h-8 w-36 text-xs bg-white dark:bg-[#0f1422] border-blue-100 dark:border-blue-900"><SelectValue placeholder="All Levels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Levels</SelectItem>
                {(Object.entries(SEC_CFG) as [SecurityLevel, any][]).map(([level, cfg]) => (
                  <SelectItem key={level} value={level} className="text-xs">{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center bg-white dark:bg-[#0f1422] border border-blue-100 dark:border-blue-900 rounded-lg p-0.5">
              <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded transition-colors active:scale-[0.98]', viewMode === 'list' ? 'bg-[#2865eb] text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200')}>
                <List className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setViewMode('grid')} className={cn('p-1.5 rounded transition-colors active:scale-[0.98]', viewMode === 'grid' ? 'bg-[#2865eb] text-white' : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200')}>
                <Grid className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* File area */}
          <div className="flex-1 overflow-y-auto">
            {selectedFolderId === '__trash__' ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200">
                  <Trash2 className="h-5 w-5 text-red-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-800 dark:text-red-300">Recycle Bin</p>
                    <p className="text-xs text-red-600 dark:text-red-400">{archivedFiles.length} file{archivedFiles.length !== 1 ? 's' : ''} · {archivedFolders.length} folder{archivedFolders.length !== 1 ? 's' : ''} — restore or permanently delete</p>
                  </div>
                </div>

                {/* Archived folders */}
                {archivedFolders.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Deleted Folders</p>
                    <div className="space-y-2">
                      {archivedFolders.map(folder => (
                        <div key={folder.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/20 transition-colors">
                          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            {folder.icon ? <span className="text-base">{folder.icon}</span> : <Folder className="h-4 w-4 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{folder.name}</p>
                            <p className="text-[11px] text-muted-foreground">{fmtRelative(folder.created_at)} · {SEC_CFG[folder.security_level].label}</p>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => restoreFolder(folder)}>
                            <RotateCcw className="h-3 w-3" />Restore
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Archived files */}
                {archivedFiles.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Deleted Files</p>
                    <div className="space-y-2">
                      {archivedFiles.map(file => {
                        const Icon = getFileIcon(file.mime_type);
                        const isImage = file.mime_type?.startsWith('image/') && file.public_url;
                        return (
                          <div key={file.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/20 transition-colors">
                            <div className="relative h-9 w-9 rounded-xl overflow-hidden flex-shrink-0">
                              {isImage ? (
                                <img src={file.public_url!} alt={file.name} className="h-9 w-9 object-cover" />
                              ) : (
                                <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
                                  <Icon className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <p className="text-[11px] text-muted-foreground">{fmtSize(file.file_size)} · {fmtRelative(file.updated_at)} · by {file._uploaderName}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => restoreFile(file)}>
                                <RotateCcw className="h-3 w-3" />Restore
                              </Button>
                              {(isSuperAdmin || isAdmin) && (
                                <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => permanentlyDeleteFile(file)}>
                                  <Trash2 className="h-3 w-3" />Delete Forever
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {archivedFiles.length === 0 && archivedFolders.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <Trash2 className="h-12 w-12 opacity-20" />
                    <p className="text-sm font-medium">Recycle bin is empty</p>
                    <p className="text-xs">Deleted files and folders will appear here</p>
                  </div>
                )}
              </div>
            ) : selectedFolderId === '__task_docs__' ? (
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-3 p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200">
                  <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Task Documents</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      {isExecutive
                        ? 'Showing all task attachments across the organisation'
                        : 'Showing attachments from tasks you created or are assigned to'}
                      {' · '}{totalTaskAttachments} file{totalTaskAttachments !== 1 ? 's' : ''} across {taskDocsRaw.length} task{taskDocsRaw.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
                {taskDocsRaw.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 opacity-20" />
                    <p className="text-sm font-medium">No task attachments found</p>
                    <p className="text-xs">Attachments added to tasks you participate in will appear here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {taskDocsRaw.map(task => (
                      <div key={task.taskId} className="bg-card border rounded-2xl overflow-hidden shadow-sm">
                        <div className="flex items-center gap-3 px-4 py-3 bg-muted/30 border-b">
                          <div className={cn('h-2 w-2 rounded-full flex-shrink-0',
                            task.status === 'done' || task.status === 'completed' ? 'bg-emerald-500' :
                            task.status === 'inprogress' || task.status === 'in_progress' ? 'bg-amber-500' : 'bg-slate-400'
                          )} />
                          <span className="text-sm font-semibold text-foreground flex-1 truncate">{task.taskTitle}</span>
                          {task.assignedToName && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />{task.assignedToName}
                            </span>
                          )}
                          {task.dueDate && (
                            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />{task.dueDate}
                            </span>
                          )}
                          <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                            task.status === 'done' || task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            task.status === 'inprogress' || task.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          )}>
                            {task.status === 'done' || task.status === 'completed' ? 'Done' :
                             task.status === 'inprogress' || task.status === 'in_progress' ? 'In Progress' : 'To Do'}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{task.attachments.length} file{task.attachments.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="p-3 flex flex-wrap gap-2">
                          {task.attachments.map((att, idx) => {
                            const ext = att.name.split('.').pop()?.toLowerCase() ?? '';
                            const isImg = ['jpg','jpeg','png','gif','webp','svg'].includes(ext);
                            const isPdf = ext === 'pdf';
                            const isDoc = ['doc','docx','xls','xlsx','ppt','pptx'].includes(ext);
                            return (
                              <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-2 rounded-xl border hover:bg-muted/30 hover:shadow-sm transition-all group"
                                data-testid={`task-doc-link-${task.taskId}-${idx}`}
                              >
                                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0',
                                  isImg ? 'bg-green-100 text-green-600' :
                                  isPdf ? 'bg-red-100 text-red-600' :
                                  isDoc ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'
                                )}>
                                  {isImg ? <FileImage className="h-4 w-4" /> :
                                   isPdf ? <FileText className="h-4 w-4" /> :
                                   isDoc ? <FileSpreadsheet className="h-4 w-4" /> : <File className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-foreground truncate max-w-[160px] group-hover:text-[#1D3461]">{att.name}</p>
                                  {att.uploadedAt && <p className="text-[10px] text-muted-foreground">{att.uploadedAt.slice(0, 10)}</p>}
                                </div>
                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : selectedFolder && selectedFolder.password_hash && !unlockedFolderIds.has(selectedFolder.id) ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <div className="h-20 w-20 rounded-3xl bg-amber-50 flex items-center justify-center">
                  <Lock className="h-10 w-10 text-amber-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">Folder is locked</p>
                  <p className="text-xs mt-1">Enter the password to access this folder's files.</p>
                </div>
                <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-1.5" onClick={() => { setPasswordPromptTarget({ id: selectedFolder.id, name: selectedFolder.name, password_hash: selectedFolder.password_hash, isFolder: true }); setPasswordInput(''); setPasswordWrong(false); setShowPromptPwd(false); }}>
                  <LockOpen className="h-3.5 w-3.5" />Unlock Folder
                </Button>
              </div>
            ) : displayedFiles.length === 0 && currentSubFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-muted-foreground px-8">
                {(searchQuery || typeFilter !== 'all' || secFilter !== 'all') ? (
                  <>
                    <div className="h-20 w-20 rounded-3xl bg-muted/30 flex items-center justify-center">
                      <Filter className="h-10 w-10 opacity-30" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-foreground">No files match your filters</p>
                      <p className="text-xs mt-1 text-muted-foreground">Try adjusting or clearing your filters</p>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setSearchQuery(''); setTypeFilter('all'); setSecFilter('all'); }}>
                      <X className="h-3.5 w-3.5" />Clear all filters
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="h-16 w-16 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 flex items-center justify-center">
                      <FolderOpen className="h-8 w-8 text-[#2865eb]" />
                    </div>
                    <div className="text-center">
                      <p className="text-[0.9375rem] font-bold text-slate-900 dark:text-foreground" style={{ fontFamily: "'Manrope', system-ui, sans-serif" }}>
                        {currentFolderName === 'All Files' ? 'Start your workspace' : `"${currentFolderName}" is empty`}
                      </p>
                      <p className="text-xs mt-1.5 text-muted-foreground max-w-[42ch] leading-relaxed">
                        Drag files or whole folders anywhere on this screen — nested folder structures are recreated automatically. Each upload gets a security level so only the right people see it.
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <Button size="sm" className="bg-[#2865eb] hover:bg-[#1e52c9] text-white gap-1.5 shadow-sm active:scale-[0.98]" onClick={() => setUploadOpen(true)}>
                        <Upload className="h-3.5 w-3.5" />Upload Files
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mx-6 mb-6 mt-2 rounded-xl bg-white dark:bg-[#0f1422] border border-blue-100 dark:border-blue-900 shadow-[0_1px_2px_rgb(15_23_42/0.05),0_16px_40px_-24px_rgb(15_23_42/0.3)] pb-4">
                {/* ── Sub-folders (Google Drive–style rows) ────────────── */}
                {currentSubFolders.length > 0 && (
                  <div className="px-6 pt-4 pb-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] mb-1 px-2" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Folders</p>
                    {currentSubFolders.map(sub => {
                      const subFileCount = fileCounts[sub.id] ?? 0;
                      const subChildCount = (childMap[sub.id] ?? []).length;
                      const secCfg = SEC_CFG[sub.security_level];
                      const isLocked = !!sub.password_hash && !unlockedFolderIds.has(sub.id);
                      const folderColor = sub.color || '#1D3461';
                      return (
                        <button
                          key={sub.id}
                          onClick={() => setSelectedFolderId(sub.id)}
                          onDragOver={e => { e.preventDefault(); setDragOverFolderId(sub.id); }}
                          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolderId(null); }}
                          onDrop={e => { e.preventDefault(); const fid = e.dataTransfer.getData('fileId'); if (fid) moveFileTo(fid, sub.id); setDragOverFolderId(null); }}
                          className={cn(
                            'group w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-muted/50 transition-colors text-left',
                            dragOverFolderId === sub.id && 'bg-gray-100 dark:bg-muted/50'
                          )}
                          data-testid={`subfolder-btn-${sub.id}`}
                        >
                          {subChildCount > 0
                            ? <ChevronRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
                            : <span className="w-3 flex-shrink-0" />}
                          {isLocked
                            ? <Lock className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                            : sub.icon && /[^\u0000-\u007F]/.test(sub.icon)
                              ? <span className="text-sm leading-none flex-shrink-0">{sub.icon}</span>
                              : <Folder className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                          <span className="flex-1 text-sm text-gray-700 dark:text-foreground truncate" title={sub.name.replace(/^folder\s+/i, '').trim()}>
                            {sub.name.replace(/^folder\s+/i, '').trim()}
                          </span>
                          <span className="text-xs text-gray-400 flex-shrink-0">
                            {subFileCount > 0 && subFileCount}
                          </span>
                          {dragOverFolderId === sub.id && (
                            <span className="text-[10px] text-[#1D3461] font-semibold flex-shrink-0">Drop</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* ── Files ────────────────────────────────────────────────── */}
                {displayedFiles.length > 0 && (<>
                  {currentSubFolders.length > 0 && (
                    <div className="px-8 pt-2 pb-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>Files</p>
                    </div>
                  )}
                  {viewMode === 'list' ? (
                    <div className="px-6 pt-2">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200">
                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 pr-4">Name</th>
                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 pr-4 hidden md:table-cell">Size</th>
                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 pr-4 hidden md:table-cell">Modified</th>
                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 pr-4 hidden sm:table-cell">By</th>
                            <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 hidden sm:table-cell">Status</th>
                            <th className="pb-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {displayedFiles.map(f => <FileRow key={f.id} file={f} />)}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                      {displayedFiles.map(f => <FileCard key={f.id} file={f} />)}
                    </div>
                  )}
                </>)}

                {/* Empty files state when sub-folders exist */}
                {displayedFiles.length === 0 && currentSubFolders.length > 0 && (
                  <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground border-t border-slate-900/[0.07] dark:border-slate-100/[0.07] mx-6 mt-2">
                    <p className="text-xs">No files directly in this folder</p>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 mt-1" onClick={() => setUploadOpen(true)}>
                      <Upload className="h-3 w-3" />Add files here
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ File Detail Panel ════════════════════════════════════════════ */}
        {selectedFile && (
          <div className="fixed right-0 top-0 h-full w-[380px] border-l shadow-2xl z-30 flex flex-col bg-background">
            <FileDetailPanel
              file={selectedFile} currentUserId={userId}
              onClose={() => setSelectedFile(null)} onRefresh={refetch}
              canManage={canManageFile(selectedFile)}
              isLocked={!!selectedFile.password_hash && !unlockedIds.has(selectedFile.id)}
              openShareSignal={openShareForFileId}
              onShareConsumed={() => setOpenShareForFileId(null)}
            />
          </div>
        )}

        {/* ══ Dialogs ══════════════════════════════════════════════════════ */}

        {/* Upload dialog */}
        <UploadDialog
          folderId={selectedFolder?.id ?? null} folderName={currentFolderName}
          open={uploadOpen} onClose={() => { setUploadOpen(false); setPendingDropEntries([]); }}
          currentUserId={userId} onUploaded={refetch}
          initialEntries={pendingDropEntries.length > 0 ? pendingDropEntries : undefined}
        />

        {/* New folder dialog */}
        <Dialog open={newFolderOpen} onOpenChange={v => !v && setNewFolderOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FolderPlus className="h-4 w-4 text-[#1D3461]" />
                New Folder
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name…" className="text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && createFolder()} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (optional)</label>
                <Input value={newFolderDesc} onChange={e => setNewFolderDesc(e.target.value)} placeholder="What is this folder for?" className="text-xs" />
              </div>
              <div>
                <label className="text-xs font-semibold mb-2 block">Security Level</label>
                {ancestorSecFloor !== 'public' && (
                  <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 mb-2 flex items-center gap-1.5">
                    <Lock className="h-3 w-3 flex-shrink-0" />
                    Floor set by ancestor folder — cannot go below <span className="font-bold">{SEC_CFG[ancestorSecFloor].label}</span>
                  </p>
                )}
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.entries(SEC_CFG) as [SecurityLevel, any][]).map(([level, cfg]) => {
                    const Icon = cfg.icon;
                    const belowFloor = CLEARANCE_ORDER[level as SecurityLevel] < CLEARANCE_ORDER[ancestorSecFloor];
                    return (
                      <button key={level}
                        disabled={belowFloor}
                        onClick={() => !belowFloor && setNewFolderSec(level as SecurityLevel)}
                        title={belowFloor ? `Cannot set below ancestor floor (${SEC_CFG[ancestorSecFloor].label})` : undefined}
                        className={cn('flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] font-semibold transition-all',
                          belowFloor ? 'opacity-30 cursor-not-allowed border-border' :
                          newFolderSec === level ? `${cfg.bg} ${cfg.text} ${cfg.border} border-2` : 'border-border hover:bg-muted/30')}>
                        <Icon className="h-4 w-4" />{cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
              <Button size="sm" className="bg-[#1D3461] hover:bg-[#0F2041]" onClick={createFolder} disabled={!newFolderName.trim()}>
                Create Folder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share folder dialog */}
        {shareFileTarget && (
          <ShareDialog file={shareFileTarget} open={!!shareFileTarget} onClose={() => setShareFileTarget(null)} currentUserId={userId} />
        )}
        {shareFolderTarget && (
          <ShareDialog folder={shareFolderTarget} open={!!shareFolderTarget} onClose={() => setShareFolderTarget(null)} currentUserId={userId} />
        )}

        {/* ── Password Unlock Prompt ────────────────────────────────────── */}
        <Dialog open={!!passwordPromptTarget} onOpenChange={open => { if (!open) { setPasswordPromptTarget(null); setPasswordInput(''); setPasswordWrong(false); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Lock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <DialogTitle className="text-base">Password Required</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{passwordPromptTarget?.name}</p>
                </div>
              </div>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">This {passwordPromptTarget?.isFolder ? 'folder' : 'file'} is password-protected. Enter the password to view it.</p>
            <div className="relative">
              <Input
                type={showPromptPwd ? 'text' : 'password'}
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPasswordWrong(false); }}
                onKeyDown={e => { if (e.key === 'Enter') submitPasswordPrompt(); }}
                placeholder="Enter password…"
                className={passwordWrong ? 'border-red-500 pr-10' : 'pr-10'}
                autoFocus
              />
              <button onClick={() => setShowPromptPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPromptPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordWrong && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Incorrect password. Try again.</p>}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setPasswordPromptTarget(null); setPasswordInput(''); }}>Cancel</Button>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700" onClick={submitPasswordPrompt} disabled={!passwordInput}>
                <LockOpen className="h-3.5 w-3.5 mr-1" />Unlock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Set / Change / Remove Password Dialog ─────────────────────── */}
        <Dialog open={!!passwordSetTarget} onOpenChange={open => { if (!open) { setPasswordSetTarget(null); setNewPasswordValue(''); setConfirmPasswordValue(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <div className="h-10 w-10 rounded-xl bg-[#1D3461]/10 flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="h-5 w-5 text-[#1D3461]" />
                </div>
                <div>
                  <DialogTitle className="text-base">{passwordSetTarget?.password_hash ? 'Change Password' : 'Set Password'}</DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{passwordSetTarget?.name}</p>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">New Password</label>
                <div className="relative">
                  <Input
                    type={showNewPwd ? 'text' : 'password'}
                    value={newPasswordValue}
                    onChange={e => setNewPasswordValue(e.target.value)}
                    placeholder="Enter new password…"
                    className="pr-10"
                    autoFocus
                  />
                  <button onClick={() => setShowNewPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {newPasswordValue && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium">Confirm Password</label>
                  <Input
                    type={showNewPwd ? 'text' : 'password'}
                    value={confirmPasswordValue}
                    onChange={e => setConfirmPasswordValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') savePassword(); }}
                    placeholder="Confirm password…"
                    className={confirmPasswordValue && confirmPasswordValue !== newPasswordValue ? 'border-red-400' : confirmPasswordValue === newPasswordValue && confirmPasswordValue ? 'border-green-400' : ''}
                  />
                  {confirmPasswordValue && confirmPasswordValue !== newPasswordValue && <p className="text-[11px] text-red-500">Passwords do not match</p>}
                  {confirmPasswordValue === newPasswordValue && confirmPasswordValue && <p className="text-[11px] text-green-600 flex items-center gap-1"><Check className="h-3 w-3" />Passwords match</p>}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">The password is required to open this {passwordSetTarget?.isFolder ? 'folder' : 'file'}. Leave blank to save without protection.</p>
            </div>
            <DialogFooter className="gap-2 flex-wrap">
              {passwordSetTarget?.password_hash && (
                <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 mr-auto" onClick={() => { setNewPasswordValue(''); setConfirmPasswordValue(''); savePassword(); }}>
                  <LockOpen className="h-3.5 w-3.5 mr-1" />Remove Password
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { setPasswordSetTarget(null); setNewPasswordValue(''); setConfirmPasswordValue(''); }}>Cancel</Button>
              <Button
                size="sm"
                className="bg-[#1D3461] hover:bg-[#0F2041]"
                onClick={savePassword}
                disabled={pwdSaving || (!!newPasswordValue && newPasswordValue !== confirmPasswordValue)}
              >
                {pwdSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                {newPasswordValue ? 'Save Password' : 'Save (No Password)'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Rename Dialog ──────────────────────────────────────────────── */}
        <Dialog open={!!renameTarget} onOpenChange={open => { if (!open) { setRenameTarget(null); setRenameValue(''); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename {renameTarget?.type === 'file' ? 'File' : 'Folder'}</DialogTitle>
            </DialogHeader>
            <Input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') renameItem(); }}
              placeholder="New name…"
              autoFocus
            />
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setRenameTarget(null); setRenameValue(''); }}>Cancel</Button>
              <Button size="sm" className="bg-[#1D3461] hover:bg-[#0F2041]" onClick={renameItem} disabled={!renameValue.trim() || renaming}>
                {renaming && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Rename
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Move to Folder Dialog ──────────────────────────────────────── */}
        <Dialog open={!!moveTarget} onOpenChange={open => { if (!open) { setMoveTarget(null); setMoveFolderId('__root__'); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Move "{moveTarget?.name}"</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground -mt-2">Select the destination folder</p>
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y text-sm">
              <button
                onClick={() => setMoveFolderId('__root__')}
                className={cn('w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors text-left', moveFolderId === '__root__' ? 'bg-[#1D3461]/10 font-medium' : '')}
              >
                <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1">Root (No folder)</span>
                {moveFolderId === '__root__' && <Check className="h-3.5 w-3.5 text-[#1D3461]" />}
              </button>
              {folders.map(f => {
                const isCurrent = f.id === moveTarget?.folder_id;
                const isChosen = moveFolderId === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => !isCurrent && setMoveFolderId(f.id)}
                    disabled={isCurrent}
                    className={cn('w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors text-left', isChosen ? 'bg-[#1D3461]/10 font-medium' : '', isCurrent ? 'opacity-40 cursor-default' : '')}
                  >
                    <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    {isCurrent && <span className="text-[10px] text-muted-foreground">Current</span>}
                    {isChosen && !isCurrent && <Check className="h-3.5 w-3.5 text-[#1D3461]" />}
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setMoveTarget(null); setMoveFolderId('__root__'); }}>Cancel</Button>
              <Button
                size="sm"
                className="bg-[#1D3461] hover:bg-[#0F2041]"
                onClick={moveFile}
                disabled={moving || (moveTarget?.folder_id === null && moveFolderId === '__root__') || moveTarget?.folder_id === moveFolderId}
              >
                {moving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Move Here
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Bulk Move Dialog ──────────────────────────────────────────── */}
        <Dialog open={bulkMoveOpen} onOpenChange={open => { if (!open) { setBulkMoveOpen(false); setBulkMoveFolderId('__root__'); } }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Move {selectedFileIds.size} File{selectedFileIds.size !== 1 ? 's' : ''}</DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground -mt-2">Select the destination folder</p>
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y text-sm">
              <button onClick={() => setBulkMoveFolderId('__root__')}
                className={cn('w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors text-left', bulkMoveFolderId === '__root__' ? 'bg-[#1D3461]/10 font-medium' : '')}>
                <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1">Root (No folder)</span>
                {bulkMoveFolderId === '__root__' && <Check className="h-3.5 w-3.5 text-[#1D3461]" />}
              </button>
              {folders.map(f => {
                const isChosen = bulkMoveFolderId === f.id;
                return (
                  <button key={f.id} onClick={() => setBulkMoveFolderId(f.id)}
                    className={cn('w-full flex items-center gap-2 p-2.5 hover:bg-muted/50 transition-colors text-left', isChosen ? 'bg-[#1D3461]/10 font-medium' : '')}>
                    <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    {isChosen && <Check className="h-3.5 w-3.5 text-[#1D3461]" />}
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setBulkMoveOpen(false); setBulkMoveFolderId('__root__'); }}>Cancel</Button>
              <Button size="sm" className="bg-[#1D3461] hover:bg-[#0F2041]" onClick={bulkMoveFiles} disabled={bulkMoving}>
                {bulkMoving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Move Here
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Access Manager Dialog — super admin only */}
        {isSuperAdmin && (
          <WorkspaceAccessManager
            open={accessManagerOpen}
            onClose={() => setAccessManagerOpen(false)}
          />
        )}

        {/* ── Folder Customize Dialog ────────────────────────────────────────── */}
        <Dialog open={!!folderCustomizeTarget} onOpenChange={open => { if (!open) setFolderCustomizeTarget(null); }}>
          <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl border-0 shadow-xl">
            <div className="bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-5 py-4 flex items-center gap-3">
              <span className="text-2xl">{customIcon || '📁'}</span>
              <div>
                <p className="text-white font-bold text-sm">{folderCustomizeTarget?.name}</p>
                <p className="text-blue-200 text-[11px]">Choose a color and icon</p>
              </div>
            </div>
            <div className="p-5 space-y-5">
              {/* Color swatches */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Color</p>
                <div className="flex flex-wrap gap-2">
                  {FOLDER_COLORS.map(c => (
                    <button key={c} onClick={() => setCustomColor(c)}
                      className="w-7 h-7 rounded-lg transition-all hover:scale-110"
                      style={{ background: c, outline: customColor === c ? `3px solid ${c}` : '3px solid transparent', outlineOffset: '2px' }}
                    />
                  ))}
                  <label className="w-7 h-7 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-slate-400 transition-colors" title="Custom color">
                    <span className="text-slate-400 text-[10px]">+</span>
                    <input type="color" value={customColor} onChange={e => setCustomColor(e.target.value)} className="sr-only" />
                  </label>
                </div>
              </div>
              {/* Icon picker */}
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Icon</p>
                <div className="flex flex-wrap gap-1.5">
                  {FOLDER_ICONS.map(ic => (
                    <button key={ic} onClick={() => setCustomIcon(customIcon === ic ? '' : ic)}
                      className={cn('w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all hover:scale-110',
                        customIcon === ic ? 'bg-[#1D3461]/15 ring-2 ring-[#1D3461]' : 'bg-slate-50 hover:bg-slate-100')}>
                      {ic}
                    </button>
                  ))}
                  <button onClick={() => setCustomIcon('')}
                    className={cn('w-8 h-8 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all hover:scale-110 text-slate-400',
                      !customIcon ? 'bg-slate-200 ring-2 ring-slate-400' : 'bg-slate-50 hover:bg-slate-100')}>
                    None
                  </button>
                </div>
              </div>
              {/* Preview */}
              <div className="bg-slate-50 rounded-xl p-3 flex items-center gap-2">
                <span className="text-[11px] text-slate-400 font-medium">Preview:</span>
                <span className="text-sm">{customIcon || ''}</span>
                <span className="text-xs font-semibold" style={{ color: customColor }}>{folderCustomizeTarget?.name}</span>
              </div>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setFolderCustomizeTarget(null)}>Cancel</Button>
              <Button size="sm" className="flex-1 bg-[#1D3461] hover:bg-[#0F2041]" onClick={saveFolderCustomize}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── QR Code Modal ──────────────────────────────────────────────────── */}
        <Dialog open={!!qrFile} onOpenChange={open => { if (!open) { setQrFile(null); setShowQrCustomize(false); } }}>
          <DialogContent className="max-w-[600px] w-full p-0 overflow-hidden border-0 shadow-2xl rounded-2xl max-h-[92vh] flex flex-col">
            {qrFile && (() => {
              const viewerUrl = `${window.location.origin}/view/${qrFile.short_code ?? qrFile.id}`;
              const Icon = getFileIcon(qrFile.mime_type);
              const ext   = (qrFile.extension ?? '').toUpperCase();
              const sizeMB = (qrFile.file_size / 1024 / 1024).toFixed(1);

              const PRESETS = [
                { label: 'Navy',    fg: '#0F2041', bg: '#FFFFFF' },
                { label: 'Inverse', fg: '#FFFFFF', bg: '#0F2041' },
                { label: 'Forest',  fg: '#064E3B', bg: '#ECFDF5' },
                { label: 'Amber',   fg: '#78350F', bg: '#FFFBEB' },
                { label: 'Slate',   fg: '#1E293B', bg: '#F1F5F9' },
              ];

              function svgToCanvas(svg: SVGElement, size: number): Promise<HTMLCanvasElement> {
                return new Promise(resolve => {
                  // Clone SVG and strip embedded <image> tags (logo) — they can't
                  // resolve when the SVG is serialized to a blob URL.
                  const cloned = svg.cloneNode(true) as SVGElement;
                  cloned.querySelectorAll('image').forEach(el => el.remove());
                  const svgData = new XMLSerializer().serializeToString(cloned);
                  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const img = new Image();
                  img.onload = () => {
                    const pad = 24;
                    const canvas = document.createElement('canvas');
                    canvas.width = size + pad * 2;
                    canvas.height = size + pad * 2;
                    const ctx = canvas.getContext('2d')!;
                    // Background
                    ctx.fillStyle = qrBgColor;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    // QR code
                    ctx.drawImage(img, pad, pad, size, size);
                    URL.revokeObjectURL(url);
                    // Draw PACT logo in the center on top of the QR
                    const logoImg = new Image();
                    const logoSize = Math.round(size * 0.22);
                    const cx = pad + (size - logoSize) / 2;
                    const cy = pad + (size - logoSize) / 2;
                    logoImg.onload = () => {
                      // White backing square so logo is readable on any QR color
                      const backing = logoSize + 6;
                      ctx.fillStyle = '#FFFFFF';
                      ctx.beginPath();
                      const bx = cx - 3;
                      const by = cy - 3;
                      const r = 6;
                      ctx.moveTo(bx + r, by);
                      ctx.lineTo(bx + backing - r, by);
                      ctx.quadraticCurveTo(bx + backing, by, bx + backing, by + r);
                      ctx.lineTo(bx + backing, by + backing - r);
                      ctx.quadraticCurveTo(bx + backing, by + backing, bx + backing - r, by + backing);
                      ctx.lineTo(bx + r, by + backing);
                      ctx.quadraticCurveTo(bx, by + backing, bx, by + backing - r);
                      ctx.lineTo(bx, by + r);
                      ctx.quadraticCurveTo(bx, by, bx + r, by);
                      ctx.closePath();
                      ctx.fill();
                      ctx.drawImage(logoImg, cx, cy, logoSize, logoSize);
                      resolve(canvas);
                    };
                    logoImg.onerror = () => resolve(canvas); // still resolve without logo
                    logoImg.src = PactLogo;
                  };
                  img.src = url;
                });
              }

              async function copyQRImage() {
                const el = document.getElementById('workspace-qr-svg');
                if (!(el instanceof SVGElement)) return;
                const canvas = await svgToCanvas(el, 300);
                canvas.toBlob(async blob => {
                  if (!blob) return;
                  try {
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    toast({ title: 'QR image copied!', description: 'Paste it anywhere — WhatsApp, email, Slides.' });
                  } catch {
                    toast({ title: 'Copy blocked by browser', description: 'Use "Download PNG" instead.' });
                  }
                }, 'image/png');
              }

              async function downloadQR() {
                const el = document.getElementById('workspace-qr-svg');
                if (!(el instanceof SVGElement)) return;
                const svgEl = el;
                const canvas = await svgToCanvas(svgEl, 600);
                canvas.toBlob(blob => {
                  if (!blob) return;
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `QR_${(qrFile.short_code ?? qrFile.id)}_${qrFile.name.replace(/[^a-z0-9]/gi,'_')}.png`;
                  a.click();
                }, 'image/png');
              }

              function copyLink() {
                navigator.clipboard.writeText(viewerUrl);
                toast({ title: 'Link copied!', description: viewerUrl });
              }

              function printQR() {
                const svgEl = document.getElementById('workspace-qr-svg');
                const win = window.open('', '_blank', 'width=620,height=860');
                if (!win || !svgEl) return;
                const svgStr = new XMLSerializer().serializeToString(svgEl);
                const svgB64 = btoa(unescape(encodeURIComponent(svgStr)));
                const logoUrl = `${window.location.origin}${PactLogo}`;
                const shortCode = qrFile.short_code ?? '';
                const year = new Date().getFullYear();
                win.document.write(`<!DOCTYPE html><html><head>
                  <meta charset="utf-8"/>
                  <title>QR — ${qrFile.name}</title>
                  <style>
                    *{box-sizing:border-box;margin:0;padding:0}
                    @page{size:A5 portrait;margin:0}
                    body{font-family:system-ui,-apple-system,sans-serif;background:#f0f4f8;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
                    .card{background:#fff;width:100%;max-width:400px;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(15,32,65,.18)}
                    /* ── Header ── */
                    .hdr{background:linear-gradient(135deg,#0F2041 0%,#1D3461 100%);padding:22px 28px 20px;display:flex;align-items:center;gap:14px}
                    .hdr img{width:44px;height:44px;object-fit:contain;border-radius:10px;background:rgba(255,255,255,.12);padding:6px}
                    .hdr-text{}
                    .hdr-title{color:#fff;font-size:16px;font-weight:700;letter-spacing:.01em}
                    .hdr-sub{color:rgba(147,197,253,.75);font-size:10px;margin-top:2px;letter-spacing:.04em;text-transform:uppercase}
                    /* ── QR area ── */
                    .qr-wrap{padding:28px 28px 0;display:flex;flex-direction:column;align-items:center;gap:10px}
                    .qr-card{background:${qrBgColor};border-radius:16px;padding:20px;box-shadow:0 2px 16px rgba(15,32,65,.10);border:1px solid rgba(15,32,65,.07)}
                    .qr-card img{width:260px;height:260px;display:block;border-radius:4px}
                    .scan-hint{font-size:11px;color:#6b7280;text-align:center;letter-spacing:.01em}
                    /* ── File info ── */
                    .info{margin:20px 28px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:4px}
                    .info-name{font-size:13px;font-weight:700;color:#0F2041;word-break:break-word;line-height:1.3}
                    .info-meta{font-size:11px;color:#64748b;display:flex;align-items:center;gap:6px}
                    .badge{background:#e0e7ef;color:#1D3461;font-size:9px;font-weight:700;padding:2px 7px;border-radius:99px;letter-spacing:.05em}
                    /* ── URL chip ── */
                    .url-wrap{margin:14px 28px 0;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:8px}
                    .url-icon{width:16px;height:16px;flex-shrink:0;opacity:.45}
                    .url-text{font-size:8.5px;color:#475569;word-break:break-all;font-family:monospace;line-height:1.4}
                    /* ── Short code pill ── */
                    .code-pill{display:inline-flex;align-items:center;gap:6px;background:#e0e7ef;border-radius:99px;padding:4px 12px;margin:10px auto 0}
                    .code-label{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
                    .code-val{font-size:12px;font-weight:800;color:#0F2041;letter-spacing:.12em;font-family:monospace}
                    /* ── Footer ── */
                    .footer{margin:20px 0 0;padding:16px 28px;background:linear-gradient(135deg,#0F2041,#1D3461);display:flex;align-items:center;justify-content:space-between}
                    .footer-brand{color:rgba(255,255,255,.9);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
                    .footer-year{color:rgba(147,197,253,.5);font-size:9px}
                    @media print{body{background:#fff;padding:0}.card{box-shadow:none;border-radius:0;max-width:100%}}
                  </style></head><body>
                  <div class="card">
                    <div class="hdr">
                      <img src="${logoUrl}" alt="PACT" onerror="this.style.display='none'"/>
                      <div class="hdr-text">
                        <div class="hdr-title">PACT Command Center</div>
                        <div class="hdr-sub">Workspace File · Secure Share</div>
                      </div>
                    </div>
                    <div class="qr-wrap">
                      <div class="qr-card">
                        <img src="data:image/svg+xml;base64,${svgB64}" alt="QR Code"/>
                      </div>
                      <p class="scan-hint">Point your phone camera to open instantly — no login needed</p>
                    </div>
                    <div class="info">
                      <div class="info-name">${qrFile.name}</div>
                      <div class="info-meta">
                        <span class="badge">${ext}</span>
                        <span>${sizeMB} MB</span>
                      </div>
                    </div>
                    <div class="url-wrap">
                      <svg class="url-icon" viewBox="0 0 24 24" fill="none" stroke="#0F2041" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                      <div class="url-text">${viewerUrl}</div>
                    </div>
                    ${shortCode ? `<div style="display:flex;justify-content:center"><div class="code-pill"><span class="code-label">Code</span><span class="code-val">${shortCode}</span></div></div>` : ''}
                    <div class="footer">
                      <span class="footer-brand">PACT Command Center</span>
                      <span class="footer-year">&copy; ${year} PACT Consultancy</span>
                    </div>
                  </div>
                  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),800);}<\/script>
                  </body></html>`);
                win.document.close();
              }

              return (
                <div className="flex flex-col min-h-0 overflow-hidden">
                  {/* ── Header (fixed, never scrolls) ───────────────────────── */}
                  <div className="px-6 pt-6 pb-5 flex flex-col gap-4 shrink-0" style={{ background: 'linear-gradient(150deg,#0F2041 0%,#1D3461 100%)' }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center">
                          <QrCode className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold leading-none">Share via QR Code</p>
                          <p className="text-blue-300/60 text-[10px] mt-0.5">Scannable · No login required</p>
                        </div>
                      </div>
                      <button onClick={() => { setQrFile(null); setShowQrCustomize(false); }}
                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/60 hover:text-white transition-all">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 bg-white/[0.07] border border-white/10 rounded-xl px-3.5 py-3">
                      <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-blue-200" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-[13px] font-semibold truncate">{qrFile.name}</p>
                        <p className="text-blue-300/55 text-[11px]">{ext} · {sizeMB} MB</p>
                      </div>
                      <a href={viewerUrl} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-blue-300 hover:text-white transition-all" title="Open in browser">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* ── White body (scrollable) ─────────────────────────────── */}
                  <div className="bg-white px-5 pb-5 pt-4 flex flex-col items-center gap-3 overflow-y-auto flex-1 min-h-0">

                    {/* QR Code + inline theme row */}
                    <div className="w-full flex gap-4 items-start">

                      {/* QR */}
                      <div className="relative shrink-0">
                        <div className="absolute inset-0 rounded-xl blur-xl scale-110 opacity-15 pointer-events-none"
                          style={{ background: qrFgColor }} />
                        <div className="relative rounded-xl p-3.5 shadow-md border border-slate-100" style={{ background: qrBgColor }}>
                          <QRCodeSVG
                            id="workspace-qr-svg"
                            value={viewerUrl}
                            size={220}
                            level="H"
                            includeMargin={false}
                            fgColor={qrFgColor}
                            bgColor={qrBgColor}
                            imageSettings={{
                              src: PactLogo,
                              height: 38,
                              width: 38,
                              excavate: true,
                            }}
                          />
                        </div>
                      </div>

                      {/* Right panel: themes + custom pickers */}
                      <div className="flex-1 flex flex-col gap-2.5 min-w-0 pt-0.5">
                        <div className="flex items-center gap-1.5">
                          <Palette className="h-3 w-3 text-[#1D3461]" />
                          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Theme</span>
                        </div>

                        {/* Preset swatches — flex-wrap so all 5 always visible */}
                        <div className="flex flex-wrap gap-1.5">
                          {PRESETS.map(p => {
                            const active = qrFgColor === p.fg && qrBgColor === p.bg;
                            return (
                              <button
                                key={p.label}
                                title={p.label}
                                onClick={() => { setQrFgColor(p.fg); setQrBgColor(p.bg); }}
                                className="flex flex-col items-center gap-0.5"
                              >
                                <div
                                  className="w-8 h-8 rounded-lg transition-all"
                                  style={{
                                    background: `linear-gradient(135deg, ${p.fg} 50%, ${p.bg} 50%)`,
                                    outline: active ? `2px solid ${p.fg}` : '2px solid transparent',
                                    outlineOffset: '2px',
                                  }}
                                />
                                <span className="text-[8px] text-slate-400 font-medium leading-none">{p.label}</span>
                              </button>
                            );
                          })}
                        </div>

                        {/* Custom color pickers — always visible */}
                        <div className="flex flex-col gap-1.5">
                          <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-slate-100 transition-all">
                            <input
                              type="color"
                              value={qrFgColor}
                              onChange={e => setQrFgColor(e.target.value)}
                              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-[9px] font-semibold text-slate-400 leading-none">QR Color</p>
                              <p className="text-[11px] font-mono text-slate-700 uppercase mt-0.5">{qrFgColor}</p>
                            </div>
                          </label>
                          <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-slate-100 transition-all">
                            <input
                              type="color"
                              value={qrBgColor}
                              onChange={e => setQrBgColor(e.target.value)}
                              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-[9px] font-semibold text-slate-400 leading-none">Background</p>
                              <p className="text-[11px] font-mono text-slate-700 uppercase mt-0.5">{qrBgColor}</p>
                            </div>
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Short URL bar */}
                    <div className="w-full flex items-center gap-0 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 flex-1 px-3 py-2 min-w-0">
                        <Link className="h-3 w-3 text-slate-400 shrink-0" />
                        <span className="text-[11px] text-slate-600 truncate font-mono font-medium">{viewerUrl}</span>
                      </div>
                      <button onClick={copyLink}
                        className="px-3 py-2 text-[11px] font-semibold text-[#1D3461] hover:bg-slate-100 border-l border-slate-200 shrink-0 flex items-center gap-1 transition-all">
                        <Copy className="h-3 w-3" />Copy
                      </button>
                    </div>

                    {/* Action buttons — 2×2 grid */}
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <button onClick={copyQRImage}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-semibold border border-slate-200 transition-all active:scale-[.98]">
                        <Copy className="h-3.5 w-3.5" />Copy Image
                      </button>
                      <button onClick={downloadQR}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-semibold border border-slate-200 transition-all active:scale-[.98]">
                        <ImageDown className="h-3.5 w-3.5" />Download
                      </button>
                      <button onClick={copyLink}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[12px] font-semibold border border-slate-200 transition-all active:scale-[.98]">
                        <Link className="h-3.5 w-3.5" />Copy Link
                      </button>
                      <button onClick={printQR}
                        className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-semibold transition-all active:scale-[.98] text-white shadow-sm hover:shadow-md"
                        style={{ background: 'linear-gradient(135deg,#0F2041,#1D3461)' }}>
                        <Printer className="h-3.5 w-3.5" />Print / PDF
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

      </div>
    </TooltipProvider>
    </WorkspaceAccessGate>
    </NavBadgeCountsProvider>
  );
}
