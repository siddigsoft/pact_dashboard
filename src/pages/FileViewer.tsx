import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Loader2, FileText, Download, AlertCircle, File, FileImage,
  FileSpreadsheet, Presentation, FileVideo, FileAudio,
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

type ViewerKind = 'iframe' | 'office' | 'image' | 'video' | 'audio' | 'download';

function resolveViewer(file: FileData): { kind: ViewerKind; src: string } {
  const ext  = (file.extension ?? '').toLowerCase().replace('.', '');
  const mime = (file.mime_type  ?? '').toLowerCase();
  const url  = file.public_url  ?? '';

  if (!url) return { kind: 'download', src: '' };

  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif'].includes(ext))
    return { kind: 'image', src: url };

  if (mime.startsWith('video/') || ['mp4','webm','ogv','mov','avi'].includes(ext))
    return { kind: 'video', src: url };

  if (mime.startsWith('audio/') || ['mp3','wav','ogg','m4a','flac','aac'].includes(ext))
    return { kind: 'audio', src: url };

  if (mime === 'application/pdf' || ext === 'pdf')
    return { kind: 'iframe', src: url };

  if (mime.startsWith('text/') || ['txt','md','csv','json','xml','html','htm','yaml','yml'].includes(ext))
    return { kind: 'iframe', src: url };

  const officeExts   = ['pptx','ppt','ppsx','potx','docx','doc','dotx','xlsx','xls','xltx'];
  const officeMimes  = [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
  ];
  if (officeExts.includes(ext) || officeMimes.includes(mime))
    return { kind: 'office', src: `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}` };

  return { kind: 'download', src: url };
}

function FileTypeIcon({ mime, ext }: { mime: string | null; ext: string | null }) {
  const m = (mime ?? '').toLowerCase();
  const e = (ext  ?? '').toLowerCase();
  if (m.startsWith('image/') || ['jpg','jpeg','png','gif','webp'].includes(e)) return <FileImage className="h-16 w-16 text-blue-300" />;
  if (m.startsWith('video/')) return <FileVideo  className="h-16 w-16 text-blue-300" />;
  if (m.startsWith('audio/')) return <FileAudio  className="h-16 w-16 text-blue-300" />;
  if (['xlsx','xls','csv'].includes(e)) return <FileSpreadsheet className="h-16 w-16 text-emerald-400" />;
  if (['pptx','ppt'].includes(e)) return <Presentation className="h-16 w-16 text-orange-400" />;
  if (['docx','doc'].includes(e)) return <FileText className="h-16 w-16 text-blue-400" />;
  if (e === 'pdf')  return <FileText className="h-16 w-16 text-red-400" />;
  return <File className="h-16 w-16 text-blue-300" />;
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileViewer() {
  const { fileId } = useParams<{ fileId: string }>();
  const [file,    setFile]    = useState<FileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!fileId) { setError('No file specified.'); setLoading(false); return; }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId);
    const query = supabase
      .from('workspace_files')
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
            file_id: fileId,
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
        <p className="text-sm text-white/50">Loading file…</p>
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

  const viewer = resolveViewer(file);

  return (
    <div className="min-h-screen flex flex-col bg-[#0d1117]">

      {/* ── Top bar ── */}
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0 z-10"
        style={{ background: 'linear-gradient(90deg,#0F2041,#1D3461)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <img src={Logo} alt="PACT" className="h-7 w-7 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="text-[10px] text-blue-300/70 font-medium uppercase tracking-wide leading-none mb-0.5">PACT Command Center</p>
            <h1 className="text-sm font-semibold text-white leading-tight truncate max-w-[200px] sm:max-w-sm md:max-w-xl">{file.name}</h1>
          </div>
        </div>
        {file.public_url && (
          <a
            href={file.public_url}
            download={file.name}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/90 bg-white/10 hover:bg-white/20 border border-white/10 transition-all"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Download</span>
          </a>
        )}
      </div>

      {/* ── Viewer ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {viewer.kind === 'image' && (
          <div className="flex-1 flex items-center justify-center p-4 bg-[#0d1117]">
            <img
              src={viewer.src}
              alt={file.name}
              className="max-w-full max-h-[calc(100vh-60px)] object-contain rounded-xl shadow-2xl ring-1 ring-white/10"
            />
          </div>
        )}

        {viewer.kind === 'video' && (
          <div className="flex-1 flex items-center justify-center p-4 bg-black">
            <video
              src={viewer.src}
              controls
              autoPlay
              className="max-w-full max-h-[calc(100vh-60px)] rounded-xl shadow-2xl"
            />
          </div>
        )}

        {viewer.kind === 'audio' && (
          <div className="flex-1 flex items-center justify-center p-8 bg-[#0d1117]">
            <div className="text-center bg-[#1D3461]/40 rounded-2xl p-10 border border-white/10 w-full max-w-md">
              <FileTypeIcon mime={file.mime_type} ext={file.extension} />
              <h2 className="text-white font-bold text-lg mt-4 mb-2 truncate">{file.name}</h2>
              <audio src={viewer.src} controls className="w-full mt-4" />
            </div>
          </div>
        )}

        {(viewer.kind === 'iframe' || viewer.kind === 'office') && (
          <iframe
            src={viewer.src}
            title={file.name}
            className="flex-1 w-full border-0"
            style={{ height: 'calc(100vh - 56px)' }}
            allow="fullscreen"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          />
        )}

        {viewer.kind === 'download' && (
          <div className="flex-1 flex items-center justify-center p-8 bg-[#0d1117]">
            <div className="text-center bg-[#1D3461]/40 rounded-2xl p-10 border border-white/10 max-w-sm w-full">
              <FileTypeIcon mime={file.mime_type} ext={file.extension} />
              <h2 className="text-white font-bold text-lg mt-4 mb-1 break-words">{file.name}</h2>
              <p className="text-blue-200/60 text-sm mb-1">
                {(file.extension ?? 'FILE').toUpperCase()} &bull; {fmtSize(file.file_size)}
              </p>
              {file.description && (
                <p className="text-blue-100/50 text-xs mt-2 mb-6">{file.description}</p>
              )}
              {file.public_url && (
                <a
                  href={file.public_url}
                  download={file.name}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1D3461] font-semibold rounded-xl hover:bg-blue-50 transition-all shadow-lg"
                >
                  <Download className="h-4 w-4" />
                  Download File
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
