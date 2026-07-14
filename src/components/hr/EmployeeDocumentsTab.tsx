import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, Download, Trash2, Loader2, FileText, Eye, Plus, X,
  CreditCard, User, FileImage, Briefcase, BookOpen, Globe, Shield,
  CheckCircle2, XCircle, Clock, AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
  national_id:          { label: 'National ID',          icon: <CreditCard className="h-4 w-4" />,  color: 'bg-blue-100 text-blue-700',    required: true },
  passport:             { label: 'Passport',              icon: <Globe className="h-4 w-4" />,        color: 'bg-indigo-100 text-indigo-700', required: false },
  photo:                { label: 'Personal Photo (ID)',   icon: <User className="h-4 w-4" />,         color: 'bg-green-100 text-green-700',   required: true },
  cv:                   { label: 'CV',                    icon: <FileText className="h-4 w-4" />,     color: 'bg-purple-100 text-purple-700', required: true },
  resume:               { label: 'Resume',                icon: <FileText className="h-4 w-4" />,     color: 'bg-violet-100 text-violet-700', required: false },
  academic_certificate: { label: 'Academic Certificate',  icon: <BookOpen className="h-4 w-4" />,     color: 'bg-amber-100 text-amber-700',   required: false },
  work_permit:          { label: 'Work Permit',           icon: <Briefcase className="h-4 w-4" />,   color: 'bg-orange-100 text-orange-700', required: false },
  reference_letter:     { label: 'Reference Letter',      icon: <FileText className="h-4 w-4" />,     color: 'bg-teal-100 text-teal-700',    required: false },
  medical_certificate:  { label: 'Medical Certificate',   icon: <Shield className="h-4 w-4" />,       color: 'bg-red-100 text-red-700',      required: false },
  police_clearance:     { label: 'Police Clearance',      icon: <Shield className="h-4 w-4" />,       color: 'bg-slate-100 text-slate-700',  required: false },
  other:                { label: 'Other Document',        icon: <FileImage className="h-4 w-4" />,    color: 'bg-gray-100 text-gray-700',    required: false },
};

const VERIFICATION_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending:  { label: 'Pending Review', color: 'bg-amber-100 text-amber-700 border-amber-200',  icon: <Clock className="h-3 w-3" /> },
  verified: { label: 'Verified',       color: 'bg-green-100 text-green-700 border-green-200',  icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: 'Rejected',       color: 'bg-red-100 text-red-700 border-red-200',        icon: <XCircle className="h-3 w-3" /> },
};

function fmtSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExpiringSoon(expiry?: string | null) {
  if (!expiry) return false;
  return (new Date(expiry).getTime() - Date.now()) / 86400000 < 30;
}

export default function EmployeeDocumentsTab({
  userId, isAdmin, currentUserId, onVerificationChange,
}: {
  userId: string;
  isAdmin: boolean;
  currentUserId?: string;
  onVerificationChange?: (allVerified: boolean, verifiedCount: number, totalCount: number) => void;
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
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hr_employee_documents')
      .select('*')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false });
    const list = data || [];
    setDocs(list);
    setLoading(false);
    if (onVerificationChange) {
      const total = list.length;
      const verified = list.filter(d => d.verification_status === 'verified').length;
      onVerificationChange(total > 0 && verified === total, verified, total);
    }
  };

  useEffect(() => { load(); }, [userId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `${userId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('staff-contracts').upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from('hr_employee_documents').insert({
        profile_id: userId,
        doc_type: uploadType,
        doc_name: file.name,
        file_path: path,
        file_size: file.size,
        file_mime: file.type || null,
        expiry_date: uploadExpiry || null,
        notes: uploadNotes.trim() || null,
        uploaded_by: currentUserId || null,
        verification_status: 'pending',
      });
      if (insErr) throw insErr;
      toast({ title: 'Document uploaded', description: `${file.name} — awaiting HR verification` });
      setShowUpload(false);
      setUploadNotes('');
      setUploadExpiry('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
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
      setDocs(p => p.filter(d => d.id !== doc.id));
      toast({ title: 'Document deleted' });
    } catch (e: any) {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleVerify = async (doc: HrDoc) => {
    setVerifyingId(doc.id);
    try {
      const { error } = await supabase.from('hr_employee_documents').update({
        verification_status: 'verified',
        verified_by: currentUserId || null,
        verified_at: new Date().toISOString(),
        rejection_reason: null,
      }).eq('id', doc.id);
      if (error) throw error;
      setDocs(p => p.map(d => d.id === doc.id
        ? { ...d, verification_status: 'verified', verified_by: currentUserId, verified_at: new Date().toISOString(), rejection_reason: null }
        : d));
      toast({ title: 'Document verified', description: doc.doc_name });
      const updated = docs.map(d => d.id === doc.id ? { ...d, verification_status: 'verified' } : d);
      if (onVerificationChange) {
        const verified = updated.filter(d => d.verification_status === 'verified').length;
        onVerificationChange(verified === updated.length && updated.length > 0, verified, updated.length);
      }
    } catch (e: any) {
      toast({ title: 'Verify failed', description: e.message, variant: 'destructive' });
    } finally {
      setVerifyingId(null);
    }
  };

  const handleReject = async (doc: HrDoc) => {
    const reason = rejectReason[doc.id] || '';
    setRejectingId(doc.id);
    try {
      const { error } = await supabase.from('hr_employee_documents').update({
        verification_status: 'rejected',
        verified_by: currentUserId || null,
        verified_at: new Date().toISOString(),
        rejection_reason: reason || null,
      }).eq('id', doc.id);
      if (error) throw error;
      setDocs(p => p.map(d => d.id === doc.id
        ? { ...d, verification_status: 'rejected', rejection_reason: reason }
        : d));
      setRejectReason(p => { const next = { ...p }; delete next[doc.id]; return next; });
      toast({ title: 'Document rejected', description: doc.doc_name });
    } catch (e: any) {
      toast({ title: 'Reject failed', description: e.message, variant: 'destructive' });
    } finally {
      setRejectingId(null);
    }
  };

  const handleResetToPending = async (doc: HrDoc) => {
    try {
      const { error } = await supabase.from('hr_employee_documents').update({
        verification_status: 'pending',
        verified_by: null,
        verified_at: null,
        rejection_reason: null,
      }).eq('id', doc.id);
      if (error) throw error;
      setDocs(p => p.map(d => d.id === doc.id
        ? { ...d, verification_status: 'pending', verified_by: null, verified_at: null, rejection_reason: null }
        : d));
      toast({ title: 'Reset to pending' });
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base">Document Vault</h3>
          <p className="text-xs text-muted-foreground">ID documents, CV, certificates, and other official files</p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowUpload(true)} data-testid="button-upload-document">
          <Plus className="h-3.5 w-3.5" /> Upload Document
        </Button>
      </div>

      {/* Verification summary banner */}
      {docs.length > 0 && (
        <div className={`rounded-xl p-4 border flex items-center gap-4 flex-wrap ${
          allVerified
            ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800'
            : rejectedCount > 0
              ? 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800'
              : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
        }`}>
          {allVerified
            ? <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            : rejectedCount > 0
              ? <XCircle className="h-5 w-5 text-red-600 shrink-0" />
              : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          }
          <div className="flex-1">
            <p className={`text-sm font-semibold ${allVerified ? 'text-green-800 dark:text-green-300' : rejectedCount > 0 ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
              {allVerified ? 'All documents verified — account can be activated' : rejectedCount > 0 ? `${rejectedCount} document(s) rejected — employee must re-upload` : `${pendingCount} document(s) pending HR verification`}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {verifiedCount} verified · {pendingCount} pending · {rejectedCount} rejected · {docs.length} total
            </p>
          </div>
          {/* Progress bar */}
          <div className="w-full sm:w-32 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${allVerified ? 'bg-green-500' : rejectedCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}
              style={{ width: docs.length > 0 ? `${(verifiedCount / docs.length) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Upload form */}
      {showUpload && (
        <div className="border rounded-xl p-4 bg-muted/10 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Upload New Document</h4>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowUpload(false)}><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Document Type *</label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}{v.required ? ' *' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Expiry Date (if applicable)</label>
              <Input type="date" value={uploadExpiry} onChange={e => setUploadExpiry(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} placeholder="Optional notes about this document" className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="button-select-file">
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {uploading ? 'Uploading…' : 'Choose File & Upload'}
            </Button>
            <span className="text-xs text-muted-foreground">PDF, image, or Word doc · Required types marked *</span>
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" onChange={handleUpload} />
        </div>
      )}

      {/* Empty state */}
      {docs.length === 0 && !showUpload && (
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-xl border-dashed bg-muted/5">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No documents uploaded yet.<br />
          <span className="text-xs">Upload the employee's ID, CV, certificates, and more.</span>
        </div>
      )}

      {/* Document grid by category */}
      {Object.entries(grouped).map(([type, list]) => {
        const meta = DOC_TYPE_META[type] || DOC_TYPE_META.other;
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`p-1.5 rounded-lg ${meta.color}`}>{meta.icon}</span>
              <h4 className="text-sm font-semibold">{meta.label}</h4>
              <Badge variant="secondary" className="text-xs">{list.length}</Badge>
              {meta.required && <Badge className="text-xs bg-red-100 text-red-700 border-red-200">Required</Badge>}
            </div>
            <div className="space-y-2 pl-1">
              {list.map(doc => {
                const expiring = isExpiringSoon(doc.expiry_date);
                const isDeleting = deletingId === doc.id;
                const isVerifying = verifyingId === doc.id;
                const isRejecting = rejectingId === doc.id;
                const vstatus = doc.verification_status || 'pending';
                const vmeta = VERIFICATION_META[vstatus] || VERIFICATION_META.pending;
                const showRejectInput = rejectReason.hasOwnProperty(doc.id);

                return (
                  <div key={doc.id} className="rounded-xl border border-border/40 bg-background hover:border-border/70 transition-colors overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">{doc.doc_name}</p>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${vmeta.color}`}>
                            {vmeta.icon} {vmeta.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                          {doc.file_size && <span>{fmtSize(doc.file_size)}</span>}
                          {doc.expiry_date && (
                            <span className={expiring ? 'text-red-600 font-semibold' : ''}>
                              Expires: {new Date(doc.expiry_date).toLocaleDateString()}{expiring && ' ⚠️'}
                            </span>
                          )}
                          <span>Uploaded: {new Date(doc.created_at).toLocaleDateString()}</span>
                          {vstatus === 'verified' && doc.verified_at && (
                            <span className="text-green-600">Verified: {new Date(doc.verified_at).toLocaleDateString()}</span>
                          )}
                        </div>
                        {vstatus === 'rejected' && doc.rejection_reason && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Reason: {doc.rejection_reason}
                          </p>
                        )}
                        {doc.notes && <p className="text-xs text-muted-foreground italic mt-0.5 truncate">{doc.notes}</p>}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-primary hover:bg-primary/10" onClick={() => handleView(doc)} title="View" data-testid={`button-view-doc-${doc.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-primary hover:bg-primary/10" onClick={() => handleView(doc)} title="Download" data-testid={`button-download-doc-${doc.id}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50" disabled={isDeleting} onClick={() => handleDelete(doc)} title="Delete" data-testid={`button-delete-doc-${doc.id}`}>
                            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* HR Verification Actions (admin only, shown when pending or rejected) */}
                    {isAdmin && (vstatus === 'pending' || vstatus === 'rejected') && (
                      <div className="border-t border-border/40 bg-muted/10 px-3 py-2 flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">HR Action:</span>
                        <Button
                          size="sm"
                          className="h-7 gap-1 text-xs bg-green-600 hover:bg-green-700 text-white"
                          disabled={isVerifying}
                          onClick={() => handleVerify(doc)}
                          data-testid={`button-verify-doc-${doc.id}`}
                        >
                          {isVerifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                          Mark Verified
                        </Button>
                        {!showRejectInput ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setRejectReason(p => ({ ...p, [doc.id]: '' }))}
                            data-testid={`button-reject-doc-${doc.id}`}
                          >
                            <XCircle className="h-3 w-3" /> Reject
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1.5 flex-1">
                            <Input
                              value={rejectReason[doc.id] || ''}
                              onChange={e => setRejectReason(p => ({ ...p, [doc.id]: e.target.value }))}
                              placeholder="Rejection reason (optional)"
                              className="h-7 text-xs flex-1"
                            />
                            <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white gap-1" disabled={isRejecting} onClick={() => handleReject(doc)}>
                              {isRejecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Confirm
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setRejectReason(p => { const n = { ...p }; delete n[doc.id]; return n; })}><X className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Allow HR to re-open a verified doc */}
                    {isAdmin && vstatus === 'verified' && (
                      <div className="border-t border-border/40 bg-green-50/50 dark:bg-green-950/10 px-3 py-1.5 flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                        <span className="text-xs text-green-700 dark:text-green-400 flex-1">Verified by HR</span>
                        <button
                          type="button"
                          onClick={() => handleResetToPending(doc)}
                          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
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
