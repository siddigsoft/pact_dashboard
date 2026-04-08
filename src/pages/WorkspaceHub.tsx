import { useState, useRef, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isValid, formatDistanceToNow, isBefore } from 'date-fns';
import {
  Folder, FolderOpen, FolderPlus, FileText, Upload, Search, MoreVertical,
  Download, Trash2, Share2, Eye, MessageSquare, Clock, Shield, Lock, LockOpen,
  Users, ChevronRight, ChevronDown, X, Plus, Edit2, AlertTriangle,
  CheckCircle2, Star, StarOff, Grid, List, Filter, Tag, Link,
  Globe, Building2, User, UserCheck, UserX, Calendar, ArrowUpDown,
  File, FileImage, FileVideo, FileArchive, FileSpreadsheet,
  Activity, History, RefreshCw, Loader2, Send, Check,
  EyeOff, Key, Copy, ExternalLink, Info, ShieldCheck, QrCode, Printer, Palette, ImageDown, ChevronUp,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import PactLogo from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
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
  mime_type: string | null; extension: string | null;
  security_level: SecurityLevel; version: number; version_label: string | null;
  tags: string[]; created_by: string | null; last_modified_by: string | null;
  is_pinned: boolean; expires_at: string | null;
  download_count: number; view_count: number; archived: boolean;
  created_at: string; updated_at: string;
  password_hash: string | null;
  short_code: string | null;
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
        await supabase.from('notifications').insert({
          event_type: 'workspace_share',
          entity_type: isFile ? 'workspace_file' : 'workspace_folder',
          entity_id: targetId,
          recipient_id: granteeId,
          triggered_by: currentUserId,
          title_en: `You have been given access to "${targetName}"`,
          title_ar: `تم منحك الوصول إلى "${targetName}"`,
          message_en: `You have been granted ${ACCESS_CFG[accessLevel].label} access to the ${isFile ? 'file' : 'folder'} "${targetName}" in the Workspace Hub.`,
          message_ar: `تم منحك صلاحية ${ACCESS_CFG[accessLevel].label} على ${isFile ? 'الملف' : 'المجلد'} "${targetName}" في مركز مساحة العمل.`,
          priority: 'medium',
          action_url: '/workspace',
        }).then(({ error: ne }) => { if (ne) console.warn('[Workspace] notification insert failed:', ne.message); });
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setAdding(false); }
  }

  async function revokePermission(id: string) {
    await supabase.from('workspace_permissions').delete().eq('id', id);
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
                  <Select value={granteeId} onValueChange={setGranteeId}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select user…" /></SelectTrigger>
                    <SelectContent>
                      {profiles.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.full_name ?? p.id.slice(0, 8)} {p.role && <span className="text-muted-foreground">({p.role})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

// ─── Upload dialog ─────────────────────────────────────────────────────────────

function UploadDialog({ folderId, folderName, open, onClose, currentUserId, onUploaded }: {
  folderId: string | null; folderName: string; open: boolean; onClose: () => void;
  currentUserId: string; onUploaded: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [secLevel, setSecLevel] = useState<SecurityLevel>('internal');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true); setProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `${currentUserId}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const { error: uploadErr } = await supabase.storage.from('workspace-files').upload(path, f, { upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from('workspace-files').getPublicUrl(path);
        const ext = f.name.split('.').pop()?.toLowerCase() ?? null;
        const { error: dbErr } = await supabase.from('workspace_files').insert({
          folder_id: folderId, name: f.name, description: description || null,
          storage_path: path, public_url: urlData?.publicUrl ?? null,
          file_size: f.size, mime_type: f.type, extension: ext,
          security_level: secLevel, created_by: currentUserId, last_modified_by: currentUserId,
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        });
        if (dbErr) throw dbErr;
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      toast({ title: `${files.length} file${files.length > 1 ? 's' : ''} uploaded`, description: `Security: ${SEC_CFG[secLevel].label}` });
      onUploaded(); onClose(); setFiles([]); setDescription(''); setTags('');
    } catch (e: any) {
      toast({ title: 'Upload failed', description: e.message, variant: 'destructive' });
    } finally { setUploading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-[#1D3461]" />
            Upload Files
          </DialogTitle>
          <p className="text-xs text-muted-foreground">to {folderName || 'Root'}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-[#1D3461]/30 hover:border-[#1D3461]/60 rounded-2xl p-8 text-center cursor-pointer transition-colors"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); setFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]); }}
          >
            <Upload className="h-8 w-8 text-[#1D3461]/40 mx-auto mb-2" />
            <p className="text-sm font-medium text-[#1D3461]">Click or drag files here</p>
            <p className="text-xs text-muted-foreground mt-1">PDF, Word, Excel, PowerPoint, Images, ZIP — up to 50 MB</p>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])} />
          </div>

          {files.length > 0 && (
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {files.map((f, i) => {
                const Icon = getFileIcon(f.type);
                return (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtSize(f.size)}</span>
                    <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Security level */}
          <div>
            <label className="text-xs font-semibold mb-2 block">Security Level</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.entries(SEC_CFG) as [SecurityLevel, any][]).map(([level, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button key={level} onClick={() => setSecLevel(level)}
                    className={cn('flex flex-col items-center gap-1 p-2 rounded-xl border text-center transition-all text-[10px] font-semibold',
                      secLevel === level ? `${cfg.bg} ${cfg.text} ${cfg.border} border-2` : 'border-border hover:bg-muted/30')}>
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">{SEC_CFG[secLevel].desc}</p>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block">Description (optional)</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief description…" className="text-xs min-h-[60px]" />
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block">Tags (comma-separated)</label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="report, finance, Q1…" className="h-8 text-xs" />
          </div>

          {uploading && (
            <div>
              <Progress value={progress} className="h-2" />
              <p className="text-[11px] text-muted-foreground mt-1 text-center">Uploading… {progress}%</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button size="sm" className="bg-[#1D3461] hover:bg-[#0F2041]" onClick={handleUpload} disabled={uploading || files.length === 0}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            Upload {files.length > 0 ? files.length : ''} File{files.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── File detail panel ────────────────────────────────────────────────────────

function FileDetailPanel({ file, currentUserId, onClose, onRefresh }: {
  file: WFile; currentUserId: string; onClose: () => void; onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('info');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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
          await supabase.from('notifications').insert(
            mentioned.map(p => ({
              user_id: p.id,
              title: 'You were mentioned in a file comment',
              message: `Someone mentioned you in a comment on "${file.name}": ${content.substring(0, 100)}`,
              type: 'mention',
              link: '/workspace',
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
      const { data, error } = await supabase.storage.from('workspace-files').download(file.storage_path);
      if (error || !data) throw error ?? new Error('Download failed');
      const url = URL.createObjectURL(data);
      const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
      await supabase.from('workspace_files').update({ download_count: (file.download_count ?? 0) + 1 }).eq('id', file.id);
      await supabase.from('workspace_activity').insert({ file_id: file.id, user_id: currentUserId, action: 'downloaded', metadata: {} });
      onRefresh();
    } catch (e: any) { toast({ title: 'Download failed', description: e.message, variant: 'destructive' }); }
  }

  async function togglePin() {
    await supabase.from('workspace_files').update({ is_pinned: !file.is_pinned }).eq('id', file.id);
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

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-muted/20">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={downloadFile}>
          <Download className="h-3 w-3" />Download
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShareOpen(true)}>
          <Share2 className="h-3 w-3" />Share
        </Button>
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
        <TabsContent value="versions" className="flex-1 overflow-y-auto p-4 mt-0">
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-8 w-8 opacity-30 mx-auto mb-2" />
            <p className="text-xs">Current version: v{file.version}</p>
            {versions.length === 0 && <p className="text-[11px] mt-1 opacity-70">No previous versions</p>}
          </div>
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

export default function WorkspaceHub() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'Admin']);
  const isSuperAdmin = hasAnyRole(['super_admin']);

  const userId = currentUser?.id ?? '';

  const [accessManagerOpen, setAccessManagerOpen] = useState(false);

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<WFile | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [secFilter, setSecFilter] = useState<SecurityLevel | 'all'>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderSec, setNewFolderSec] = useState<SecurityLevel>('internal');
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
    queryKey: ['workspace_folders'],
    queryFn: async () => {
      const { data } = await supabase.from('workspace_folders').select('*').eq('archived', false).order('name');
      return (data ?? []) as WFolder[];
    },
    staleTime: 60_000,
  });

  const { data: allFiles = [], refetch: refetchFiles } = useQuery<WFile[]>({
    queryKey: ['workspace_files'],
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
    staleTime: 60_000,
  });

  const refetch = useCallback(() => { refetchFolders(); refetchFiles(); }, [refetchFolders, refetchFiles]);

  // ── Folder tree helpers ───────────────────────────────────────────────────

  const rootFolders = folders.filter(f => !f.parent_folder_id);
  const childMap = useMemo(() => {
    const m: Record<string, WFolder[]> = {};
    folders.forEach(f => { if (f.parent_folder_id) { if (!m[f.parent_folder_id]) m[f.parent_folder_id] = []; m[f.parent_folder_id].push(f); } });
    return m;
  }, [folders]);

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
    if (selectedFolderId === '__pinned__') files = files.filter(f => f.is_pinned);
    else if (selectedFolderId === '__recent__') files = [...files].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20);
    else if (selectedFolderId === '__mine__') files = files.filter(f => f.created_by === userId);
    else if (selectedFolderId) files = files.filter(f => f.folder_id === selectedFolderId);
    // Hide files that belong to locked folders
    files = files.filter(f => !f.folder_id || !lockedFolderIdSet.has(f.folder_id));
    if (secFilter !== 'all') files = files.filter(f => f.security_level === secFilter);
    if (searchQuery.trim()) { const q = searchQuery.toLowerCase(); files = files.filter(f => f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q) || f.tags.some(t => t.toLowerCase().includes(q))); }
    return [...files].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.file_size - a.file_size;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }, [allFiles, selectedFolderId, secFilter, searchQuery, sortBy, userId, lockedFolderIdSet]);

  // ── Folder actions ────────────────────────────────────────────────────────

  const selectedFolder = selectedFolderId ? folders.find(f => f.id === selectedFolderId) : null;

  async function createFolder() {
    if (!newFolderName.trim()) return;
    const { error } = await supabase.from('workspace_folders').insert({
      name: newFolderName.trim(), security_level: newFolderSec, created_by: userId,
      parent_folder_id: selectedFolder?.id ?? null,
    });
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    refetchFolders(); setNewFolderOpen(false); setNewFolderName(''); setNewFolderSec('internal');
    toast({ title: 'Folder created' });
  }

  async function deleteFile(file: WFile) {
    await supabase.storage.from('workspace-files').remove([file.storage_path]);
    await supabase.from('workspace_files').update({ archived: true }).eq('id', file.id);
    await supabase.from('workspace_activity').insert({ file_id: file.id, user_id: userId, action: 'deleted', metadata: {} });
    if (selectedFile?.id === file.id) setSelectedFile(null);
    refetchFiles();
    toast({ title: 'File removed' });
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

  function FolderNode({ folder, depth }: { folder: WFolder; depth: number }) {
    const children = childMap[folder.id] ?? [];
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const count = fileCounts[folder.id] ?? 0;
    const sCfg = SEC_CFG[folder.security_level];
    const SecIcon = sCfg.icon;
    const isFolderLocked = !!folder.password_hash && !unlockedFolderIds.has(folder.id);

    return (
      <div>
        <div
          className={cn('flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer group transition-colors text-sm',
            isSelected ? 'bg-[#1D3461] text-white' : 'hover:bg-muted/60')}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => openFolder(folder)}
        >
          {children.length > 0 && !isFolderLocked ? (
            <button onClick={e => { e.stopPropagation(); toggleExpand(folder.id); }} className="flex-shrink-0">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          ) : <span className="w-3 flex-shrink-0" />}
          {isFolderLocked
            ? <Lock className={cn('h-3.5 w-3.5 flex-shrink-0', isSelected ? 'text-amber-300' : 'text-amber-500')} />
            : isExpanded ? <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" /> : <Folder className="h-3.5 w-3.5 flex-shrink-0" />
          }
          <span className="flex-1 text-xs font-medium truncate">{folder.name}</span>
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
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setPasswordSetTarget({ id: folder.id, name: folder.name, password_hash: folder.password_hash, isFolder: true }); setNewPasswordValue(''); setConfirmPasswordValue(''); }}>
                  <Key className="h-3.5 w-3.5 mr-2" />{folder.password_hash ? 'Change Password' : 'Set Password'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {isExpanded && !isFolderLocked && children.map(child => <FolderNode key={child.id} folder={child} depth={depth + 1} />)}
      </div>
    );
  }

  // ── File open actions helper ───────────────────────────────────────────────

  function openFileAs(file: WFile, mode: 'browser' | 'google' | 'office' | 'download') {
    const url = file.public_url;
    if (!url) return;
    if (mode === 'browser') {
      window.open(`/view/${file.short_code || file.id}`, '_blank');
    } else if (mode === 'google') {
      window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(url)}`, '_blank');
    } else if (mode === 'office') {
      window.open(`https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`, '_blank');
    } else if (mode === 'download') {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function OpenAsSubMenu({ file }: { file: WFile }) {
    if (!file.public_url) return null;
    const n = file.name.toLowerCase();
    const mime = file.mime_type || '';
    const isOffice = /\.(docx?|xlsx?|pptx?)$/.test(n);
    const isPDF = n.endsWith('.pdf') || mime.includes('pdf');
    const isSpreadsheet = /\.(xlsx?|csv)$/.test(n);
    const isPresentation = /\.pptx?$/.test(n);
    const canDownload = !['top_secret', 'restricted'].includes(file.security_level);
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
            {canDownload && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={e => { e.stopPropagation(); openFileAs(file, 'download'); }}>
                  <Download className="h-3.5 w-3.5 mr-2 text-green-600" />Download
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  }

  // ── File card / row renderers ──────────────────────────────────────────────

  function FileRow({ file }: { file: WFile }) {
    const Icon = getFileIcon(file.mime_type);
    const isSelected = selectedFile?.id === file.id;
    const isLocked = !!file.password_hash && !unlockedIds.has(file.id);
    return (
      <div onClick={() => openFile(file)}
        className={cn('flex items-center gap-3 px-4 py-3 border-b last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors group',
          isSelected && 'bg-[#1D3461]/5')}>
        <div className="relative h-9 w-9 rounded-xl bg-[#1D3461]/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-5 w-5 text-[#1D3461]" />
          {isLocked && <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-amber-500 flex items-center justify-center"><Lock className="h-2.5 w-2.5 text-white" /></span>}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{file.name}</p>
            {file.is_pinned && <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />}
            {file.password_hash && !isLocked && <LockOpen className="h-3 w-3 text-green-500 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <SecBadge level={file.security_level} size="xs" />
            <span className="text-[10px] text-muted-foreground">{fmtSize(file.file_size)}</span>
            {file.tags.slice(0, 2).map(t => <span key={t} className="text-[9px] bg-muted px-1.5 py-0 rounded-full">{t}</span>)}
          </div>
        </div>
        <div className="hidden sm:flex flex-col items-end text-right">
          <span className="text-xs text-muted-foreground">{fmtRelative(file.updated_at)}</span>
          <span className="text-[10px] text-muted-foreground">{file._uploaderName}</span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <button className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all">
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => openFile(file)}><Eye className="h-3.5 w-3.5 mr-2" />View Details</DropdownMenuItem>
            <OpenAsSubMenu file={file} />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setRenameTarget({ type: 'file', id: file.id, currentName: file.name }); setRenameValue(file.name); }}><Edit2 className="h-3.5 w-3.5 mr-2" />Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setMoveTarget(file); setMoveFolderId(file.folder_id ?? '__root__'); }}><ArrowUpDown className="h-3.5 w-3.5 mr-2" />Move to…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={e => { e.stopPropagation(); setPasswordSetTarget({ id: file.id, name: file.name, password_hash: file.password_hash, isFolder: false }); setNewPasswordValue(''); setConfirmPasswordValue(''); }}>
              <Key className="h-3.5 w-3.5 mr-2" />{file.password_hash ? 'Change Password' : 'Set Password'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShareFolderTarget(null)}><Share2 className="h-3.5 w-3.5 mr-2" />Share</DropdownMenuItem>
            {file.public_url && !['top_secret','restricted'].includes(file.security_level) && (
              <DropdownMenuItem onClick={e => { e.stopPropagation(); setQrFile(file); }}>
                <QrCode className="h-3.5 w-3.5 mr-2 text-[#1D3461]" />Share QR Code
              </DropdownMenuItem>
            )}
            {isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem className="text-red-600" onClick={() => deleteFile(file)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  function FileCard({ file }: { file: WFile }) {
    const Icon = getFileIcon(file.mime_type);
    const isSelected = selectedFile?.id === file.id;
    const isLocked = !!file.password_hash && !unlockedIds.has(file.id);
    return (
      <div onClick={() => openFile(file)}
        className={cn('flex flex-col rounded-2xl border cursor-pointer hover:shadow-md transition-all p-3 group relative',
          isSelected ? 'border-[#1D3461] ring-2 ring-[#1D3461]/20' : 'hover:border-[#1D3461]/40')}>
        <div className="flex items-start justify-between mb-3">
          <div className="relative h-12 w-12 rounded-xl bg-[#1D3461]/10 flex items-center justify-center flex-shrink-0">
            <Icon className="h-6 w-6 text-[#1D3461]" />
            {isLocked && <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center"><Lock className="h-3 w-3 text-white" /></span>}
          </div>
          <div className="flex items-center gap-1">
            {file.is_pinned && <Star className="h-3.5 w-3.5 text-amber-500" />}
            {file.password_hash && !isLocked && <LockOpen className="h-3.5 w-3.5 text-green-500" />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                <button className="p-1 rounded text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all">
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => openFile(file)}><Eye className="h-3.5 w-3.5 mr-2" />View Details</DropdownMenuItem>
                <OpenAsSubMenu file={file} />
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { setRenameTarget({ type: 'file', id: file.id, currentName: file.name }); setRenameValue(file.name); }}><Edit2 className="h-3.5 w-3.5 mr-2" />Rename</DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setMoveTarget(file); setMoveFolderId(file.folder_id ?? '__root__'); }}><ArrowUpDown className="h-3.5 w-3.5 mr-2" />Move to…</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={e => { e.stopPropagation(); setPasswordSetTarget({ id: file.id, name: file.name, password_hash: file.password_hash, isFolder: false }); setNewPasswordValue(''); setConfirmPasswordValue(''); }}>
                  <Key className="h-3.5 w-3.5 mr-2" />{file.password_hash ? 'Change Password' : 'Set Password'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem><Share2 className="h-3.5 w-3.5 mr-2" />Share</DropdownMenuItem>
                {file.public_url && !['top_secret','restricted'].includes(file.security_level) && (
                  <DropdownMenuItem onClick={e => { e.stopPropagation(); setQrFile(file); }}>
                    <QrCode className="h-3.5 w-3.5 mr-2 text-[#1D3461]" />Share QR Code
                  </DropdownMenuItem>
                )}
                {isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem className="text-red-600" onClick={() => deleteFile(file)}><Trash2 className="h-3.5 w-3.5 mr-2" />Delete</DropdownMenuItem></>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <p className="text-xs font-semibold line-clamp-2 mb-1.5">{file.name}</p>
        <div className="flex items-center gap-1 flex-wrap mt-auto">
          <SecBadge level={file.security_level} size="xs" />
          <span className="text-[10px] text-muted-foreground">{fmtSize(file.file_size)}</span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">{fmtRelative(file.updated_at)}</p>
      </div>
    );
  }

  // ── Summary stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const visibleFiles = allFiles.filter(f => !f.folder_id || !lockedFolderIdSet.has(f.folder_id));
    const totalSize = visibleFiles.reduce((s, f) => s + f.file_size, 0);
    const byLevel: Record<SecurityLevel, number> = { public: 0, internal: 0, confidential: 0, restricted: 0, top_secret: 0 };
    visibleFiles.forEach(f => { byLevel[f.security_level]++; });
    return { total: visibleFiles.length, totalSize, byLevel, pinned: visibleFiles.filter(f => f.is_pinned).length, mine: visibleFiles.filter(f => f.created_by === userId).length };
  }, [allFiles, userId, lockedFolderIdSet]);

  const currentFolderName = selectedFolderId === '__pinned__' ? 'Pinned Files' : selectedFolderId === '__recent__' ? 'Recent Files' : selectedFolderId === '__mine__' ? 'My Files' : selectedFolder?.name ?? 'All Files';

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <WorkspaceAccessGate>
    <TooltipProvider>
      <div className="flex h-screen bg-background overflow-hidden">

        {/* ══ Left Sidebar ════════════════════════════════════════════════ */}
        <div className="w-64 flex-shrink-0 border-r flex flex-col bg-card overflow-y-auto">
          {/* Sidebar header */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-[#0F2041] to-[#1D3461] flex items-center justify-center">
                <Folder className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-[#0F2041]">Workspace Hub</h2>
                <p className="text-[10px] text-muted-foreground">{stats.total} files · {fmtSize(stats.totalSize)}</p>
              </div>
              {isSuperAdmin && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setAccessManagerOpen(true)}
                      className="p-1.5 rounded-lg hover:bg-[#0F2041]/10 text-[#0F2041]/60 hover:text-[#0F2041] transition-colors"
                      data-testid="btn-workspace-access-manager"
                    >
                      <Key className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">Manage Access</TooltipContent>
                </Tooltip>
              )}
            </div>
            <Button size="sm" className="w-full bg-[#1D3461] hover:bg-[#0F2041] h-8 text-xs gap-1.5" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5" />Upload Files
            </Button>
          </div>

          {/* Quick access */}
          <div className="p-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider px-2 mb-1">Quick Access</p>
            {[
              { id: '__recent__', label: 'Recent', icon: Clock, count: Math.min(20, allFiles.length) },
              { id: '__pinned__', label: 'Pinned', icon: Star, count: stats.pinned },
              { id: '__mine__', label: 'My Files', icon: User, count: stats.mine },
              { id: null, label: 'All Files', icon: FolderOpen, count: stats.total },
            ].map(item => {
              const isSelected = selectedFolderId === item.id;
              return (
                <button key={String(item.id)} onClick={() => setSelectedFolderId(item.id)}
                  className={cn('w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-xs font-medium transition-colors',
                    isSelected ? 'bg-[#1D3461] text-white' : 'hover:bg-muted/60')}>
                  <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <span className={cn('text-[10px] px-1.5 rounded-full', isSelected ? 'bg-white/20' : 'bg-muted')}>{item.count}</span>
                </button>
              );
            })}
          </div>

          {/* Folder tree */}
          <div className="p-2 flex-1">
            <div className="flex items-center justify-between px-2 mb-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Folders</p>
              {isAdmin && (
                <button onClick={() => setNewFolderOpen(true)} className="text-muted-foreground hover:text-[#1D3461] transition-colors">
                  <FolderPlus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {rootFolders.length === 0 ? (
              <p className="text-[11px] text-muted-foreground text-center py-4 px-2">No folders yet</p>
            ) : (
              rootFolders.map(f => <FolderNode key={f.id} folder={f} depth={0} />)
            )}
          </div>

          {/* Security level legend */}
          <div className="p-3 border-t space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Security Levels</p>
            {(Object.entries(SEC_CFG) as [SecurityLevel, any][]).map(([level, cfg]) => {
              const Icon = cfg.icon;
              const count = stats.byLevel[level];
              return (
                <div key={level} className="flex items-center gap-1.5 text-[10px]">
                  <Icon className={cn('h-3 w-3 flex-shrink-0', cfg.text)} />
                  <span className="flex-1 text-muted-foreground">{cfg.label}</span>
                  <span className="font-medium">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══ Main Content ════════════════════════════════════════════════ */}
        <div className={cn('flex-1 flex flex-col min-w-0 overflow-hidden', selectedFile ? 'mr-[380px]' : '')}>
          {/* Top bar */}
          <div className="flex items-center gap-3 px-5 py-3 border-b bg-card flex-shrink-0">
            <div>
              <h3 className="text-sm font-bold">{currentFolderName}</h3>
              <p className="text-[11px] text-muted-foreground">{displayedFiles.length} file{displayedFiles.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex-1" />

            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search files…" className="pl-8 h-8 text-xs" />
            </div>

            <Select value={secFilter} onValueChange={v => setSecFilter(v as any)}>
              <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="All Levels" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Levels</SelectItem>
                {(Object.entries(SEC_CFG) as [SecurityLevel, any][]).map(([level, cfg]) => (
                  <SelectItem key={level} value={level} className="text-xs">{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={v => setSortBy(v as any)}>
              <SelectTrigger className="h-8 w-28 text-xs gap-1"><ArrowUpDown className="h-3 w-3" /><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="date" className="text-xs">Date Modified</SelectItem>
                <SelectItem value="name" className="text-xs">Name</SelectItem>
                <SelectItem value="size" className="text-xs">Size</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center border rounded-lg p-0.5">
              <button onClick={() => setViewMode('list')} className={cn('p-1.5 rounded transition-colors', viewMode === 'list' ? 'bg-[#1D3461] text-white' : 'text-muted-foreground hover:text-foreground')}>
                <List className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setViewMode('grid')} className={cn('p-1.5 rounded transition-colors', viewMode === 'grid' ? 'bg-[#1D3461] text-white' : 'text-muted-foreground hover:text-foreground')}>
                <Grid className="h-3.5 w-3.5" />
              </button>
            </div>

            {isAdmin && selectedFolderId && !['__pinned__', '__recent__', '__mine__'].includes(selectedFolderId ?? '') && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={() => setShareFolderTarget(selectedFolder ?? null)}>
                <Share2 className="h-3.5 w-3.5" />Share Folder
              </Button>
            )}

            <Button size="sm" className="bg-[#1D3461] hover:bg-[#0F2041] h-8 text-xs gap-1" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5" />Upload
            </Button>
          </div>

          {/* File area */}
          <div className="flex-1 overflow-y-auto">
            {selectedFolder && selectedFolder.password_hash && !unlockedFolderIds.has(selectedFolder.id) ? (
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
            ) : displayedFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <div className="h-20 w-20 rounded-3xl bg-muted/30 flex items-center justify-center">
                  <Folder className="h-10 w-10 opacity-30" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{searchQuery ? 'No files match your search' : 'No files here yet'}</p>
                  <p className="text-xs mt-1">{searchQuery ? 'Try a different keyword' : 'Upload your first file to get started'}</p>
                </div>
                {!searchQuery && (
                  <Button size="sm" className="bg-[#1D3461] hover:bg-[#0F2041] gap-1.5" onClick={() => setUploadOpen(true)}>
                    <Upload className="h-3.5 w-3.5" />Upload Files
                  </Button>
                )}
              </div>
            ) : viewMode === 'list' ? (
              <div className="bg-card border-b">
                {/* List header */}
                <div className="grid grid-cols-[1fr_100px_120px_80px] text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30 border-b px-4 py-2 gap-2 hidden sm:grid">
                  <span>File</span><span>Security</span><span>Modified</span><span className="text-right">Size</span>
                </div>
                {displayedFiles.map(f => <FileRow key={f.id} file={f} />)}
              </div>
            ) : (
              <div className="p-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {displayedFiles.map(f => <FileCard key={f.id} file={f} />)}
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
            />
          </div>
        )}

        {/* ══ Dialogs ══════════════════════════════════════════════════════ */}

        {/* Upload dialog */}
        <UploadDialog
          folderId={selectedFolder?.id ?? null} folderName={currentFolderName}
          open={uploadOpen} onClose={() => setUploadOpen(false)}
          currentUserId={userId} onUploaded={refetch}
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
              <Input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} placeholder="Folder name…" className="text-sm" autoFocus onKeyDown={e => e.key === 'Enter' && createFolder()} />
              <div>
                <label className="text-xs font-semibold mb-2 block">Security Level</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(Object.entries(SEC_CFG) as [SecurityLevel, any][]).map(([level, cfg]) => {
                    const Icon = cfg.icon;
                    return (
                      <button key={level} onClick={() => setNewFolderSec(level)}
                        className={cn('flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] font-semibold transition-all',
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

        {/* Access Manager Dialog — super admin only */}
        {isSuperAdmin && (
          <WorkspaceAccessManager
            open={accessManagerOpen}
            onClose={() => setAccessManagerOpen(false)}
          />
        )}

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
                const svgEl = document.getElementById('workspace-qr-svg') as SVGElement | null;
                if (!svgEl) return;
                const canvas = await svgToCanvas(svgEl, 300);
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
                const svgEl = document.getElementById('workspace-qr-svg') as SVGElement | null;
                if (!svgEl) return;
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
  );
}
