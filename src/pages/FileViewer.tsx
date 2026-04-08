import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, Download, AlertCircle, File, FileImage,
  FileSpreadsheet, FileVideo, FileAudio, FileText,
  Globe, Smartphone, ExternalLink, ChevronRight,
} from 'lucide-react';
import Logo from '../assets/logo.png';

interface FileData {
  id: string;
  name: string;
  mime_type: string | null;
  extension: string | null;
  public_url: string | null;
  file_size: number;
  description: string | null;
  security_level: string;
}

type FileCategory = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'office-ppt' | 'office-xls' | 'office-doc' | 'other';

function getCategory(file: FileData): FileCategory {
  const ext  = (file.extension ?? '').toLowerCase().replace('.', '');
  const mime = (file.mime_type  ?? '').toLowerCase();

  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg','bmp','avif'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4','webm','ogv','mov','avi'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac','aac'].includes(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('text/') || ['txt','md','csv','json','xml','html','htm','yaml','yml'].includes(ext)) return 'text';

  if (['pptx','ppt','ppsx','potx'].includes(ext) || mime.includes('presentationml') || mime.includes('ms-powerpoint')) return 'office-ppt';
  if (['xlsx','xls','xltx'].includes(ext) || mime.includes('spreadsheetml') || mime.includes('ms-excel')) return 'office-xls';
  if (['docx','doc','dotx'].includes(ext) || mime.includes('wordprocessingml') || mime.includes('msword')) return 'office-doc';

  return 'other';
}

const OFFICE_APP_INFO: Record<'office-ppt' | 'office-xls' | 'office-doc', {
  name: string; scheme: string; headerFrom: string; headerTo: string;
  iconBg: string; badge: string;
}> = {
  'office-ppt': {
    name: 'PowerPoint', scheme: 'ms-powerpoint',
    headerFrom: '#B83C1A', headerTo: '#D94F2A',
    iconBg: '#C9441F', badge: 'PPTX',
  },
  'office-xls': {
    name: 'Excel', scheme: 'ms-excel',
    headerFrom: '#0E6B35', headerTo: '#1A8A47',
    iconBg: '#107C41', badge: 'XLSX',
  },
  'office-doc': {
    name: 'Word', scheme: 'ms-word',
    headerFrom: '#1452A3', headerTo: '#1F6BC7',
    iconBg: '#185ABD', badge: 'DOCX',
  },
};

function OfficeIcon({ cat, size = 64 }: { cat: FileCategory; size?: number }) {
  const s = `h-${size === 64 ? 16 : 10} w-${size === 64 ? 16 : 10}`;
  if (cat === 'office-xls') return <FileSpreadsheet className={`${s} text-emerald-400`} />;
  if (cat === 'office-ppt') return <File className={`${s} text-orange-400`} />;
  if (cat === 'office-doc') return <FileText className={`${s} text-blue-400`} />;
  return <File className={`${s} text-slate-400`} />;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function TopBar({ file }: { file: FileData }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 shrink-0 z-10"
      style={{ background: 'linear-gradient(90deg,#0F2041,#1D3461)' }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <img src={Logo} alt="PACT" className="h-7 w-7 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="text-[10px] text-blue-300/70 font-medium uppercase tracking-wide leading-none mb-0.5">PACT Command Center</p>
          <h1 className="text-sm font-semibold text-white leading-tight truncate max-w-[200px] sm:max-w-sm md:max-w-xl">{file.name}</h1>
        </div>
      </div>
      {file.public_url && (
        <a href={file.public_url} download={file.name}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/90 bg-white/10 hover:bg-white/20 border border-white/10 transition-all">
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Download</span>
        </a>
      )}
    </div>
  );
}

export default function FileViewer() {
  const { fileId } = useParams<{ fileId: string }>();
  const [file,       setFile]      = useState<FileData | null>(null);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState<string | null>(null);
  const [showOnline, setShowOnline] = useState(false);

  useEffect(() => {
    if (!fileId) { setError('No file specified.'); setLoading(false); return; }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId);
    const query  = supabase.from('workspace_files')
      .select('id, name, mime_type, extension, public_url, file_size, description, security_level');

    (isUUID ? query.eq('id', fileId) : query.eq('short_code', fileId.toUpperCase()))
      .eq('archived', false)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('File not found or is no longer available.');
        } else if (['top_secret', 'restricted'].includes(data.security_level)) {
          setError('This file requires authentication to view. Please log in to the PACT Command Center.');
        } else if (!data.public_url) {
          setError('This file is not publicly accessible via QR code.');
        } else {
          setFile(data as FileData);
          supabase.from('workspace_activity').insert({
            file_id: data.id,
            action: 'viewed',
            metadata: { source: 'qr_scan' },
          }).then(() => {});
        }
        setLoading(false);
      });
  }, [fileId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#0F2041,#1D3461)' }}>
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin mx-auto mb-3 text-white/60" />
        <p className="text-sm text-white/50">Opening file…</p>
      </div>
    </div>
  );

  if (error || !file) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: 'linear-gradient(135deg,#0F2041,#1D3461)' }}>
      <div className="text-center max-w-sm w-full bg-white/10 backdrop-blur rounded-2xl border border-white/15 p-8">
        <div className="flex items-center justify-center gap-2 mb-6">
          <img src={Logo} alt="PACT" className="h-8 w-8 object-contain" />
          <span className="text-white font-bold">PACT Command Center</span>
        </div>
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
        <h2 className="text-white font-bold text-lg mb-2">Cannot open file</h2>
        <p className="text-white/60 text-sm">{error}</p>
      </div>
    </div>
  );

  const cat = getCategory(file);
  const url = file.public_url!;

  /* ── Inline viewers ──────────────────────────────────────────── */
  if (cat === 'image') return (
    <div className="min-h-screen flex flex-col bg-[#0d1117]">
      <TopBar file={file} />
      <div className="flex-1 flex items-center justify-center p-4">
        <img src={url} alt={file.name}
          className="max-w-full max-h-[calc(100vh-56px)] object-contain rounded-xl shadow-2xl ring-1 ring-white/10" />
      </div>
    </div>
  );

  if (cat === 'video') return (
    <div className="min-h-screen flex flex-col bg-black">
      <TopBar file={file} />
      <div className="flex-1 flex items-center justify-center p-4">
        <video src={url} controls autoPlay
          className="max-w-full max-h-[calc(100vh-56px)] rounded-xl shadow-2xl" />
      </div>
    </div>
  );

  if (cat === 'audio') return (
    <div className="min-h-screen flex flex-col bg-[#0d1117]">
      <TopBar file={file} />
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center bg-[#1D3461]/40 rounded-2xl p-10 border border-white/10 w-full max-w-md">
          <FileAudio className="h-16 w-16 text-blue-300 mx-auto mb-4" />
          <h2 className="text-white font-bold text-lg mb-1 truncate">{file.name}</h2>
          <p className="text-blue-200/50 text-sm mb-6">{fmtSize(file.file_size)}</p>
          <audio src={url} controls className="w-full" />
        </div>
      </div>
    </div>
  );

  if (cat === 'pdf' || cat === 'text') return (
    <div className="min-h-screen flex flex-col bg-[#0d1117]">
      <TopBar file={file} />
      <iframe src={url} title={file.name} className="flex-1 w-full border-0"
        style={{ height: 'calc(100vh - 56px)' }} allow="fullscreen"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" />
    </div>
  );

  /* ── Office files — smart action page ───────────────────────── */
  if (cat === 'office-ppt' || cat === 'office-xls' || cat === 'office-doc') {
    const app       = OFFICE_APP_INFO[cat];
    const onlineUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
    const deepLink  = `${app.scheme}:ofe|u|${url}`;
    const ext       = (file.extension ?? '').toUpperCase().replace('.', '');

    if (showOnline) return (
      <div className="min-h-screen flex flex-col bg-[#0d1117]">
        <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
          style={{ background: `linear-gradient(90deg,${app.headerFrom},${app.headerTo})` }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={Logo} alt="PACT" className="h-7 w-7 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/60 uppercase tracking-wide leading-none mb-0.5">Viewing in {app.name} Online</p>
              <h1 className="text-sm font-semibold text-white leading-tight truncate max-w-[200px] sm:max-w-sm">{file.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setShowOnline(false)}
              className="text-[11px] font-medium text-white/70 hover:text-white px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all">
              ← Back
            </button>
            <a href={url} download={file.name}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/90 bg-white/10 hover:bg-white/20 border border-white/10 transition-all">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>
          </div>
        </div>
        <iframe src={onlineUrl} title={file.name} className="flex-1 w-full border-0"
          style={{ height: 'calc(100vh - 56px)' }} allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-downloads" />
      </div>
    );

    return (
      <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(160deg,#0F2041 0%,#1D3461 55%,#0F2041 100%)' }}>

        {/* PACT header */}
        <div className="flex items-center gap-2.5 px-5 pt-5 pb-0">
          <img src={Logo} alt="PACT" className="h-7 w-7 object-contain opacity-90" />
          <span className="text-white/60 text-[11px] font-semibold uppercase tracking-widest">PACT Command Center</span>
        </div>

        {/* Main card */}
        <div className="flex-1 flex items-center justify-center p-5">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">

            {/* App-coloured header strip */}
            <div className="px-6 py-5 flex items-center gap-4"
              style={{ background: `linear-gradient(135deg,${app.headerFrom},${app.headerTo})` }}>
              <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
                <OfficeIcon cat={cat} size={40} />
              </div>
              <div className="min-w-0">
                <p className="text-white/70 text-[10px] font-semibold uppercase tracking-widest mb-0.5">{app.name} File</p>
                <p className="text-white font-bold text-[15px] leading-snug truncate">{file.name}</p>
                <p className="text-white/60 text-[11px] mt-0.5">{ext} · {fmtSize(file.file_size)}</p>
              </div>
            </div>

            {/* Description */}
            {file.description && (
              <div className="px-6 pt-4">
                <p className="text-slate-500 text-sm leading-snug">{file.description}</p>
              </div>
            )}

            {/* Action buttons */}
            <div className="px-5 py-5 flex flex-col gap-3">

              {/* Open in native app — PRIMARY */}
              <a href={deepLink}
                className="flex items-center gap-4 w-full px-4 py-4 rounded-xl text-white font-semibold text-[14px] shadow-lg active:scale-[.98] transition-all"
                style={{ background: `linear-gradient(135deg,${app.headerFrom},${app.headerTo})` }}>
                <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <Smartphone className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-bold leading-none">Open in {app.name}</p>
                  <p className="text-white/65 text-[11px] mt-0.5">Opens the {app.name} app if installed</p>
                </div>
                <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
              </a>

              {/* View Online — SECONDARY */}
              <button onClick={() => setShowOnline(true)}
                className="flex items-center gap-4 w-full px-4 py-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 font-semibold text-[14px] active:scale-[.98] transition-all">
                <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                  <Globe className="h-5 w-5 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-bold text-slate-800 leading-none">View Online</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">Open in {app.name} Online — no app needed</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
              </button>

              {/* Download — TERTIARY */}
              <a href={url} download={file.name}
                className="flex items-center gap-4 w-full px-4 py-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 font-semibold text-[14px] active:scale-[.98] transition-all">
                <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                  <Download className="h-5 w-5 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-bold text-slate-800 leading-none">Download File</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">Save to your device — open with any app</p>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
              </a>
            </div>

            {/* Tip footer */}
            <div className="mx-5 mb-5 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2.5">
              <span className="text-amber-500 text-base leading-none mt-0.5">💡</span>
              <p className="text-amber-700 text-[11px] leading-relaxed">
                <strong>Tip:</strong> "Open in {app.name}" works best if you have the Microsoft {app.name} app installed on your device.
                Use "View Online" for instant access in the browser.
              </p>
            </div>
          </div>
        </div>

        {/* PACT footer */}
        <p className="text-center text-white/25 text-[10px] pb-4">
          Shared via PACT Command Center · Workspace Files
        </p>
      </div>
    );
  }

  /* ── Other / unknown — download page ────────────────────────── */
  return (
    <div className="min-h-screen flex flex-col bg-[#0d1117]">
      <TopBar file={file} />
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center bg-[#1D3461]/40 rounded-2xl p-10 border border-white/10 max-w-sm w-full">
          <File className="h-16 w-16 text-blue-300 mx-auto mb-4" />
          <h2 className="text-white font-bold text-lg mt-2 mb-1 break-words">{file.name}</h2>
          <p className="text-blue-200/60 text-sm mb-1">
            {(file.extension ?? 'FILE').toUpperCase()} · {fmtSize(file.file_size)}
          </p>
          {file.description && <p className="text-blue-100/50 text-xs mt-2 mb-6">{file.description}</p>}
          <a href={url} download={file.name}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1D3461] font-semibold rounded-xl hover:bg-blue-50 transition-all shadow-lg mt-4">
            <Download className="h-4 w-4" />
            Download File
          </a>
          <p className="text-white/25 text-[11px] mt-4">or open in a compatible app after downloading</p>
        </div>
      </div>
    </div>
  );
}
