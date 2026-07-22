import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, X, Loader2, Award, BookOpen, Shield, GraduationCap, Wrench,
  Edit, Trash2, Download, ExternalLink, Save,
} from "lucide-react";
import { format, parseISO, isValid, differenceInDays } from "date-fns";

interface Cert {
  id: string;
  title: string;
  issuing_org: string | null;
  cert_type: string;
  issue_date: string | null;
  expiry_date: string | null;
  cert_number: string | null;
  file_url: string | null;
  notes: string | null;
  status: string;
}

const CERT_TYPES = [
  { value: "training",      label: "Training",       Icon: BookOpen,      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",          stripe: "bg-blue-400" },
  { value: "certification", label: "Certification",  Icon: Award,         color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",  stripe: "bg-purple-400" },
  { value: "license",       label: "License",        Icon: Shield,        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", stripe: "bg-emerald-400" },
  { value: "course",        label: "Course",         Icon: GraduationCap, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",  stripe: "bg-orange-400" },
  { value: "workshop",      label: "Workshop",       Icon: Wrench,        color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",           stripe: "bg-teal-400" },
];

const EMPTY = {
  title: "", issuing_org: "", cert_type: "training",
  issue_date: "", expiry_date: "", cert_number: "", file_url: "", notes: "",
};

const fmtDate = (d: string | null) => {
  if (!d) return null;
  try { const p = parseISO(d); return isValid(p) ? format(p, "dd MMM yyyy") : d; }
  catch { return d; }
};

const expiryBadge = (expiry: string | null) => {
  if (!expiry) return null;
  try {
    const days = differenceInDays(parseISO(expiry), new Date());
    if (days < 0)   return { label: "Expired",      cls: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700" };
    if (days <= 30) return { label: `${days}d left`, cls: "bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700" };
    if (days <= 90) return { label: `${days}d left`, cls: "bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700" };
    return { label: `${days}d left`, cls: "bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700" };
  } catch { return null; }
};

export default function EmployeeTrainingTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const setF = (k: string, v: string) => setForm(f => f ? { ...f, [k]: v } : f);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("staff_certifications")
      .select("*")
      .eq("user_id", userId)
      .order("issue_date", { ascending: false });
    if (error) console.warn("[EmployeeTrainingTab] fetch error:", error.message);
    setCerts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  useEffect(() => {
    if (form) setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [!!form]);

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY }); };
  const openEdit = (c: Cert) => {
    setEditId(c.id);
    setForm({
      title: c.title, issuing_org: c.issuing_org || "", cert_type: c.cert_type,
      issue_date: c.issue_date || "", expiry_date: c.expiry_date || "",
      cert_number: c.cert_number || "", file_url: c.file_url || "", notes: c.notes || "",
    });
  };
  const cancel = () => { setForm(null); setEditId(null); };

  const save = async () => {
    if (!form?.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: any = {
        user_id: userId,
        title: form.title.trim(),
        issuing_org: form.issuing_org.trim() || null,
        cert_type: form.cert_type,
        issue_date: form.issue_date || null,
        expiry_date: form.expiry_date || null,
        cert_number: form.cert_number.trim() || null,
        file_url: form.file_url.trim() || null,
        notes: form.notes.trim() || null,
        status: "active",
      };
      if (editId) {
        const { error } = await supabase.from("staff_certifications").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff_certifications").insert(payload);
        if (error) throw error;
      }
      toast({ title: editId ? "Record updated" : "Record added" });
      cancel();
      await load();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("staff_certifications").delete().eq("id", id);
      if (error) throw error;
      setCerts(c => c.filter(x => x.id !== id));
      toast({ title: "Record removed" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally { setDeletingId(null); }
  };

  const handleDownload = async (cert: Cert) => {
    if (!cert.file_url) return;
    setDownloadingId(cert.id);
    try {
      const filename = cert.title + (cert.cert_number ? `_${cert.cert_number}` : "");
      const response = await fetch(cert.file_url, { mode: "cors" });
      if (response.ok) {
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
      } else {
        window.open(cert.file_url, "_blank");
      }
    } catch {
      window.open(cert.file_url, "_blank");
    } finally { setDownloadingId(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-primary/10 text-primary shrink-0">
            <Award className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-bold text-sm">Training & Certifications</h3>
            <p className="text-xs text-muted-foreground">
              {certs.length} record{certs.length !== 1 ? "s" : ""} on file
            </p>
          </div>
        </div>
        {isAdmin && !form && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={openAdd} data-testid="button-add-cert">
            <Plus className="h-3 w-3" /> Add Record
          </Button>
        )}
        {form && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground" onClick={cancel}>
            <X className="h-3 w-3" /> Cancel
          </Button>
        )}
      </div>

      {/* ── Add / Edit form ──────────────────────────────────────────────────── */}
      {form && (
        <div ref={formRef} className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold">{editId ? "Edit Record" : "Add New Record"}</h4>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={cancel}><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-foreground/70">Title <span className="text-destructive">*</span></label>
              <Input value={form.title} onChange={e => setF("title", e.target.value)} placeholder="e.g. OCHA Humanitarian Coordination Training" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground/70">Type</label>
              <Select value={form.cert_type} onValueChange={v => setF("cert_type", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CERT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground/70">Issuing Organization</label>
              <Input value={form.issuing_org} onChange={e => setF("issuing_org", e.target.value)} placeholder="UN, OCHA, Red Cross…" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground/70">Issue Date</label>
              <Input type="date" value={form.issue_date} onChange={e => setF("issue_date", e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-foreground/70">Expiry Date</label>
              <Input type="date" value={form.expiry_date} onChange={e => setF("expiry_date", e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <label className="block text-xs font-semibold text-foreground/70">Certificate / Reference No.</label>
              <Input value={form.cert_number} onChange={e => setF("cert_number", e.target.value)} placeholder="Optional reference number" className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-2 lg:col-span-1 space-y-1.5">
              <label className="block text-xs font-semibold text-foreground/70">Certificate URL / Link</label>
              <Input value={form.file_url} onChange={e => setF("file_url", e.target.value)} placeholder="https://… certificate link" className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 space-y-1.5">
              <label className="block text-xs font-semibold text-foreground/70">Notes</label>
              <Input value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Optional notes" className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t border-border/40">
            <Button size="sm" onClick={save} disabled={saving || !form.title.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3 w-3" />}
              {editId ? "Save Changes" : "Add Record"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────────── */}
      {certs.length === 0 && !form && (
        <div className="text-center py-12 border rounded-xl border-dashed bg-muted/5">
          <Award className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No training or certification records yet.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add training courses, professional certifications, licenses, and workshops.</p>
          {isAdmin && (
            <Button size="sm" variant="outline" className="mt-4 gap-1.5 text-xs" onClick={openAdd} data-testid="button-add-cert-empty">
              <Plus className="h-3 w-3" /> Add First Record
            </Button>
          )}
        </div>
      )}

      {/* ── Records list ─────────────────────────────────────────────────────── */}
      {certs.length > 0 && (
        <div className="space-y-2">
          {certs.map(c => {
            const typeInfo = CERT_TYPES.find(t => t.value === c.cert_type) || CERT_TYPES[0];
            const expiry   = expiryBadge(c.expiry_date);
            const isDeleting   = deletingId === c.id;
            const isDownloading = downloadingId === c.id;
            return (
              <div
                key={c.id}
                className="flex items-stretch gap-0 rounded-xl border border-border/40 bg-background hover:border-border/70 hover:shadow-sm transition-all overflow-hidden"
              >
                {/* Left accent stripe */}
                <div className={`w-1 shrink-0 ${typeInfo.stripe}`} />

                <div className="flex items-start gap-3.5 px-4 py-3.5 flex-1 min-w-0">
                  {/* Type icon */}
                  <div className={`p-2 rounded-lg ${typeInfo.color} shrink-0 mt-0.5`}>
                    <typeInfo.Icon className="h-3.5 w-3.5" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title row + badges */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                      <span className="font-semibold text-sm">{c.title}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                      {expiry && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${expiry.cls}`}>
                          {expiry.label}
                        </span>
                      )}
                    </div>

                    {/* Meta row */}
                    <p className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-2 gap-y-0.5">
                      {c.issuing_org && <span className="font-medium text-foreground/70">{c.issuing_org}</span>}
                      {c.issue_date  && <span>Issued {fmtDate(c.issue_date)}</span>}
                      {c.expiry_date && <span>· Expires {fmtDate(c.expiry_date)}</span>}
                      {c.cert_number && <span className="font-mono">· #{c.cert_number}</span>}
                    </p>

                    {c.notes && <p className="text-xs text-muted-foreground italic mt-1">{c.notes}</p>}

                    {/* Action buttons (View / Download) */}
                    {c.file_url && (
                      <div className="flex items-center gap-2 mt-2">
                        <a
                          href={c.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 border border-primary/20 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 rounded-md transition-colors"
                        >
                          <ExternalLink className="h-3 w-3" /> View Certificate
                        </a>
                        <button
                          onClick={() => handleDownload(c)}
                          disabled={isDownloading}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border/60 bg-muted/30 hover:bg-muted/60 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                          title="Download certificate"
                        >
                          {isDownloading
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Download className="h-3 w-3" />}
                          {isDownloading ? "Downloading…" : "Download"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Admin actions */}
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0 ml-2">
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(c)}
                        data-testid={`button-edit-cert-${c.id}`}
                        title="Edit"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost" size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                        onClick={() => remove(c.id)}
                        disabled={isDeleting}
                        data-testid={`button-delete-cert-${c.id}`}
                        title="Delete"
                      >
                        {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
