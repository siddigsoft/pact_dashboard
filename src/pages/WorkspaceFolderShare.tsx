import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { r2SignedUrl } from '@/lib/r2Storage';
import {
  Loader2, AlertCircle, Folder, FolderOpen, File, Download,
  ChevronRight, Home, Lock, Shield, ExternalLink, Eye,
  FileText, FileImage, FileSpreadsheet, FileVideo, FileAudio,
  Search, ArrowLeft,
} from 'lucide-react';
import Logo from '../assets/logo.png';

// ─── Types ───────────────────────────────────────────────────────────────────

type SecurityLevel = 'public' | 'internal' | 'confidential' | 'secret' | 'top_secret';

const CLEARANCE_ORDER: Record<SecurityLevel, number> = {
  public: 0, internal: 1, confidential: 2, secret: 3, top_secret: 4,
};

const SEC_LABEL: Record<SecurityLevel, string> = {
  public: 'Public', internal: 'Internal', confidential: 'Confidential',
  secret: 'Secret', top_secret: 'Top Secret',
};

const SEC_COLOR: Record<SecurityLevel, string> = {
  public: 'bg-emerald-100 text-emerald-700',
  internal: 'bg-blue-100 text-blue-700',
  confidential: 'bg-amber-100 text-amber-700',
  secret: 'bg-orange-100 text-orange-700',
  top_secret: 'bg-red-100 text-red-700',
};

interface ShareFolder {
  id: string;
  name: string;
  description: string | null;
  parent_folder_id: string | null;
  security_level: SecurityLevel;
  color: string;
  icon: string;
  password_hash: string | null;
  short_code: string | null;
}

interface ShareFile {
  id: string;
  name: string;
  description: string | null;
  file_size: number;
  mime_type: string | null;
  extension: string | null;
  security_level: SecurityLevel;
  storage_path: string;
  storage_provider: 'supabase' | 'r2';
  public_url: string | null;
  short_code: string | null;
  allow_download: boolean;
  is_pinned: boolean;
  tags: string[];
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getFileIcon(file: ShareFile) {
  const ext = (file.extension ?? '').toLowerCase();
  const mime = (file.mime_type ?? '').toLowerCase();
  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg'].includes(ext))
    return { Icon: FileImage, color: '#a855f7' };
  if (mime.startsWith('video/') || ['mp4','webm','mov','avi'].includes(ext))
    return { Icon: FileVideo, color: '#ec4899' };
  if (mime.startsWith('audio/') || ['mp3','wav','ogg','m4a'].includes(ext))
    return { Icon: FileAudio, color: '#06b6d4' };
  if (mime === 'application/pdf' || ext === 'pdf')
    return { Icon: File, color: '#ef4444' };
  if (mime.includes('spreadsheet') || mime.includes('excel') || ['xlsx','xls','csv'].includes(ext))
    return { Icon: FileSpreadsheet, color: '#22c55e' };
  if (mime.includes('word') || mime.includes('document') || ['docx','doc'].includes(ext))
    return { Icon: FileText, color: '#3b82f6' };
  return { Icon: FileText, color: '#64748b' };
}

// ─── Windows-style Folder Icon ────────────────────────────────────────────────

function FolderSvgIcon({ color = '#E8A415', icon = '', size = 72 }: { color?: string; icon?: string; size?: number }) {
  const h = Math.round(size * 0.82);
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: h }}>
      <svg viewBox="0 0 96 80" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={h}>
        {/* Drop shadow */}
        <ellipse cx="48" cy="78" rx="36" ry="4" fill="black" fillOpacity="0.08" />
        {/* Folder back body */}
        <rect x="2" y="22" width="92" height="52" rx="7" fill={color} />
        {/* Tab */}
        <path d="M2 22 Q2 14 9 14 L36 14 Q43 14 45 22 Z" fill={color} opacity="0.82" />
        {/* Front face overlay */}
        <rect x="2" y="28" width="92" height="46" rx="7" fill="white" fillOpacity="0.11" />
        {/* Top shine strip */}
        <rect x="6" y="30" width="84" height="9" rx="4" fill="white" fillOpacity="0.22" />
        {/* Bottom depth line */}
        <rect x="6" y="68" width="84" height="4" rx="2" fill="black" fillOpacity="0.06" />
      </svg>
      {icon && (
        <div
          className="absolute inset-0 flex items-end justify-end pointer-events-none select-none"
          style={{ paddingRight: 8, paddingBottom: 10, fontSize: Math.round(size * 0.3) }}
        >
          {icon}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkspaceFolderShare() {
  const { folderId } = useParams<{ folderId: string }>();
  const navigate = useNavigate();

  // Auth state
  const [userId, setUserId] = useState<string | null>(null);
  const [userClearance, setUserClearance] = useState<SecurityLevel>('public');
  const [authChecked, setAuthChecked] = useState(false);

  // Data
  const [rootFolder, setRootFolder] = useState<ShareFolder | null>(null);   // The originally-shared folder
  const [currentFolder, setCurrentFolder] = useState<ShareFolder | null>(null);
  const [subFolders, setSubFolders] = useState<ShareFolder[]>([]);
  const [files, setFiles] = useState<ShareFile[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<ShareFolder[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  // ── Step 1: resolve auth & clearance ──────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        // Fetch clearance
        const { data: clr } = await supabase
          .from('workspace_security_clearances')
          .select('clearance_level')
          .eq('user_id', uid)
          .maybeSingle();
        // Fetch profile role
        const { data: prof } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', uid)
          .maybeSingle();
        const role = prof?.role ?? '';
        const isSuperAdmin = role === 'superAdmin' || role === 'super_admin' || role === 'Super Admin';
        const isAdmin = isSuperAdmin || role === 'admin' || role === 'Admin';
        const assignedClearance = clr?.clearance_level as SecurityLevel | null;
        setUserClearance(
          isSuperAdmin ? 'top_secret' :
          isAdmin ? (assignedClearance ?? 'confidential') :
          (assignedClearance ?? 'internal')
        );
      }
      setAuthChecked(true);
    });
  }, []);

  // ── Step 2: load folder + contents ────────────────────────────────────────
  const loadFolder = useCallback(async (targetFolderId: string, crumbs: ShareFolder[] = []) => {
    if (!authChecked) return;
    setLoading(true);
    setError(null);

    try {
      // Load folder metadata — param may be a UUID or a short_code
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetFolderId);
      const baseQ = supabase
        .from('workspace_folders')
        .select('id, name, description, parent_folder_id, security_level, color, icon, password_hash, short_code')
        .eq('archived', false);
      const { data: folder, error: folderErr } = await (
        isUUID ? baseQ.eq('id', targetFolderId) : baseQ.eq('short_code', targetFolderId)
      ).maybeSingle();

      if (folderErr || !folder) {
        setError('Folder not found or this link has expired.');
        setLoading(false);
        return;
      }

      const f = folder as ShareFolder;

      // Check clearance level
      if (!canAccess(f.security_level)) {
        setError('You do not have permission to view this folder. Please sign in or contact the folder owner.');
        setLoading(false);
        return;
      }

      // Check explicit no_access grant — applies to authenticated users only.
      // Unauthenticated guests cannot have named permission grants.
      if (userId) {
        const { data: noPerm } = await supabase
          .from('workspace_permissions')
          .select('id')
          .eq('folder_id', f.id)
          .eq('grantee_id', userId)
          .eq('access_level', 'no_access')
          .maybeSingle();
        if (noPerm) {
          setError('You do not have permission to view this folder. Please contact the folder owner.');
          setLoading(false);
          return;
        }
      }

      // Set root folder on first load
      if (crumbs.length === 0) {
        setRootFolder(f);
      }

      setCurrentFolder(f);
      setBreadcrumbs(crumbs);

      // Load subfolders — always use the resolved UUID (f.id)
      const { data: subs } = await supabase
        .from('workspace_folders')
        .select('id, name, description, parent_folder_id, security_level, color, icon, password_hash, short_code')
        .eq('parent_folder_id', f.id)
        .eq('archived', false)
        .order('name');

      const accessibleSubs = ((subs ?? []) as ShareFolder[]).filter(s => canAccess(s.security_level));
      setSubFolders(accessibleSubs);

      // Load files
      const { data: fileRows } = await supabase
        .from('workspace_files')
        .select('id, name, description, file_size, mime_type, extension, security_level, storage_path, storage_provider, public_url, short_code, allow_download, is_pinned, tags, created_at')
        .eq('folder_id', targetFolderId)
        .eq('archived', false)
        .order('name');

      const accessibleFiles = ((fileRows ?? []) as ShareFile[]).filter(f2 => canAccess(f2.security_level));
      setFiles(accessibleFiles);

    } catch (e: any) {
      setError(e.message ?? 'Failed to load folder.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, userClearance, userId]);

  function canAccess(level: SecurityLevel): boolean {
    return CLEARANCE_ORDER[level] <= CLEARANCE_ORDER[userClearance];
  }

  // Initial load
  useEffect(() => {
    if (authChecked && folderId) loadFolder(folderId);
  }, [authChecked, folderId, loadFolder]);

  // ── Navigate into a subfolder ──────────────────────────────────────────────
  function navigateInto(sub: ShareFolder) {
    const newCrumbs = [...breadcrumbs, currentFolder!];
    setBreadcrumbs(newCrumbs);
    loadFolder(sub.id, newCrumbs);
  }

  function navigateToCrumb(idx: number) {
    if (idx < 0) {
      // Back to root
      setCurrentFolder(rootFolder);
      setBreadcrumbs([]);
      if (rootFolder) loadFolder(rootFolder.id, []);
      return;
    }
    const crumb = breadcrumbs[idx];
    const newCrumbs = breadcrumbs.slice(0, idx);
    loadFolder(crumb.id, newCrumbs);
  }

  // ── Download a file ────────────────────────────────────────────────────────
  async function downloadFile(file: ShareFile) {
    if (!file.allow_download) return;
    setDownloading(file.id);
    try {
      let url = file.public_url;
      if (!url && file.storage_provider === 'r2') {
        url = await r2SignedUrl(file.storage_path).catch(() => null);
      }
      if (!url) { alert('Could not generate download link.'); return; }
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.target = '_blank';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    } finally { setDownloading(null); }
  }

  // ── View a file in the file viewer ────────────────────────────────────────
  function viewFile(file: ShareFile) {
    window.open(`/view/${file.short_code || file.id}`, '_blank');
  }

  // ─── Filter ───────────────────────────────────────────────────────────────
  const q = searchQuery.toLowerCase();
  const filteredFolders = subFolders.filter(s => !q || s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q));
  const filteredFiles = files.filter(f => !q || f.name.toLowerCase().includes(q) || (f.description ?? '').toLowerCase().includes(q) || f.tags.some(t => t.toLowerCase().includes(q)));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-white flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
          <a href="https://pactorg.com" target="_blank" rel="noreferrer" className="flex-shrink-0">
            <img src={Logo} alt="PACT" className="h-7 object-contain" />
          </a>
          <div className="flex-1 flex items-center gap-2 text-sm text-slate-500 min-w-0">
            <span className="hidden sm:inline">Workspace</span>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 hidden sm:inline" />
            <span className="font-medium text-slate-800 truncate">{rootFolder?.name ?? 'Shared Folder'}</span>
          </div>
          {!userId && (
            <a
              href={`/auth?redirect=${encodeURIComponent(window.location.pathname)}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#1D3461] text-white hover:bg-[#0F2041] transition-colors flex-shrink-0"
            >
              Sign in
            </a>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8">

        {/* Initial loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-[#1D3461]" />
            <p className="text-sm text-slate-500">Loading shared folder…</p>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <div className="h-16 w-16 rounded-2xl bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-lg">Access Denied</p>
              <p className="text-slate-500 text-sm mt-1 max-w-md">{error}</p>
            </div>
            {!userId && (
              <a
                href={`/auth?redirect=${encodeURIComponent(window.location.pathname)}`}
                className="mt-2 text-sm font-semibold px-4 py-2 rounded-lg bg-[#1D3461] text-white hover:bg-[#0F2041] transition-colors"
              >
                Sign in to continue
              </a>
            )}
          </div>
        )}

        {/* Folder contents */}
        {!loading && !error && currentFolder && (
          <>
            {/* Folder header */}
            <div className="mb-6">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-xs text-slate-500 mb-3 flex-wrap">
                <button
                  onClick={() => navigateToCrumb(-1)}
                  className="flex items-center gap-1 hover:text-[#1D3461] transition-colors"
                >
                  <Home className="h-3 w-3" />
                  <span>Root</span>
                </button>
                {breadcrumbs.map((crumb, idx) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    <button
                      onClick={() => navigateToCrumb(idx)}
                      className="hover:text-[#1D3461] transition-colors"
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
                <span className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <span className="font-semibold text-slate-800">{currentFolder.name}</span>
                </span>
              </div>

              {/* Folder title */}
              <div className="flex items-start gap-4">
                <div
                  className="h-14 w-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0 shadow-sm"
                  style={{ background: currentFolder.color || '#1D3461' + '20', border: `2px solid ${currentFolder.color || '#1D3461'}30` }}
                >
                  {currentFolder.icon || '📁'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold text-slate-800">{currentFolder.name}</h1>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${SEC_COLOR[currentFolder.security_level]}`}>
                      {SEC_LABEL[currentFolder.security_level]}
                    </span>
                    {currentFolder.password_hash && (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        <Lock className="h-2.5 w-2.5" /> Password Protected
                      </span>
                    )}
                  </div>
                  {currentFolder.description && (
                    <p className="text-slate-500 text-sm mt-1">{currentFolder.description}</p>
                  )}
                </div>
              </div>

              {/* Guest access notice for non-logged-in users */}
              {!userId && (
                <div className="mt-4 flex items-start gap-2.5 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
                  <Shield className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Viewing as Guest</span> — Only public files are visible. 
                    <a href={`/auth?redirect=${encodeURIComponent(window.location.pathname)}`} className="underline font-semibold ml-1">Sign in</a> to see files you have been given access to.
                  </div>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search files and folders…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/30 focus:border-[#1D3461]/50"
              />
            </div>

            {/* Sub-folders — Windows Explorer icon grid */}
            {filteredFolders.length > 0 && (
              <section className="mb-6">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Folders ({filteredFolders.length})
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1">
                  {filteredFolders.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => navigateInto(sub)}
                      className="group flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-[#1D3461]/6 active:bg-[#1D3461]/10 transition-all text-center select-none"
                    >
                      <FolderSvgIcon
                        color={sub.color || '#E8A415'}
                        icon={sub.icon || ''}
                        size={72}
                      />
                      <p className="text-[11px] font-medium text-slate-700 group-hover:text-[#1D3461] leading-tight line-clamp-2 w-full transition-colors" title={sub.name}>
                        {sub.name}
                      </p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none ${SEC_COLOR[sub.security_level]}`}>
                        {SEC_LABEL[sub.security_level]}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Files */}
            {filteredFiles.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Files ({filteredFiles.length})
                </h2>
                <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-sm">
                  {filteredFiles.map(file => {
                    const { Icon, color } = getFileIcon(file);
                    const ext = (file.extension ?? file.name.split('.').pop() ?? '').toUpperCase().slice(0, 4) || '?';
                    return (
                      <div key={file.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group">
                        {/* Icon */}
                        <div className="h-9 w-9 rounded-lg flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style={{ background: color }}>
                          {ext.slice(0, 3)}
                        </div>
                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-slate-400" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtSize(file.file_size)}</span>
                            <span className="text-[10px] text-slate-400">{fmtDate(file.created_at)}</span>
                            {file.tags.slice(0, 2).map(t => (
                              <span key={t} className="text-[9px] px-1.5 py-0 rounded-full bg-blue-100 text-blue-700 font-medium">{t}</span>
                            ))}
                            <span className={`text-[9px] font-bold px-1.5 py-0 rounded-full ${SEC_COLOR[file.security_level]}`}>
                              {SEC_LABEL[file.security_level]}
                            </span>
                          </div>
                          {file.description && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">{file.description}</p>
                          )}
                        </div>
                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => viewFile(file)}
                            title="View"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#1D3461] hover:bg-blue-50 transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {file.allow_download && (
                            <button
                              onClick={() => downloadFile(file)}
                              title="Download"
                              disabled={downloading === file.id}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50"
                            >
                              {downloading === file.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Download className="h-4 w-4" />
                              }
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Empty state */}
            {filteredFolders.length === 0 && filteredFiles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                  <FolderOpen className="h-7 w-7 text-slate-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-600">{searchQuery ? 'No results found' : 'This folder is empty'}</p>
                  {!userId && !searchQuery && (
                    <p className="text-sm text-slate-400 mt-1">
                      Some files may require you to{' '}
                      <a href={`/auth?redirect=${encodeURIComponent(window.location.pathname)}`} className="underline font-semibold">sign in</a>.
                    </p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white/80 backdrop-blur-sm mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">Powered by <span className="font-semibold text-slate-600">PACT Platform</span></p>
          <div className="flex items-center gap-3">
            {userId ? (
              <a href="/workspace" className="text-[11px] font-semibold text-[#1D3461] hover:underline flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Open Workspace
              </a>
            ) : (
              <a href={`/auth?redirect=${encodeURIComponent(window.location.pathname)}`} className="text-[11px] font-semibold text-[#1D3461] hover:underline">
                Sign in
              </a>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
