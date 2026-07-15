import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, X, Loader2, Award, BookOpen, Shield, GraduationCap, Wrench, Edit, Trash2, ExternalLink } from "lucide-react";
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
  { value: "training",      label: "Training",       Icon: BookOpen,      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "certification", label: "Certification",  Icon: Award,         color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  { value: "license",       label: "License",        Icon: Shield,        color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  { value: "course",        label: "Course",         Icon: GraduationCap, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "workshop",      label: "Workshop",       Icon: Wrench,        color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
];

const EMPTY = { title: "", issuing_org: "", cert_type: "training", issue_date: "", expiry_date: "", cert_number: "", file_url: "", notes: "" };

const fmtDate = (d: string | null) => {
  if (!d) return null;
  try { const p = parseISO(d); return isValid(p) ? format(p, "dd MMM yyyy") : d; }
  catch { return d; }
};

const expiryBadge = (expiry: string | null) => {
  if (!expiry) return null;
  try {
    const days = differenceInDays(parseISO(expiry), new Date());
    if (days < 0) return { label: "Expired", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
    if (days <= 30) return { label: `${days}d left`, cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
    if (days <= 90) return { label: `${days}d left`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
    return { label: `${days}d left`, cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" };
  } catch { return null; }
};

export default function EmployeeTrainingTab({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const { toast } = useToast();
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setF = (k: string, v: string) => setForm(f => f ? { ...f, [k]: v } : f);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("staff_certifications")
      .select("*")
      .eq("user_id", userId)
      .order("issue_date", { ascending: false });
    setCerts(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const openAdd = () => { setEditId(null); setForm({ ...EMPTY }); };
  const openEdit = (c: Cert) => {
    setEditId(c.id);
    setForm({ title: c.title, issuing_org: c.issuing_org || "", cert_type: c.cert_type, issue_date: c.issue_date || "", expiry_date: c.expiry_date || "", cert_number: c.cert_number || "", file_url: c.file_url || "", notes: c.notes || "" });
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
    const { error } = await supabase.from("staff_certifications").delete().eq("id", id);
    if (error) { toast({ title: "Delete failed", description: error.message, variant: "destructive" }); return; }
    setCerts(c => c.filter(x => x.id !== id));
    toast({ title: "Record removed" });
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">

      {/* Header row */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Award className="h-4 w-4 text-purple-500" /> Training & Certifications
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{certs.length} record{certs.length !== 1 ? "s" : ""} on file</p>
        </div>
        {isAdmin && (
          <Button
            size="sm"
            variant={form ? "ghost" : "outline"}
            className={`gap-1.5 text-xs ${form ? "text-muted-foreground hover:text-foreground" : ""}`}
            onClick={form ? cancel : openAdd}
            data-testid="button-add-cert"
          >
            {form ? <><X className="h-3 w-3" /> Cancel</> : <><Plus className="h-3 w-3" /> Add Record</>}
          </Button>
        )}
      </div>

      {/* Add / Edit form */}
      {form && (
        <div className="border border-primary/20 bg-primary/5 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold">{editId ? "Edit Record" : "Add New Record"}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">Title *</label>
              <Input value={form.title} onChange={e => setF("title", e.target.value)} placeholder="e.g. OCHA Humanitarian Coordination Training" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={form.cert_type} onValueChange={v => setF("cert_type", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CERT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Issuing Organization</label>
              <Input value={form.issuing_org} onChange={e => setF("issuing_org", e.target.value)} placeholder="UN, OCHA, Red Cross…" className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Issue Date</label>
              <Input type="date" value={form.issue_date} onChange={e => setF("issue_date", e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Expiry Date</label>
              <Input type="date" value={form.expiry_date} onChange={e => setF("expiry_date", e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">Certificate / Reference No.</label>
              <Input value={form.cert_number} onChange={e => setF("cert_number", e.target.value)} placeholder="Optional" className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-2 space-y-1">
              <label className="text-xs text-muted-foreground">Certificate URL / Link</label>
              <Input value={form.file_url} onChange={e => setF("file_url", e.target.value)} placeholder="https://… certificate or document link" className="h-9 text-sm" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3 space-y-1">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Optional notes" className="h-9 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-1 border-t border-border/40">
            <Button size="sm" onClick={save} disabled={saving || !form.title.trim()} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {editId ? "Save Changes" : "Add Record"}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Records list */}
      {certs.length === 0 && !form ? (
        <div className="text-center py-12 border rounded-xl border-dashed bg-muted/5">
          <Award className="h-7 w-7 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No training or certification records yet.</p>
          {isAdmin && (
            <Button size="sm" variant="outline" className="mt-3 gap-1.5 text-xs" onClick={openAdd} data-testid="button-add-cert-empty">
              <Plus className="h-3 w-3" /> Add First Record
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {certs.map(c => {
            const typeInfo = CERT_TYPES.find(t => t.value === c.cert_type) || CERT_TYPES[0];
            const expiry = expiryBadge(c.expiry_date);
            return (
              <div key={c.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-border/40 bg-background hover:border-border/70 hover:shadow-sm transition-all">
                <div className={`p-2 rounded-lg ${typeInfo.color} shrink-0 mt-0.5`}>
                  <typeInfo.Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                    <span className="font-semibold text-sm">{c.title}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.label}</span>
                    {expiry && <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${expiry.cls}`}>{expiry.label}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                    {c.issuing_org && <span>{c.issuing_org}</span>}
                    {c.issue_date && <span>Issued {fmtDate(c.issue_date)}</span>}
                    {c.expiry_date && <span>· Expires {fmtDate(c.expiry_date)}</span>}
                    {c.cert_number && <span>· #{c.cert_number}</span>}
                  </p>
                  {c.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{c.notes}</p>}
                  {c.file_url && (
                    <a href={c.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-0.5">
                      <ExternalLink className="h-3 w-3" /> View Certificate
                    </a>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => openEdit(c)} data-testid={`button-edit-cert-${c.id}`}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600" onClick={() => remove(c.id)} data-testid={`button-delete-cert-${c.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
