import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, Download, Trash2, Loader2, FileText, Eye, Plus, X, CreditCard, User, FileImage, Briefcase, BookOpen, Globe, Shield } from "lucide-react";
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
}

const DOC_TYPE_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  national_id:         { label: 'National ID',          icon: <CreditCard className="h-4 w-4" />,  color: 'bg-blue-100 text-blue-700' },
  passport:            { label: 'Passport',              icon: <Globe className="h-4 w-4" />,        color: 'bg-indigo-100 text-indigo-700' },
  photo:               { label: 'Photo',                 icon: <User className="h-4 w-4" />,         color: 'bg-green-100 text-green-700' },
  cv:                  { label: 'CV',                    icon: <FileText className="h-4 w-4" />,     color: 'bg-purple-100 text-purple-700' },
  resume:              { label: 'Resume',                icon: <FileText className="h-4 w-4" />,     color: 'bg-violet-100 text-violet-700' },
  academic_certificate:{ label: 'Academic Certificate',  icon: <BookOpen className="h-4 w-4" />,     color: 'bg-amber-100 text-amber-700' },
  work_permit:         { label: 'Work Permit',           icon: <Briefcase className="h-4 w-4" />,   color: 'bg-orange-100 text-orange-700' },
  reference_letter:    { label: 'Reference Letter',      icon: <FileText className="h-4 w-4" />,     color: 'bg-teal-100 text-teal-700' },
  medical_certificate: { label: 'Medical Certificate',   icon: <Shield className="h-4 w-4" />,       color: 'bg-red-100 text-red-700' },
  police_clearance:    { label: 'Police Clearance',      icon: <Shield className="h-4 w-4" />,       color: 'bg-slate-100 text-slate-700' },
  other:               { label: 'Other Document',        icon: <FileImage className="h-4 w-4" />,    color: 'bg-gray-100 text-gray-700' },
};

function fmtSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isExpiringSoon(expiry?: string | null) {
  if (!expiry) return false;
  const days = (new Date(expiry).getTime() - Date.now()) / 86400000;
  return days < 30;
}

export default function EmployeeDocumentsTab({ userId, isAdmin, currentUserId }: {
  userId: string; isAdmin: boolean; currentUserId?: string;
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
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('hr_employee_documents')
      .select('*')
      .eq('profile_id', userId)
      .order('created_at', { ascending: false });
    setDocs(data || []);
    setLoading(false);
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
      });
      if (insErr) throw insErr;
      toast({ title: 'Document uploaded', description: file.name });
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

  // Group docs by type
  const grouped = Object.keys(DOC_TYPE_META).reduce((acc, type) => {
    const list = docs.filter(d => d.doc_type === type);
    if (list.length > 0) acc[type] = list;
    return acc;
  }, {} as Record<string, HrDoc[]>);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-base">Document Vault</h3>
          <p className="text-xs text-muted-foreground">ID documents, CV, certificates, and other official files</p>
        </div>
        {isAdmin && !showUpload && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowUpload(true)} data-testid="button-upload-document">
            <Plus className="h-3.5 w-3.5" /> Upload Document
          </Button>
        )}
      </div>

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
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
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
            <span className="text-xs text-muted-foreground">PDF, image, or Word doc</span>
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" onChange={handleUpload} />
        </div>
      )}

      {/* Document grid by category */}
      {docs.length === 0 && !showUpload && (
        <div className="text-center py-12 text-muted-foreground text-sm border rounded-xl border-dashed bg-muted/5">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
          No documents uploaded yet.<br />
          <span className="text-xs">Upload the employee's ID, CV, certificates, and more.</span>
        </div>
      )}

      {Object.entries(grouped).map(([type, list]) => {
        const meta = DOC_TYPE_META[type] || DOC_TYPE_META.other;
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`p-1.5 rounded-lg ${meta.color}`}>{meta.icon}</span>
              <h4 className="text-sm font-semibold">{meta.label}</h4>
              <Badge variant="secondary" className="text-xs">{list.length}</Badge>
            </div>
            <div className="space-y-2 pl-1">
              {list.map(doc => {
                const expiring = isExpiringSoon(doc.expiry_date);
                const isDeleting = deletingId === doc.id;
                return (
                  <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-background hover:border-border/70 transition-colors">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{doc.doc_name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        {doc.file_size && <span>{fmtSize(doc.file_size)}</span>}
                        {doc.expiry_date && (
                          <span className={expiring ? 'text-red-600 font-semibold' : ''}>
                            Expires: {new Date(doc.expiry_date).toLocaleDateString()}
                            {expiring && ' ⚠️'}
                          </span>
                        )}
                        <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                        {doc.notes && <span className="italic truncate max-w-[200px]">{doc.notes}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-primary hover:bg-primary/10" onClick={() => handleView(doc)} title="View / Download" data-testid={`button-view-doc-${doc.id}`}>
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
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
