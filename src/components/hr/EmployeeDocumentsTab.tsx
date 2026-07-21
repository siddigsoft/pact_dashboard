import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Download, Trash2, Loader2, FileText, Eye, Plus, X,
  CreditCard, User, FileImage, Briefcase, BookOpen, Globe, Shield,
  CheckCircle2, XCircle, Clock, AlertTriangle, FolderOpen, AlertCircle,
} from "lucide-react";

interface HrDoc {
  id: string;
  doc_type: string;
  doc_name: string;
  file_path: string;
  file_size?: number | null;
  file_mime?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  created_at: string;
  verification_status?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
}

const DOC_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string; required: boolean }> = {
  national_id:          { label: 'National ID',          icon: <CreditCard className="h-3.5 w-3.5" />,  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',    required: true  },
  passport:             { label: 'Passport',              icon: <Globe className="h-3.5 w-3.5" />,        color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', required: false },
  photo:                { label: 'Personal Photo (ID)',   icon: <User className="h-3.5 w-3.5" />,         color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',   required: true  },
  cv:                   { label: 'CV',                    icon: <FileText className="h-3.5 w-3.5" />,     color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', required: true  },
  resume:               { label: 'Resume',                icon: <FileText className="h-3.5 w-3.5" />,     color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', required: false },
  academic_certificate: { label: 'Academic Certificate',  icon: <BookOpen className="h-3.5 w-3.5" />,     color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',   required: false },
  work_permit:          { label: 'Work Permit',           icon: <Briefcase className="h-3.5 w-3.5" />,   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', required: false },
  reference_letter:     { label: 'Reference Letter',      icon: <FileText className="h-3.5 w-3.5" />,     color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',     required: false },
  medical_certificate:  { label: 'Medical Certificate',   icon: <Shield className="h-3.5 w-3.5" />,       color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',         required: false },
  police_clearance:     { label: 'Police Clearance',      icon: <Shield className="h-3.5 w-3.5" />,       color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400', required: false },
  other:                { label: 'Other Document',        icon: <FileImage className="h-3.5 w-3.5" />,    color: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',     required: false },
};

const V_META: Record<string, { label: string; pill: string; icon: React.ReactNode }> = {
  pending:  { label: 'Pending Review', pill: 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',  icon: <Clock className="h-3 w-3" /> },
  verified: { label: 'Verified',       pill: 'bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700',  icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: 'Rejected',       pill: 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',               icon: <XCircle className="h-3 w-3" /> },
};

function fmtSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function isExpiringSoon(expiry?: string | null) {
  if (!expiry) return false;
  return (new Date(expiry).getTime() - Date.now()) / 86400000 < 30;
}

export default function EmployeeDocumentsTab({
  userId, isAdmin, currentUserId, onVerificationChange, onDocumentUploaded, hrFolderName,
}: {
  userId: string; isAdmin: boolean; currentUserId?: string;
  onVerificationChange?: (allVerified: boolean, verified: number, total: number) => void;
  onDocumentUploaded?: () => void;
  /** When set, new uploads go into HR/{hrFolderName}/ instead of the legacy {userId}/ path */
  hrFolderName?: string;
}) {
  const { toast } = useToast();
  const [docs, setDocs] = useState<HrDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState('national_id');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadExpiry, setUploadExpiry] = useState('');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [expandedReject, setExpandedReject] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fireVerificationChange = (list: HrDoc[]) => {
    if (!onVerificationChange) return;
    const total = list.length;
    const verified = list.filter(d => d.verification_status === 'verified').length;
    onVerificationChange(total > 0 && verified === total, verified, total);
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('hr_employee_documents').select('*').eq('profile_id', userId).order('created_at', { ascending: false });
    const list = data || [];
    setDocs(list);
    setLoading(false);
    fireVerificationChange(list);
  };

  useEffect(() => { load(); }, [userId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const safeFile = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      // If the employee has a named HR folder, place new docs there; otherwise use legacy userId path
      const path = hrFolderName
        ? `HR/${hrFolderName}/${uploadType}_${Date.now()}_${safeFile}`
        : `${userId}/${Date.now()}_${safeFile}`;
      const { error: upErr } = await supabase.storage.from('staff-contracts').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('hr_employee_documents').insert({
        profile_id: userId, doc_type: uploadType, doc_name: file.name,
        file_path: path, file_size: file.size, file_mime: file.type || null,
        expiry_date: uploadExpiry || null, notes: uploadNotes.trim() || null,
        uploaded_by: currentUserId || null, verification_status: 'pending',
      });
      if (insErr) throw insErr;
      toast({ title: 'Document uploaded', description: 'Awaiting HR verification.' });
      setShowUpload(false); setUploadNotes(''); setUploadExpiry('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
      onDocumentUploaded?.();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally { setUploading(false); }
  };

  const handleView = async (doc: HrDoc) => {
    try {
      const { data, error } = await supabase.storage.from('staff-contracts').createSignedUrl(doc.file_path, 120);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (e: any) {
      toast({ title: 'Cannot open file', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (doc: HrDoc) => {
    setDeletingId(doc.id);
    try {
      await supabase.storage.from('staff-contracts').remove([doc.file_path]);
      const { error } = await supabase.from('hr_employee_documents').delete().eq('id', doc.id);
      if (error) throw error;
      const next = docs.filter(d => d.id !== doc.id);
      setDocs(next); fireVerificationChange(next);
      toast({ title: 'Document deleted' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally { setDeletingId(null); }
  };

  const handleVerify = async (doc: HrDoc) => {
    setVerifyingId(doc.id);
    try {
      const { error } = await supabase.from('hr_employee_documents').update({
        verification_status: 'verified', verified_by: currentUserId || null,
        verified_at: new Date().toISOString(), rejection_reason: null,
      }).eq('id', doc.id);
      if (error) throw error;
      const next = docs.map(d => d.id === doc.id
        ? { ...d, verification_status: 'verified', verified_at: new Date().toISOString(), rejection_reason: null }
        : d);
      setDocs(next); fireVerificationChange(next);
      toast({ title: 'Document verified' });
    } catch (e: any) {
      toast({ title: 'Verify failed', description: e.message, variant: 'destructive' });
    } finally { setVerifyingId(null); }
  };

  const handleReject = async (doc: HrDoc) => {
    const reason = rejectReason[doc.id] || '';
    setRejectingId(doc.id);
    try {
      const { error } = await supabase.from('hr_employee_documents').update({
        verification_status: 'rejected', verified_by: currentUserId || null,
        verified_at: new Date().toISOString(), rejection_reason: reason || null,
      }).eq('id', doc.id);
      if (error) throw error;
      const next = docs.map(d => d.id === doc.id ? { ...d, verification_status: 'rejected', rejection_reason: reason } : d);
      setDocs(next); fireVerificationChange(next);
      setExpandedReject(null);
      setRejectReason(p => { const n = { ...p }; delete n[doc.id]; return n; });
      toast({ title: 'Document rejected' });
    } catch (e: any) {
      toast({ title: 'Reject failed', description: e.message, variant: 'destructive' });
    } finally { setRejectingId(null); }
  };

  const handleResetToPending = async (doc: HrDoc) => {
    try {
      const { error } = await supabase.from('hr_employee_documents').update({
        verification_status: 'pending', verified_by: null, verified_at: null, rejection_reason: null,
      }).eq('id', doc.id);
      if (error) throw error;
      const next = docs.map(d => d.id === doc.id
        ? { ...d, verification_status: 'pending', verified_by: null, verified_at: null, rejection_reason: null }
        : d);
      setDocs(next); fireVerificationChange(next);
    } catch (e: any) {
      toast({ title: 'Reset failed', description: e.message, variant: 'destructive' });
    }
  };

  const grouped = Object.keys(DOC_TYPE_META).reduce((acc, type) => {
    const list = docs.filter(d => d.doc_type === type);
    if (list.length > 0) acc[type] = list;
    return acc;
  }, {} as Record<string, HrDoc[]>);

  const verifiedCount = docs.filter(d => d.verification_status === 'verified').length;
  const pendingCount = docs.filter(d => !d.verification_status || d.verification_status === 'pending').length;
  const rejectedCount = docs.filter(d => d.verification_status === 'rejected').length;
  const allVerified = docs.length > 0 && pendingCount === 0 && rejectedCount === 0;
  const pct = docs.length > 0 ? Math.round((verifiedCount / docs.length) * 100) : 0;

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 text-primary shrink-0">
            <FolderOpen className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-bold text-sm">Document Vault</h3>
            <p className="text-xs text-muted-foreground">{docs.length} document{docs.length !== 1 ? 's' : ''} · HR verification required for activation</p>
          </div>
        </div>
        {!showUpload && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setShowUpload(true)} data-testid="button-upload-document">
            <Plus className="h-3 w-3" /> Upload
          </Button>
        )}
      </div>

      {/* ── Missing required docs banner ─────────────────────────────────── */}
      {(() => {
        const requiredTypes = Object.entries(DOC_TYPE_META).filter(([, m]) => m.required).map(([k]) => k);
        const uploadedTypes = new Set(docs.map(d => d.doc_type));
        const missing = requiredTypes.filter(t => !uploadedTypes.has(t));
        if (missing.length === 0) return null;
        return (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Required documents missing</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">
                Please upload: {missing.map(t => DOC_TYPE_META[t]?.label || t).join(', ')}
              </p>
            </div>
          </div>
        );
      })()}

      {/* ── Verification progress bar ─────────────────────────────────────── */}
      {docs.length > 0 && (
        <div className={`rounded-xl border p-4 ${allVerified ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800' : rejectedCount > 0 ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'}`}>
          <div className="flex items-center gap-3 mb-3">
            {allVerified
              ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              : rejectedCount > 0
                ? <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                : <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            }
            <div className="flex-1">
              <p className={`text-xs font-bold ${allVerified ? 'text-green-800 dark:text-green-300' : rejectedCount > 0 ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                {allVerified ? 'All documents verified — ready for activation' : rejectedCount > 0 ? `${rejectedCount} document(s) rejected — employee must re-upload` : `${pendingCount} document(s) awaiting HR verification`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-muted-foreground">{pct}%</span>
            </div>
          </div>
          <div className="h-1.5 bg-white/60 dark:bg-black/20 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-500 ${allVerified ? 'bg-green-500' : rejectedCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <div className="flex items-center gap-4 mt-2.5">
            {[
              { label: 'Verified', count: verifiedCount, color: 'text-green-700 dark:text-green-400' },
              { label: 'Pending', count: pendingCount, color: 'text-amber-700 dark:text-amber-400' },
              { label: 'Rejected', count: rejectedCount, color: 'text-red-700 dark:text-red-400' },
            ].map(s => (
              <span key={s.label} className={`text-[11px] font-semibold ${s.color}`}>
                {s.count} {s.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Upload form ───────────────────────────────────────────────────── */}
      {showUpload && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold">Upload New Document</h4>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowUpload(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-foreground/70 mb-1.5">Document Type <span className="text-destructive">*</span></label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">{v.label}{v.required && <span className="text-[10px] text-destructive font-bold">Required</span>}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground/70 mb-1.5">Expiry Date (if applicable)</label>
              <Input type="date" value={uploadExpiry} onChange={e => setUploadExpiry(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-foreground/70 mb-1.5">Notes</label>
              <Input value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} placeholder="Optional notes about this document" className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1 border-t border-border/40">
            <Button size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="button-select-file">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Uploading…' : 'Choose File & Upload'}
            </Button>
            <span className="text-xs text-muted-foreground">PDF, image, or Word document</span>
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" onChange={handleUpload} />
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {docs.length === 0 && !showUpload && (
        <div className="text-center py-12 border rounded-xl border-dashed bg-muted/5">
          <FolderOpen className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No documents uploaded yet</p>
          <p className="text-xs text-muted-foreground mt-1">Upload the employee's ID, CV, certificates, and more.</p>
        </div>
      )}

      {/* ── Document list grouped by type ────────────────────────────────── */}
      {Object.entries(grouped).map(([type, list]) => {
        const meta = DOC_TYPE_META[type] || DOC_TYPE_META.other;
        return (
          <div key={type}>
            {/* Group label */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`flex items-center justify-center h-6 w-6 rounded-lg ${meta.color}`}>{meta.icon}</span>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{meta.label}</span>
              {meta.required && <span className="text-[10px] font-bold text-destructive uppercase tracking-wide">Required</span>}
              <span className="text-[11px] text-muted-foreground">({list.length})</span>
            </div>

            <div className="space-y-1.5 pl-0.5">
              {list.map(doc => {
                const expiring = isExpiringSoon(doc.expiry_date);
                const vstatus = doc.verification_status || 'pending';
                const vm = V_META[vstatus] || V_META.pending;
                const isVerifying = verifyingId === doc.id;
                const isRejecting = rejectingId === doc.id;
                const isDeleting = deletingId === doc.id;
                const showRejectBox = expandedReject === doc.id;

                return (
                  <div key={doc.id} className="rounded-xl border border-border/40 bg-background overflow-hidden hover:border-border/60 hover:shadow-sm transition-all">
                    {/* Main row */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold truncate">{doc.doc_name}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${vm.pill}`}>
                            {vm.icon}{vm.label}
                          </span>
                          {expiring && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                              <AlertTriangle className="h-2.5 w-2.5" />Expiring soon
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                          {doc.file_size && <span>{fmtSize(doc.file_size)}</span>}
                          {doc.expiry_date && <span>Expires {new Date(doc.expiry_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                          <span>Uploaded {new Date(doc.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          {vstatus === 'verified' && doc.verified_at && <span className="text-green-600 font-semibold">Verified {new Date(doc.verified_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>}
                        </div>
                        {vstatus === 'rejected' && doc.rejection_reason && (
                          <p className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                            <XCircle className="h-3 w-3 shrink-0" />Reason: {doc.rejection_reason}
                          </p>
                        )}
                        {doc.notes && <p className="text-[11px] text-muted-foreground italic mt-0.5 truncate">{doc.notes}</p>}
                      </div>
                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:bg-primary/10" onClick={() => handleView(doc)} title="View" data-testid={`button-view-doc-${doc.id}`}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-primary hover:bg-primary/10" onClick={() => handleView(doc)} title="Download" data-testid={`button-download-doc-${doc.id}`}><Download className="h-3.5 w-3.5" /></Button>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" disabled={isDeleting} onClick={() => handleDelete(doc)} title="Delete" data-testid={`button-delete-doc-${doc.id}`}>
                            {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* ── HR Verification toolbar (admin, pending/rejected only) */}
                    {isAdmin && (vstatus === 'pending' || vstatus === 'rejected') && (
                      <div className="border-t border-border/40 bg-muted/20 px-4 py-2.5 flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mr-1">HR Review:</span>
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white"
                          disabled={isVerifying}
                          onClick={() => handleVerify(doc)}
                          data-testid={`button-verify-doc-${doc.id}`}
                        >
                          {isVerifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Mark Verified
                        </Button>
                        {!showRejectBox ? (
                          <Button
                            size="sm" variant="outline"
                            className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => setExpandedReject(doc.id)}
                            data-testid={`button-reject-doc-${doc.id}`}
                          >
                            <XCircle className="h-3 w-3" />Reject
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <Input
                              value={rejectReason[doc.id] || ''}
                              onChange={e => setRejectReason(p => ({ ...p, [doc.id]: e.target.value }))}
                              placeholder="Rejection reason (optional)…"
                              className="h-7 text-xs flex-1"
                              autoFocus
                            />
                            <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white gap-1 shrink-0" disabled={isRejecting} onClick={() => handleReject(doc)}>
                              {isRejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Confirm
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => { setExpandedReject(null); setRejectReason(p => { const n = { ...p }; delete n[doc.id]; return n; }); }}><X className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── Verified footer with reset option */}
                    {isAdmin && vstatus === 'verified' && (
                      <div className="border-t border-green-100 dark:border-green-900/40 bg-green-50/50 dark:bg-green-950/10 px-4 py-2 flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <span className="text-[11px] text-green-700 dark:text-green-400 font-semibold flex-1">Verified by HR</span>
                        <button type="button" onClick={() => handleResetToPending(doc)} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2">
                          Reset to pending
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
