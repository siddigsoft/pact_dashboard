import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { searchUserDirectory, getProfilesByIds, displayNameFromProfile, type UserDirectoryRow } from '@/services/userDirectory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Hub, HubState } from '@/context/location/LocationContext';
import type { IncentiveEligibilityOverride, IncentiveRole } from '@/types/incentive';
import { CONFIGURABLE_INCENTIVE_ROLES } from '@/types/incentive';

type Language = 'en' | 'ar';
type OverrideWithName = IncentiveEligibilityOverride & { userName: string; actualRole: string };
const t = (l: Language, en: string, ar: string) => l === 'ar' ? ar : en;
const roleName = (l: Language, role: IncentiveRole | string) => ({ coordinator: t(l, 'Coordinator', 'المنسق'), supervisor: t(l, 'Supervisor', 'المشرف'), fom: t(l, 'FOM', 'مدير العمليات الميدانية'), support_team: t(l, 'Support Team', 'فريق الدعم') }[role] ?? role);
const missingMigration = (message: string) => /mmp_incentive_eligibility_overrides|set_mmp_incentive_eligibility_override|does not exist|schema cache/i.test(message);

export function EligibilityRoleRules({ language, hubs, hubStates, toast }: { language: Language; hubs: Hub[]; hubStates: HubState[]; toast: (value: any) => void }) {
  const [filterHub, setFilterHub] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [overrides, setOverrides] = useState<OverrideWithName[]>([]);
  const [tableError, setTableError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserDirectoryRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<UserDirectoryRow | null>(null);
  const [hubId, setHubId] = useState('');
  const [role, setRole] = useState<IncentiveRole>('coordinator');
  const [stateId, setStateId] = useState('');
  const [decision, setDecision] = useState<'include' | 'exclude'>('include');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const states = useMemo(() => hubStates.filter(item => item.hub_id === hubId), [hubId, hubStates]);

  const load = useCallback(async () => {
    setLoading(true); setTableError('');
    let request: any = (supabase.from as any)('mmp_incentive_eligibility_overrides').select('*').is('revoked_at', null).order('created_at', { ascending: false });
    if (filterHub !== 'all') request = request.eq('hub_id', filterHub);
    if (filterRole !== 'all') request = request.eq('role', filterRole);
    const { data, error } = await request;
    if (error) {
      setTableError(missingMigration(error.message) ? t(language, 'Eligibility overrides are unavailable until the MMP eligibility migration is applied.', 'تجاوزات الأهلية غير متاحة حتى يتم تطبيق ترحيل أهلية MMP.') : error.message);
      setLoading(false); return;
    }
    const source = (data ?? []) as IncentiveEligibilityOverride[];
    try {
      const profiles = await getProfilesByIds(source.map(row => row.user_id));
      const names = new Map(profiles.map(profile => [profile.id, profile]));
      setOverrides(source.map(row => ({ ...row, userName: displayNameFromProfile(names.get(row.user_id)), actualRole: names.get(row.user_id)?.role ?? t(language, 'Role unavailable', 'الدور غير متاح') })));
    } catch {
      setOverrides(source.map(row => ({ ...row, userName: row.user_id, actualRole: t(language, 'Role unavailable', 'الدور غير متاح') })));
    }
    setLoading(false);
  }, [filterHub, filterRole, language]);
  useEffect(() => { load(); }, [load]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try { const response = await searchUserDirectory({ search: query.trim(), limit: 12, activeOnly: true }); setResults(response.rows); }
    catch (error: any) { toast({ title: t(language, 'User search failed', 'فشل البحث عن المستخدمين'), description: error.message, variant: 'destructive' }); }
    finally { setSearching(false); }
  };
  const save = async () => {
    if (!selected || !hubId || !note.trim() || (role === 'coordinator' && !stateId)) {
      toast({ title: t(language, 'Complete required fields', 'أكمل الحقول المطلوبة'), description: t(language, 'Choose an active user, hub, decision, audit reason, and a coordinator state when applicable.', 'اختر مستخدماً نشطاً ومركزاً وقراراً وسبب المراجعة وولاية للمنسق عند الاقتضاء.'), variant: 'destructive' }); return;
    }
    setSaving(true);
    const { data, error } = await (supabase.rpc as any)('set_mmp_incentive_eligibility_override', { p_user_id: selected.id, p_hub_id: hubId, p_role: role, p_decision: decision, p_note: note.trim(), p_state_id: role === 'coordinator' ? stateId : null });
    setSaving(false);
    if (error || data?.ok === false) {
      toast({ title: t(language, 'Override was not saved', 'لم يتم حفظ التجاوز'), description: missingMigration(error?.message ?? '') ? t(language, 'Apply the MMP eligibility migration before using this action.', 'طبّق ترحيل أهلية MMP قبل استخدام هذا الإجراء.') : error?.message ?? data?.error, variant: 'destructive' }); return;
    }
    toast({ title: t(language, 'Eligibility decision saved', 'تم حفظ قرار الأهلية'), description: t(language, 'Any matching live decision was replaced and retained in the audit trail.', 'تم استبدال أي قرار ساري مطابق والاحتفاظ به في سجل المراجعة.') });
    setSelected(null); setNote(''); setResults([]); setQuery(''); load();
  };

  return <section className="overflow-hidden rounded-xl border border-[#d8e5e1] bg-white">
    <div className="border-b border-[#e5efec] px-5 py-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-[#178080]" /><h2 className="font-semibold">{t(language, 'Eligibility role rules', 'قواعد أهلية الأدوار')}</h2></div><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">{t(language, 'Coordinator, Supervisor, and FOM eligibility is derived from the staff profile role, additional role, and effective classification, scoped to the selected hub (and state for Coordinator). Support Team is manual-only.', 'تُستمد أهلية المنسق والمشرف ومدير العمليات الميدانية من دور ملف الموظف ودوره الإضافي وتصنيفه الساري، ضمن المركز المحدد (والولاية للمنسق). فريق الدعم يدوي فقط.')}</p></div>
    <div className="grid gap-6 p-5 xl:grid-cols-[.9fr_1.1fr]"><div className="space-y-4 rounded-lg bg-[#f7fbfa] p-4"><div><h3 className="font-semibold">{t(language, 'Audited override', 'تجاوز مدقق')}</h3><p className="mt-1 text-xs text-slate-500">{t(language, 'Saving a matching decision supersedes the live one; no amounts are entered here.', 'حفظ قرار مطابق يستبدل القرار الساري؛ لا تُدخل أي مبالغ هنا.')}</p></div><div><Label>{t(language, 'Find active user', 'البحث عن مستخدم نشط')}</Label><div className="mt-1 flex gap-2"><Input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') runSearch(); }} placeholder={t(language, 'Name or email', 'الاسم أو البريد الإلكتروني')} /><Button type="button" variant="outline" onClick={runSearch} disabled={searching}><Search className="h-4 w-4" /></Button></div>{results.length > 0 && <div className="mt-2 max-h-40 overflow-auto rounded border bg-white">{results.map(user => <button type="button" key={user.id} onClick={() => { setSelected(user); setResults([]); }} className="block w-full border-b px-3 py-2 text-start text-sm hover:bg-[#edf6f3]"><b>{displayNameFromProfile(user)}</b><span className="ms-2 text-xs text-slate-500">{user.email} · {user.role ?? '—'}</span></button>)}</div>}{selected && <p className="mt-2 text-xs text-[#167575]">{t(language, 'Selected:', 'المحدد:')} <b>{displayNameFromProfile(selected)}</b> · {selected.role ?? '—'}</p>}</div>
      <div className="grid gap-3 sm:grid-cols-2"><div><Label>{t(language, 'Hub', 'المركز')}</Label><Select value={hubId} onValueChange={value => { setHubId(value); setStateId(''); }}><SelectTrigger className="mt-1"><SelectValue placeholder={t(language, 'Select hub', 'اختر المركز')} /></SelectTrigger><SelectContent>{hubs.map(hub => <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>)}</SelectContent></Select></div><div><Label>{t(language, 'Incentive role', 'دور الحافز')}</Label><Select value={role} onValueChange={(value: IncentiveRole) => { setRole(value); setStateId(''); }}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{CONFIGURABLE_INCENTIVE_ROLES.map(item => <SelectItem key={item} value={item}>{roleName(language, item)}</SelectItem>)}</SelectContent></Select></div>{role === 'coordinator' && <div><Label>{t(language, 'State in this hub', 'الولاية في هذا المركز')}</Label><Select value={stateId} onValueChange={setStateId}><SelectTrigger className="mt-1"><SelectValue placeholder={t(language, 'Required for Coordinator', 'مطلوبة للمنسق')} /></SelectTrigger><SelectContent>{states.map(state => <SelectItem key={state.state_id} value={state.state_id}>{state.state_name}</SelectItem>)}</SelectContent></Select></div>}<div><Label>{t(language, 'Decision', 'القرار')}</Label><Select value={decision} onValueChange={(value: 'include' | 'exclude') => setDecision(value)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="include">{t(language, 'Include', 'تضمين')}</SelectItem><SelectItem value="exclude">{t(language, 'Exclude', 'استبعاد')}</SelectItem></SelectContent></Select></div></div><div><Label>{t(language, 'Audit reason (required)', 'سبب المراجعة (مطلوب)')}</Label><Input className="mt-1" value={note} onChange={event => setNote(event.target.value)} placeholder={t(language, 'Record why this exception is needed', 'سجّل سبب الحاجة إلى هذا الاستثناء')} /></div><Button type="button" onClick={save} disabled={saving}>{saving ? t(language, 'Saving…', 'جارٍ الحفظ…') : t(language, 'Save eligibility decision', 'حفظ قرار الأهلية')}</Button></div>
      <div><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold">{t(language, 'Live decisions', 'القرارات السارية')}</h3><p className="text-xs text-slate-500">{t(language, 'Only active include/exclude overrides are shown.', 'تظهر تجاوزات التضمين/الاستبعاد السارية فقط.')}</p></div><div className="flex gap-2"><Select value={filterRole} onValueChange={setFilterRole}><SelectTrigger className="w-36"><SelectValue placeholder={t(language, 'All roles', 'كل الأدوار')} /></SelectTrigger><SelectContent><SelectItem value="all">{t(language, 'All roles', 'كل الأدوار')}</SelectItem>{CONFIGURABLE_INCENTIVE_ROLES.map(item => <SelectItem key={item} value={item}>{roleName(language, item)}</SelectItem>)}</SelectContent></Select><Select value={filterHub} onValueChange={setFilterHub}><SelectTrigger className="w-36"><SelectValue placeholder={t(language, 'All hubs', 'كل المراكز')} /></SelectTrigger><SelectContent><SelectItem value="all">{t(language, 'All hubs', 'كل المراكز')}</SelectItem>{hubs.map(hub => <SelectItem key={hub.id} value={hub.id}>{hub.name}</SelectItem>)}</SelectContent></Select></div></div>
        {tableError ? <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" />{tableError}</div> : loading ? <div className="mt-4 h-32 animate-pulse rounded bg-muted" /> : overrides.length ? <div className="mt-4 space-y-2">{overrides.map(item => <article key={item.id} className="rounded-lg border border-[#e1ece8] p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><b className="text-sm">{item.userName}</b><Badge variant="outline" className={item.decision === 'include' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}>{item.decision === 'include' ? t(language, 'Include', 'تضمين') : t(language, 'Exclude', 'استبعاد')}</Badge></div><p className="mt-1 text-slate-600">{t(language, 'Profile role:', 'دور الملف:')} {item.actualRole} · {t(language, 'Incentive role:', 'دور الحافز:')} {roleName(language, item.role)}</p><p className="mt-1 text-slate-600">{hubs.find(hub => hub.id === item.hub_id)?.name ?? item.hub_id}{item.state_id ? ` · ${hubStates.find(state => state.state_id === item.state_id && state.hub_id === item.hub_id)?.state_name ?? item.state_id}` : ''}</p><p className="mt-2 italic text-slate-600">“{item.note}”</p><p className="mt-2 text-slate-400">{new Date(item.created_at).toLocaleDateString(language === 'ar' ? 'ar' : 'en-US')}</p></article>)}</div> : <p className="mt-6 rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">{t(language, 'No live eligibility overrides match these filters.', 'لا توجد تجاوزات أهلية سارية مطابقة لهذه عوامل التصفية.')}</p>}</div></div>
  </section>;
}