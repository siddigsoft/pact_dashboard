import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  Languages, Plus, Loader2, RefreshCw, CheckCircle, AlertTriangle,
  Sparkles, Globe, MapPin, Edit3, Trash2, Check, X, ChevronDown,
  LayoutList, Bot, Settings2, Search, Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
  { code: 'en',  label: 'English',    dir: 'ltr', flag: '🇬🇧' },
  { code: 'ar',  label: 'Arabic',     dir: 'rtl', flag: '🇸🇩' },
  { code: 'fr',  label: 'French',     dir: 'ltr', flag: '🇫🇷' },
  { code: 'es',  label: 'Spanish',    dir: 'ltr', flag: '🇪🇸' },
  { code: 'pt',  label: 'Portuguese', dir: 'ltr', flag: '🇧🇷' },
  { code: 'so',  label: 'Somali',     dir: 'ltr', flag: '🇸🇴' },
  { code: 'ha',  label: 'Hausa',      dir: 'ltr', flag: '🇳🇬' },
  { code: 'sw',  label: 'Swahili',    dir: 'ltr', flag: '🇹🇿' },
  { code: 'am',  label: 'Amharic',    dir: 'ltr', flag: '🇪🇹' },
  { code: 'ti',  label: 'Tigrinya',   dir: 'ltr', flag: '🇪🇷' },
  { code: 'fa',  label: 'Farsi',      dir: 'rtl', flag: '🇮🇷' },
  { code: 'tr',  label: 'Turkish',    dir: 'ltr', flag: '🇹🇷' },
  { code: 'zh',  label: 'Chinese',    dir: 'ltr', flag: '🇨🇳' },
] as const;

type LangCode = typeof SUPPORTED_LANGUAGES[number]['code'];

const REGION_DEFAULTS_PRESET: { country: string; flag: string; lang: LangCode }[] = [
  { country: 'Sudan',           flag: '🇸🇩', lang: 'ar' },
  { country: 'South Sudan',     flag: '🇸🇸', lang: 'en' },
  { country: 'Chad',            flag: '🇹🇩', lang: 'fr' },
  { country: 'Ethiopia',        flag: '🇪🇹', lang: 'am' },
  { country: 'Somalia',         flag: '🇸🇴', lang: 'so' },
  { country: 'Kenya',           flag: '🇰🇪', lang: 'sw' },
  { country: 'Nigeria',         flag: '🇳🇬', lang: 'ha' },
  { country: 'Egypt',           flag: '🇪🇬', lang: 'ar' },
  { country: 'Libya',           flag: '🇱🇾', lang: 'ar' },
  { country: 'Eritrea',         flag: '🇪🇷', lang: 'ti' },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormTranslation {
  id: string;
  form_id: string;
  form_name: string;
  lang_code: LangCode;
  field_key: string;
  source_text: string;
  translated_text: string | null;
  is_ai_generated: boolean;
  ai_reviewed: boolean;
  created_at: string;
  updated_at: string;
}

interface FormLanguageSummary {
  form_id: string;
  form_name: string;
  total_fields: number;
  languages: { lang: LangCode; done: number; total: number; pct: number }[];
}

interface RegionDefault {
  id: string;
  country: string;
  lang_code: LangCode;
}

type TabId = 'overview' | 'editor' | 'ai' | 'regions';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview',           icon: <LayoutList className="w-3.5 h-3.5" /> },
  { id: 'editor',   label: 'Translation Editor', icon: <Edit3 className="w-3.5 h-3.5" /> },
  { id: 'ai',       label: 'AI Assistant',       icon: <Bot className="w-3.5 h-3.5" /> },
  { id: 'regions',  label: 'Region Defaults',    icon: <Globe className="w-3.5 h-3.5" /> },
];

function langLabel(code: string) {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.label ?? code;
}
function langFlag(code: string) {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.flag ?? '🌐';
}
function langDir(code: string): 'ltr' | 'rtl' {
  return (SUPPORTED_LANGUAGES.find(l => l.code === code)?.dir ?? 'ltr') as 'ltr' | 'rtl';
}

function PctBar({ pct, cls }: { pct: number; cls?: string }) {
  const color = pct === 100 ? 'bg-green-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className={cn('flex items-center gap-2', cls)}>
      <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FieldDataLanguages() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab]             = useState<TabId>('overview');
  const [selectedFormId, setSelectedFormId] = useState('');
  const [selectedLang, setSelectedLang]     = useState<LangCode>('ar');
  const [searchQ, setSearchQ]     = useState('');
  const [showAddLang, setShowAddLang]   = useState(false);
  const [addLangFormId, setAddLangFormId] = useState('');
  const [addLangCode, setAddLangCode]   = useState<LangCode>('ar');

  // AI state
  const [aiRunning, setAiRunning]   = useState(false);
  const [aiResults, setAiResults]   = useState<{ field_key: string; source: string; translation: string }[]>([]);
  const [aiEdits, setAiEdits]       = useState<Record<string, string>>({});
  const [aiApproved, setAiApproved] = useState<Set<string>>(new Set());

  // ── Data ─────────────────────────────────────────────────────────────────

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-simple'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_forms').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: translations = [], isLoading: loadingTr, refetch: refetchTr } = useQuery<FormTranslation[]>({
    queryKey: ['fd-translations', selectedFormId, selectedLang],
    queryFn: async () => {
      let q = supabase.from('fd_form_translations').select('*').order('field_key');
      if (selectedFormId) q = q.eq('form_id', selectedFormId);
      if (selectedLang)   q = q.eq('lang_code', selectedLang);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!(selectedFormId && selectedLang),
  });

  const { data: allTranslations = [] } = useQuery<FormTranslation[]>({
    queryKey: ['fd-translations-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_form_translations').select('form_id, form_name, lang_code, field_key, translated_text')
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: regionDefaults = [], isLoading: loadingRegions, refetch: refetchRegions } = useQuery<RegionDefault[]>({
    queryKey: ['fd-region-defaults'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_region_lang_defaults').select('*').order('country');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Derived: overview summaries ───────────────────────────────────────────

  const summaries = useMemo<FormLanguageSummary[]>(() => {
    const byForm: Record<string, Record<string, { done: number; total: number }>> = {};
    for (const t of allTranslations) {
      if (!byForm[t.form_id]) byForm[t.form_id] = {};
      if (!byForm[t.form_id][t.lang_code]) byForm[t.form_id][t.lang_code] = { done: 0, total: 0 };
      byForm[t.form_id][t.lang_code].total++;
      if (t.translated_text) byForm[t.form_id][t.lang_code].done++;
    }
    const formNames: Record<string, string> = {};
    for (const t of allTranslations) formNames[t.form_id] = t.form_name;

    return Object.entries(byForm)
      .filter(([, langs]) => Object.keys(langs).length > 0)
      .map(([form_id, langs]) => ({
        form_id,
        form_name: formNames[form_id] ?? form_id,
        total_fields: Math.max(...Object.values(langs).map(l => l.total)),
        languages: Object.entries(langs).map(([lang, stat]) => ({
          lang: lang as LangCode,
          done: stat.done,
          total: stat.total,
          pct: stat.total === 0 ? 0 : Math.round((stat.done / stat.total) * 100),
        })).sort((a, b) => a.lang.localeCompare(b.lang)),
      }));
  }, [allTranslations]);

  const filteredSummaries = useMemo(() => {
    if (!searchQ) return summaries;
    return summaries.filter(s => s.form_name.toLowerCase().includes(searchQ.toLowerCase()));
  }, [summaries, searchQ]);

  const missingTranslations = useMemo(() =>
    translations.filter(t => !t.translated_text),
  [translations]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveTranslation = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase
        .from('fd_form_translations')
        .update({ translated_text: text, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-translations'] });
      qc.invalidateQueries({ queryKey: ['fd-translations-all'] });
    },
    onError: (e: any) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const approveAiTranslations = useMutation({
    mutationFn: async (items: { field_key: string; text: string }[]) => {
      const rows = items.map(item => {
        const existing = translations.find(t => t.field_key === item.field_key);
        if (existing) {
          return supabase
            .from('fd_form_translations')
            .update({ translated_text: item.text, is_ai_generated: true, ai_reviewed: true, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        }
        return supabase.from('fd_form_translations').upsert({
          form_id: selectedFormId,
          form_name: forms.find(f => f.id === selectedFormId)?.name ?? '',
          lang_code: selectedLang,
          field_key: item.field_key,
          source_text: aiResults.find(r => r.field_key === item.field_key)?.source ?? '',
          translated_text: item.text,
          is_ai_generated: true,
          ai_reviewed: true,
        });
      });
      await Promise.all(rows.map(r => r));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-translations'] });
      qc.invalidateQueries({ queryKey: ['fd-translations-all'] });
      setAiResults([]);
      setAiEdits({});
      setAiApproved(new Set());
      toast({ title: 'AI translations saved', description: `${aiApproved.size} translation(s) applied.` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const saveRegionDefault = useMutation({
    mutationFn: async ({ country, lang_code }: { country: string; lang_code: LangCode }) => {
      const { error } = await supabase
        .from('fd_region_lang_defaults')
        .upsert({ country, lang_code }, { onConflict: 'country' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-region-defaults'] });
      toast({ title: 'Region default saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteRegionDefault = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fd_region_lang_defaults').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-region-defaults'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // ── AI auto-translate ─────────────────────────────────────────────────────

  async function runAiTranslate() {
    if (!selectedFormId || !selectedLang) {
      toast({ title: 'Select a form and target language first.', variant: 'destructive' });
      return;
    }
    const gaps = missingTranslations.slice(0, 50); // cap to avoid huge calls
    if (gaps.length === 0) {
      toast({ title: 'No gaps to translate', description: 'All fields already have translations.' });
      return;
    }
    setAiRunning(true);
    setAiResults([]);
    try {
      const { data, error } = await supabase.functions.invoke('translate-form', {
        body: {
          texts: gaps.map(g => ({ key: g.field_key, text: g.source_text })),
          target_lang: selectedLang,
          target_lang_label: langLabel(selectedLang),
        },
      });
      if (error) throw error;
      const results: { field_key: string; source: string; translation: string }[] =
        (data as any)?.results ?? [];
      setAiResults(results);
      const initEdits: Record<string, string> = {};
      for (const r of results) initEdits[r.field_key] = r.translation;
      setAiEdits(initEdits);
      setAiApproved(new Set(results.map(r => r.field_key)));
      toast({ title: `${results.length} translations generated`, description: 'Review each translation before saving.' });
    } catch (e: any) {
      toast({ title: 'AI Translation failed', description: e.message, variant: 'destructive' });
    } finally {
      setAiRunning(false);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const totalForms   = summaries.length;
  const totalLangs   = new Set(allTranslations.map(t => t.lang_code)).size;
  const totalFields  = allTranslations.length;
  const translated   = allTranslations.filter(t => t.translated_text).length;
  const overallPct   = totalFields === 0 ? 0 : Math.round((translated / totalFields) * 100);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Languages className="w-5 h-5 text-teal-500" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Multi-Language Forms</h1>
            <Badge variant="secondary" className="text-xs">Phase 14</Badge>
          </div>
          <p className="text-sm text-slate-500">Manage translations, AI auto-fill gaps, and set region language defaults.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchTr(); refetchRegions(); }} data-testid="btn-refresh-langs">
            <RefreshCw className="w-4 h-4 mr-1.5" />Refresh
          </Button>
          <Button size="sm" onClick={() => setShowAddLang(true)} data-testid="btn-add-language">
            <Plus className="w-4 h-4 mr-1.5" />Add Language
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Forms Translated', value: totalForms,                   cls: 'text-slate-700 dark:text-slate-200' },
          { label: 'Languages Active', value: totalLangs,                   cls: 'text-teal-600 dark:text-teal-400' },
          { label: 'Total Fields',     value: totalFields.toLocaleString(), cls: 'text-indigo-600 dark:text-indigo-400' },
          { label: 'Overall Complete', value: `${overallPct}%`,             cls: overallPct === 100 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3">
            <p className="text-xs text-slate-500 mb-0.5">{s.label}</p>
            <p className={cn('text-2xl font-bold', s.cls)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-slate-200 dark:border-slate-700">
        {TABS.map(t => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-teal-600 text-teal-600 dark:text-teal-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {t.icon}{t.label}
            {t.id === 'editor' && missingTranslations.length > 0 && selectedFormId && (
              <span className="ml-0.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {missingTranslations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
              <Input
                className="pl-8 text-sm"
                placeholder="Search forms…"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                data-testid="input-overview-search"
              />
            </div>
          </div>

          {filteredSummaries.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Languages className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No translation data yet</p>
              <p className="text-sm mt-1">Add a language to a form to get started.</p>
              <Button className="mt-4" size="sm" onClick={() => setShowAddLang(true)}>
                <Plus className="w-4 h-4 mr-1.5" />Add Language
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredSummaries.map(s => (
                <div
                  key={s.form_id}
                  data-testid={`overview-row-${s.form_id}`}
                  className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-4"
                >
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{s.form_name}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedFormId(s.form_id);
                        setSelectedLang(s.languages[0]?.lang ?? 'ar');
                        setTab('editor');
                      }}
                      data-testid={`btn-translate-${s.form_id}`}
                    >
                      <Edit3 className="w-3.5 h-3.5 mr-1.5" />Translate
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {s.languages.map(l => (
                      <div key={l.lang} className="flex items-center gap-3">
                        <span className="text-base w-6">{langFlag(l.lang)}</span>
                        <span className="text-xs text-slate-600 dark:text-slate-400 w-24 flex-shrink-0">{langLabel(l.lang)}</span>
                        <PctBar pct={l.pct} cls="flex-1" />
                        <span className="text-xs text-slate-500 w-16 text-right">{l.done}/{l.total}</span>
                        {l.pct < 100 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              </TooltipTrigger>
                              <TooltipContent className="text-xs">
                                {l.total - l.done} missing translation{l.total - l.done !== 1 ? 's' : ''}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {l.pct === 100 && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Translation Editor ───────────────────────────────────────── */}
      {tab === 'editor' && (
        <div className="space-y-4">
          {/* Selectors */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Form</Label>
              <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                <SelectTrigger className="mt-1" data-testid="select-editor-form">
                  <SelectValue placeholder="Select form…" />
                </SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Label className="text-xs">Target Language</Label>
              <Select value={selectedLang} onValueChange={v => setSelectedLang(v as LangCode)}>
                <SelectTrigger className="mt-1" data-testid="select-editor-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map(l => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.flag} {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {missingTranslations.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="mt-5"
                onClick={() => setTab('ai')}
                data-testid="btn-go-ai"
              >
                <Sparkles className="w-4 h-4 mr-1.5 text-purple-500" />
                Auto-translate {missingTranslations.length} gaps
              </Button>
            )}
          </div>

          {/* Summary bar */}
          {selectedFormId && selectedLang && translations.length > 0 && (
            <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-4 py-2.5 text-sm">
              <span className="text-slate-600 dark:text-slate-400">
                {langFlag(selectedLang)} <strong>{langLabel(selectedLang)}</strong>
              </span>
              <PctBar
                pct={Math.round(((translations.length - missingTranslations.length) / translations.length) * 100)}
                cls="flex-1 max-w-xs"
              />
              <span className="text-slate-500 text-xs">
                {translations.length - missingTranslations.length}/{translations.length} complete
                {missingTranslations.length > 0 && (
                  <span className="text-amber-500 ml-2">{missingTranslations.length} missing</span>
                )}
              </span>
            </div>
          )}

          {/* Translation rows */}
          {!selectedFormId ? (
            <div className="text-center py-12 text-slate-400">
              <Edit3 className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>Select a form and language to start editing.</p>
            </div>
          ) : loadingTr ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : translations.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Languages className="w-8 h-8 mx-auto mb-3 opacity-30" />
              <p>No translation records found for this form / language.</p>
              <p className="text-xs mt-1">Add source fields via the SQL migration then re-select.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Column headers */}
              <div className="grid grid-cols-2 gap-3 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <span>🇬🇧 English (source)</span>
                <span>{langFlag(selectedLang)} {langLabel(selectedLang)}</span>
              </div>
              {translations.map(tr => (
                <TranslationRow
                  key={tr.id}
                  translation={tr}
                  targetDir={langDir(selectedLang)}
                  onSave={text => saveTranslation.mutate({ id: tr.id, text })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: AI Assistant ─────────────────────────────────────────────── */}
      {tab === 'ai' && (
        <div className="space-y-5">
          {/* Setup */}
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-purple-900 dark:text-purple-100">AI Auto-Translation</p>
                <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                  Uses Gemini to translate missing fields. All AI translations are marked for human review — approve, edit, or reject each one before saving.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Form</Label>
              <Select value={selectedFormId} onValueChange={setSelectedFormId}>
                <SelectTrigger className="mt-1" data-testid="select-ai-form">
                  <SelectValue placeholder="Select form…" />
                </SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-44">
              <Label className="text-xs">Target Language</Label>
              <Select value={selectedLang} onValueChange={v => setSelectedLang(v as LangCode)}>
                <SelectTrigger className="mt-1" data-testid="select-ai-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LANGUAGES.map(l => (
                    <SelectItem key={l.code} value={l.code}>{l.flag} {l.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={runAiTranslate}
              disabled={aiRunning || !selectedFormId}
              data-testid="btn-run-ai"
            >
              {aiRunning ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Translating…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />Auto-translate Gaps</>
              )}
            </Button>
          </div>

          {/* Results */}
          {aiResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {aiResults.length} AI suggestion{aiResults.length !== 1 ? 's' : ''} — review before saving
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="text-xs text-teal-600 hover:underline"
                    onClick={() => setAiApproved(new Set(aiResults.map(r => r.field_key)))}
                    data-testid="btn-approve-all"
                  >
                    Approve All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    className="text-xs text-red-500 hover:underline"
                    onClick={() => setAiApproved(new Set())}
                    data-testid="btn-reject-all"
                  >
                    Reject All
                  </button>
                </div>
              </div>

              {aiResults.map(r => {
                const approved = aiApproved.has(r.field_key);
                return (
                  <div
                    key={r.field_key}
                    data-testid={`ai-row-${r.field_key}`}
                    className={cn(
                      'rounded-xl border p-4 space-y-2 transition-all',
                      approved
                        ? 'border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-900/10'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 opacity-60',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-slate-500 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                          {r.field_key}
                        </span>
                        <Badge variant="outline" className="text-xs text-purple-600 border-purple-300">
                          <Bot className="w-3 h-3 mr-1" />AI
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setAiApproved(s => {
                            const n = new Set(s);
                            approved ? n.delete(r.field_key) : n.add(r.field_key);
                            return n;
                          })}
                          data-testid={`btn-toggle-approve-${r.field_key}`}
                          className={cn('w-7 h-7 rounded-full flex items-center justify-center transition-all',
                            approved ? 'bg-teal-500 text-white' : 'bg-slate-200 dark:bg-slate-600 text-slate-500'
                          )}
                        >
                          {approved ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-1">🇬🇧 Source</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 rounded p-2 text-sm">
                          {r.source}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-400 mb-1">{langFlag(selectedLang)} Translation (editable)</p>
                        <Textarea
                          className="text-sm min-h-[60px]"
                          dir={langDir(selectedLang)}
                          value={aiEdits[r.field_key] ?? r.translation}
                          onChange={e => setAiEdits(ed => ({ ...ed, [r.field_key]: e.target.value }))}
                          data-testid={`input-ai-edit-${r.field_key}`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setAiResults([]); setAiEdits({}); setAiApproved(new Set()); }} data-testid="btn-discard-ai">
                  Discard All
                </Button>
                <Button
                  disabled={aiApproved.size === 0 || approveAiTranslations.isPending}
                  onClick={() => {
                    const items = [...aiApproved].map(key => ({
                      field_key: key,
                      text: aiEdits[key] ?? (aiResults.find(r => r.field_key === key)?.translation ?? ''),
                    }));
                    approveAiTranslations.mutate(items);
                  }}
                  data-testid="btn-save-ai"
                >
                  {approveAiTranslations.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                  ) : (
                    <><CheckCircle className="w-4 h-4 mr-2" />Save {aiApproved.size} Approved</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Region Defaults ─────────────────────────────────────────── */}
      {tab === 'regions' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Set the default language for each country. Field staff in that region will see forms in this language by default.
          </p>

          {loadingRegions ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Preset tiles */}
              {REGION_DEFAULTS_PRESET.map(preset => {
                const saved = regionDefaults.find(r => r.country === preset.country);
                const currentLang = saved?.lang_code ?? preset.lang;
                return (
                  <div
                    key={preset.country}
                    data-testid={`region-card-${preset.country}`}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl">{preset.flag}</span>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{preset.country}</p>
                      {saved && (
                        <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={currentLang}
                        onValueChange={v => saveRegionDefault.mutate({ country: preset.country, lang_code: v as LangCode })}
                      >
                        <SelectTrigger className="text-sm flex-1" data-testid={`select-region-${preset.country}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_LANGUAGES.map(l => (
                            <SelectItem key={l.code} value={l.code}>{l.flag} {l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {saved && (
                        <button
                          onClick={() => deleteRegionDefault.mutate(saved.id)}
                          data-testid={`btn-delete-region-${preset.country}`}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Custom regions from DB not in presets */}
              {regionDefaults
                .filter(r => !REGION_DEFAULTS_PRESET.some(p => p.country === r.country))
                .map(r => (
                  <div
                    key={r.id}
                    data-testid={`region-custom-${r.id}`}
                    className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Globe className="w-5 h-5 text-slate-400" />
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.country}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={r.lang_code}
                        onValueChange={v => saveRegionDefault.mutate({ country: r.country, lang_code: v as LangCode })}
                      >
                        <SelectTrigger className="text-sm flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_LANGUAGES.map(l => (
                            <SelectItem key={l.code} value={l.code}>{l.flag} {l.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        onClick={() => deleteRegionDefault.mutate(r.id)}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Add Language Dialog ────────────────────────────────────────────── */}
      <AddLanguageDialog
        open={showAddLang}
        onClose={() => setShowAddLang(false)}
        forms={forms}
        defaultFormId={addLangFormId}
        defaultLang={addLangCode}
        onAdded={() => {
          qc.invalidateQueries({ queryKey: ['fd-translations-all'] });
          setShowAddLang(false);
          toast({ title: 'Language added', description: 'You can now start translating in the editor.' });
        }}
      />
    </div>
  );
}

// ─── TranslationRow ───────────────────────────────────────────────────────────

function TranslationRow({
  translation: tr,
  targetDir,
  onSave,
}: {
  translation: FormTranslation;
  targetDir: 'ltr' | 'rtl';
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(tr.translated_text ?? '');
  const isMissing = !tr.translated_text;

  function handleSave() {
    onSave(value);
    setEditing(false);
  }

  return (
    <div
      data-testid={`tr-row-${tr.id}`}
      className={cn(
        'grid grid-cols-2 gap-3 px-4 py-3 rounded-lg border transition-all',
        isMissing
          ? 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
      )}
    >
      {/* Source text */}
      <div>
        <p className="text-xs font-mono text-slate-400 mb-0.5">{tr.field_key}</p>
        <p className="text-sm text-slate-700 dark:text-slate-300">{tr.source_text}</p>
      </div>

      {/* Translation */}
      <div>
        {isMissing && !editing && (
          <span className="text-xs text-amber-500 flex items-center gap-1 mb-1">
            <AlertTriangle className="w-3 h-3" />Missing
          </span>
        )}
        {tr.is_ai_generated && !tr.ai_reviewed && (
          <Badge variant="outline" className="text-xs text-purple-600 border-purple-300 mb-1">
            <Bot className="w-3 h-3 mr-1" />AI — needs review
          </Badge>
        )}
        {editing ? (
          <div className="flex gap-1.5">
            <Textarea
              dir={targetDir}
              className="text-sm min-h-[60px] flex-1"
              value={value}
              onChange={e => setValue(e.target.value)}
              autoFocus
              data-testid={`input-tr-${tr.id}`}
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={handleSave}
                data-testid={`btn-save-tr-${tr.id}`}
                className="w-7 h-7 bg-green-500 text-white rounded-md flex items-center justify-center hover:bg-green-600"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setValue(tr.translated_text ?? ''); setEditing(false); }}
                data-testid={`btn-cancel-tr-${tr.id}`}
                className="w-7 h-7 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-md flex items-center justify-center hover:bg-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            dir={targetDir}
            data-testid={`btn-edit-tr-${tr.id}`}
            className={cn(
              'w-full text-left text-sm px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors',
              isMissing ? 'text-amber-400 italic' : 'text-slate-700 dark:text-slate-300',
            )}
          >
            {tr.translated_text || 'Click to translate…'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── AddLanguageDialog ────────────────────────────────────────────────────────

function AddLanguageDialog({
  open, onClose, forms, defaultFormId, defaultLang, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  forms: { id: string; name: string }[];
  defaultFormId: string;
  defaultLang: LangCode;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [formId, setFormId] = useState(defaultFormId);
  const [lang, setLang]     = useState<LangCode>(defaultLang);
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!formId) { toast({ title: 'Select a form', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      // Seed empty translation rows for common metadata fields
      const seedFields = [
        'form_title', 'form_description',
        'start_label', 'end_label', 'submit_label',
        'required_message', 'constraint_message',
      ];
      const form = forms.find(f => f.id === formId);
      const rows = seedFields.map(key => ({
        form_id:          formId,
        form_name:        form?.name ?? '',
        lang_code:        lang,
        field_key:        key,
        source_text:      key.replace(/_/g, ' '),
        translated_text:  null,
        is_ai_generated:  false,
        ai_reviewed:      false,
      }));
      const { error } = await supabase
        .from('fd_form_translations')
        .upsert(rows, { onConflict: 'form_id,lang_code,field_key', ignoreDuplicates: true });
      if (error) throw error;
      onAdded();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" />Add Language to Form
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Form</Label>
            <Select value={formId} onValueChange={setFormId}>
              <SelectTrigger className="mt-1" data-testid="select-addlang-form">
                <SelectValue placeholder="Select form…" />
              </SelectTrigger>
              <SelectContent>
                {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Language</Label>
            <Select value={lang} onValueChange={v => setLang(v as LangCode)}>
              <SelectTrigger className="mt-1" data-testid="select-addlang-code">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map(l => (
                  <SelectItem key={l.code} value={l.code}>{l.flag} {l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-slate-500">
            This seeds the translation table with common field keys. Add form-specific question keys via the SQL migration.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="btn-addlang-cancel">Cancel</Button>
          <Button onClick={handleAdd} disabled={saving || !formId} data-testid="btn-addlang-confirm">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Add Language
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
