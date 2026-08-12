import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { sudanStates } from '@/data/sudanStates';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Plus, Pencil, Trash2, Loader2, ChevronLeft, MapPin, Users, Target,
  BarChart3, Calendar, ClipboardList, CheckCircle2, AlertCircle,
  Download, Eye, RefreshCw, Home, Building2, UserCheck, FileText,
  ArrowRight, TrendingUp, Activity, Camera, ImageIcon, X, ChevronDown, ChevronUp
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProfileOption {
  id: string;
  full_name?: string | null;
  username?: string | null;
  role?: string | null;
}

interface ProjectOption { id: string; name: string; }

interface Campaign {
  id: string;
  campaign_name: string;
  state?: string;
  locality?: string;
  start_date?: string;
  end_date?: string;
  status: 'draft' | 'active' | 'completed' | 'archived';
  project_id?: string;
  mmp_file_id?: string;
  coordinator_id?: string;
  supervisor_id?: string;
  created_by?: string;
  created_at: string;
  // Joined
  coordinator_name?: string;
  supervisor_name?: string;
  project_name?: string;
}

interface Village {
  id: string;
  campaign_id: string;
  village_name: string;
  village_code: string;
  hh_target: number;
  state?: string;
  locality?: string;
  status: 'pending' | 'in_progress' | 'completed';
  // Derived
  hh_covered?: number;
  team_count?: number;
}

interface Team {
  id: string;
  team_name: string;
  team_code: string;
  team_lead_id?: string;
  member_count: number;
  notes?: string;
  is_active: boolean;
  // Joined
  team_lead_name?: string;
}

interface VillageTeam {
  id: string;
  campaign_id: string;
  village_id: string;
  team_id: string;
  hh_target_for_team?: number;
  status: 'active' | 'completed' | 'withdrawn';
  assigned_at: string;
  // Joined
  team_name?: string;
  team_code?: string;
  team_lead_name?: string;
  member_count?: number;
  village_name?: string;
  hh_covered?: number;
}

interface DailyLog {
  id: string;
  assignment_id: string;
  campaign_id: string;
  village_id: string;
  team_id: string;
  report_date: string;
  hh_covered: number;
  male_count: number;
  female_count: number;
  beneficiaries: number;
  notes?: string;
  gps_lat?: number;
  gps_lng?: number;
  submitted_by?: string;
  submitted_at: string;
  source: string;
  // Joined
  village_name?: string;
  team_name?: string;
  team_code?: string;
  submitted_by_name?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(covered: number, target: number) {
  if (!target) return 0;
  return Math.min(100, Math.round((covered / target) * 100));
}

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd MMM yyyy'); } catch { return d; }
}

function autoVillageCode(idx: number) {
  return `VLG-${String(idx + 1).padStart(2, '0')}`;
}

function autoTeamCode(existing: Team[]) {
  const nums = existing
    .map(t => { const m = t.team_code.match(/(\d+)$/); return m ? parseInt(m[1]) : 0; })
    .filter(n => n > 0);
  const next = nums.length ? Math.max(...nums) + 1 : 1;
  return `TM-${String(next).padStart(3, '0')}`;
}

function statusColor(s: string) {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700',
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-blue-100 text-blue-700',
    archived: 'bg-gray-100 text-gray-500',
    pending: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-purple-100 text-purple-700',
  };
  return map[s] || 'bg-gray-100 text-gray-600';
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface VillageCampaignsTabProps {
  canManage: boolean;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function VillageCampaignsTab({ canManage }: VillageCampaignsTabProps) {
  const { toast } = useToast();

  // ── Reference data ────────────────────────────────────────────────────────
  const [profiles, setProfiles]   = useState<ProfileOption[]>([]);
  const [projects, setProjects]   = useState<ProjectOption[]>([]);
  const [allTeams, setAllTeams]   = useState<Team[]>([]);
  const [loading, setLoading]     = useState(false);

  // ── Campaigns ─────────────────────────────────────────────────────────────
  const [campaigns, setCampaigns]       = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignTab, setCampaignTab]   = useState('overview');

  // ── Villages & assignments for selected campaign ──────────────────────────
  const [villages, setVillages]         = useState<Village[]>([]);
  const [assignments, setAssignments]   = useState<VillageTeam[]>([]);
  const [dailyLogs, setDailyLogs]       = useState<DailyLog[]>([]);

  // ── Dialogs ───────────────────────────────────────────────────────────────
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showTeamRegistry,   setShowTeamRegistry]   = useState(false);
  const [showAddVillage,     setShowAddVillage]     = useState(false);
  const [showAssignTeam,     setShowAssignTeam]     = useState(false);
  const [showDailyLog,       setShowDailyLog]       = useState(false);
  const [showCreateTeam,     setShowCreateTeam]     = useState(false);

  // ── Form state — campaign wizard ──────────────────────────────────────────
  const [wizardStep, setWizardStep] = useState(1);
  const [campaignForm, setCampaignForm] = useState({
    campaign_name: '', state: '', locality: '', start_date: '', end_date: '',
    status: 'active' as Campaign['status'],
    project_id: '', mmp_file_id: '',
    coordinator_id: '', supervisor_id: '',
  });
  const [wizardVillages, setWizardVillages] = useState<{ village_name: string; village_code: string; hh_target: string; state: string; locality: string }[]>([
    { village_name: '', village_code: 'VLG-01', hh_target: '', state: '', locality: '' },
  ]);
  const [wizardTeams, setWizardTeams] = useState<{ team_id: string; village_ids: string[]; hh_target_for_team: string }[]>([]);

  // ── Form state — add village ──────────────────────────────────────────────
  const [villageForm, setVillageForm] = useState({ village_name: '', village_code: '', hh_target: '', state: '', locality: '' });

  // ── Form state — assign team ──────────────────────────────────────────────
  const [assignForm, setAssignForm] = useState({ team_id: '', village_id: '', hh_target_for_team: '' });

  // ── Form state — daily log ────────────────────────────────────────────────
  const [logForm, setLogForm] = useState({
    assignment_id: '', report_date: format(new Date(), 'yyyy-MM-dd'),
    hh_covered: '', male_count: '', female_count: '', beneficiaries: '', notes: '',
  });

  // ── Photo upload — daily log dialog ──────────────────────────────────────
  const [logPhotos, setLogPhotos] = useState<File[]>([]);
  const logPhotoInputRef = useRef<HTMLInputElement>(null);

  // ── Photos fetched for existing logs (keyed by log id) ───────────────────
  const [photosByLogId, setPhotosByLogId] = useState<Record<string, { photo_url: string; storage_path?: string; caption?: string }[]>>({});

  // ── Expanded log row in the Daily Logs table ─────────────────────────────
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // ── Form state — team ─────────────────────────────────────────────────────
  const [teamForm, setTeamForm] = useState({ team_name: '', team_code: '', team_lead_id: '', member_count: '', notes: '' });

  // ── Submitting ────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [logFilterTeam, setLogFilterTeam]     = useState('all');
  const [logFilterVillage, setLogFilterVillage] = useState('all');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all');

  // ── Load reference data ───────────────────────────────────────────────────

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, username, role')
      .order('full_name', { ascending: true });
    setProfiles((data || []) as ProfileOption[]);
  }, []);

  const loadProjects = useCallback(async () => {
    const { data } = await supabase
      .from('projects')
      .select('id, name')
      .order('name', { ascending: true });
    setProjects((data || []) as ProjectOption[]);
  }, []);

  const loadTeams = useCallback(async () => {
    const { data } = await supabase
      .from('adhoc_teams')
      .select('id, team_name, team_code, team_lead_id, member_count, notes, is_active, profiles:team_lead_id(full_name)')
      .eq('is_active', true)
      .order('team_code', { ascending: true });
    setAllTeams(
      (data || []).map((t: any) => ({
        ...t,
        team_lead_name: t.profiles?.full_name || '—',
      }))
    );
  }, []);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('adhoc_campaigns')
        .select('*, coordinator:coordinator_id(full_name), supervisor:supervisor_id(full_name), project:project_id(name)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCampaigns(
        (data || []).map((c: any) => ({
          ...c,
          coordinator_name: c.coordinator?.full_name || '—',
          supervisor_name:  c.supervisor?.full_name  || '—',
          project_name:     c.project?.name          || '—',
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Load campaign detail ──────────────────────────────────────────────────

  const loadCampaignDetail = useCallback(async (campaignId: string) => {
    // Parallel load: villages + assignments + daily logs
    const [vilRes, assignRes, logRes] = await Promise.all([
      supabase
        .from('adhoc_villages')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('village_code', { ascending: true }),
      supabase
        .from('adhoc_village_teams')
        .select('*, team:team_id(team_name, team_code, member_count, profiles:team_lead_id(full_name)), village:village_id(village_name)')
        .eq('campaign_id', campaignId)
        .order('assigned_at', { ascending: true }),
      supabase
        .from('adhoc_daily_logs')
        .select('*, village:village_id(village_name), team:team_id(team_name, team_code), submitter:submitted_by(full_name)')
        .eq('campaign_id', campaignId)
        .order('report_date', { ascending: false }),
    ]);

    // Load photos for all logs in parallel
    const logIds = (logRes.data || []).map((l: any) => l.id);
    let fetchedPhotos: Record<string, { photo_url: string; storage_path?: string; caption?: string }[]> = {};
    if (logIds.length > 0) {
      const { data: photoRows } = await supabase
        .from('adhoc_daily_log_photos')
        .select('log_id, photo_url, storage_path, caption')
        .in('log_id', logIds)
        .order('created_at', { ascending: true });
      for (const p of (photoRows || [])) {
        const lid = p.log_id as string;
        fetchedPhotos[lid] = fetchedPhotos[lid] || [];
        fetchedPhotos[lid].push({ photo_url: p.photo_url, storage_path: p.storage_path ?? undefined, caption: p.caption ?? undefined });
      }
    }
    setPhotosByLogId(fetchedPhotos);

    const logs: DailyLog[] = (logRes.data || []).map((l: any) => ({
      ...l,
      village_name: l.village?.village_name || '—',
      team_name:    l.team?.team_name       || '—',
      team_code:    l.team?.team_code       || '—',
      submitted_by_name: l.submitter?.full_name || '—',
    }));

    const assigns: VillageTeam[] = (assignRes.data || []).map((a: any) => {
      const teamLogs = logs.filter(l => l.assignment_id === a.id);
      const hh_covered = teamLogs.reduce((s, l) => s + (l.hh_covered || 0), 0);
      return {
        ...a,
        team_name:      a.team?.team_name                   || '—',
        team_code:      a.team?.team_code                   || '—',
        team_lead_name: a.team?.profiles?.full_name         || '—',
        member_count:   a.team?.member_count                || 0,
        village_name:   a.village?.village_name             || '—',
        hh_covered,
      };
    });

    const vils: Village[] = (vilRes.data || []).map((v: any) => {
      const vilAssigns = assigns.filter(a => a.village_id === v.id);
      const hh_covered = vilAssigns.reduce((s, a) => s + (a.hh_covered || 0), 0);
      return { ...v, hh_covered, team_count: vilAssigns.length };
    });

    setVillages(vils);
    setAssignments(assigns);
    setDailyLogs(logs);
  }, []);

  useEffect(() => {
    loadProfiles();
    loadProjects();
    loadTeams();
    loadCampaigns();
  }, [loadProfiles, loadProjects, loadTeams, loadCampaigns]);

  useEffect(() => {
    if (selectedCampaign) loadCampaignDetail(selectedCampaign.id);
  }, [selectedCampaign, loadCampaignDetail]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const profileName = (id?: string) => {
    if (!id) return '—';
    const p = profiles.find(p => p.id === id);
    return p?.full_name || p?.username || '—';
  };

  const localities = useMemo(() =>
    sudanStates.find(s => s.name === campaignForm.state)?.localities || [],
    [campaignForm.state]
  );

  const filteredLogs = useMemo(() => dailyLogs.filter(l => {
    if (logFilterTeam !== 'all' && l.team_id !== logFilterTeam) return false;
    if (logFilterVillage !== 'all' && l.village_id !== logFilterVillage) return false;
    return true;
  }), [dailyLogs, logFilterTeam, logFilterVillage]);

  const filteredCampaigns = useMemo(() =>
    campaigns.filter(c => campaignStatusFilter === 'all' || c.status === campaignStatusFilter),
    [campaigns, campaignStatusFilter]
  );

  const campaignTotals = useMemo(() => {
    const totalTarget  = villages.reduce((s, v) => s + (v.hh_target || 0), 0);
    const totalCovered = villages.reduce((s, v) => s + (v.hh_covered || 0), 0);
    return { totalTarget, totalCovered };
  }, [villages]);

  // ── Campaign creation wizard ───────────────────────────────────────────────

  const submitCampaign = async () => {
    if (!campaignForm.campaign_name.trim()) {
      toast({ title: 'Campaign name required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      // 1. Insert campaign
      const { data: camp, error: campErr } = await supabase
        .from('adhoc_campaigns')
        .insert({
          campaign_name:  campaignForm.campaign_name.trim(),
          state:          campaignForm.state || null,
          locality:       campaignForm.locality || null,
          start_date:     campaignForm.start_date || null,
          end_date:       campaignForm.end_date   || null,
          status:         campaignForm.status,
          project_id:     campaignForm.project_id     || null,
          mmp_file_id:    campaignForm.mmp_file_id    || null,
          coordinator_id: campaignForm.coordinator_id || null,
          supervisor_id:  campaignForm.supervisor_id  || null,
        })
        .select('id')
        .single();
      if (campErr) throw campErr;

      // 2. Insert villages
      const validVillages = wizardVillages.filter(v => v.village_name.trim());
      if (validVillages.length > 0) {
        const { data: vils, error: vilErr } = await supabase
          .from('adhoc_villages')
          .insert(validVillages.map(v => ({
            campaign_id:  camp.id,
            village_name: v.village_name.trim(),
            village_code: v.village_code.trim() || autoVillageCode(0),
            hh_target:    v.hh_target ? parseInt(v.hh_target) : 0,
            state:        v.state || campaignForm.state || null,
            locality:     v.locality || campaignForm.locality || null,
          })))
          .select('id, village_code');
        if (vilErr) throw vilErr;

        // 3. Insert team assignments (step 3 of wizard)
        const teamInserts: any[] = [];
        for (const ta of wizardTeams) {
          if (!ta.team_id) continue;
          const villageIds = ta.village_ids.length
            ? ta.village_ids
            : (vils || []).map((v: any) => v.id);
          for (const vid of villageIds) {
            teamInserts.push({
              campaign_id:         camp.id,
              village_id:          vid,
              team_id:             ta.team_id,
              hh_target_for_team:  ta.hh_target_for_team ? parseInt(ta.hh_target_for_team) : null,
            });
          }
        }
        if (teamInserts.length > 0) {
          await supabase.from('adhoc_village_teams').insert(teamInserts);
        }
      }

      toast({ title: 'Campaign created', description: campaignForm.campaign_name });
      setShowCreateCampaign(false);
      resetWizard();
      await loadCampaigns();
    } catch (e: any) {
      toast({ title: 'Error creating campaign', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const resetWizard = () => {
    setWizardStep(1);
    setCampaignForm({ campaign_name:'', state:'', locality:'', start_date:'', end_date:'', status:'active', project_id:'', mmp_file_id:'', coordinator_id:'', supervisor_id:'' });
    setWizardVillages([{ village_name:'', village_code:'VLG-01', hh_target:'', state:'', locality:'' }]);
    setWizardTeams([]);
  };

  // ── Add village to existing campaign ─────────────────────────────────────

  const submitAddVillage = async () => {
    if (!selectedCampaign || !villageForm.village_name.trim()) {
      toast({ title: 'Village name required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const code = villageForm.village_code.trim() || autoVillageCode(villages.length);
      const { error } = await supabase.from('adhoc_villages').insert({
        campaign_id:  selectedCampaign.id,
        village_name: villageForm.village_name.trim(),
        village_code: code,
        hh_target:    villageForm.hh_target ? parseInt(villageForm.hh_target) : 0,
        state:        villageForm.state || selectedCampaign.state || null,
        locality:     villageForm.locality || selectedCampaign.locality || null,
      });
      if (error) throw error;
      toast({ title: 'Village added', description: villageForm.village_name });
      setShowAddVillage(false);
      setVillageForm({ village_name:'', village_code:'', hh_target:'', state:'', locality:'' });
      await loadCampaignDetail(selectedCampaign.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Assign team to village ────────────────────────────────────────────────

  const submitAssignTeam = async () => {
    if (!selectedCampaign || !assignForm.team_id || !assignForm.village_id) {
      toast({ title: 'Team and village required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('adhoc_village_teams').insert({
        campaign_id:        selectedCampaign.id,
        village_id:         assignForm.village_id,
        team_id:            assignForm.team_id,
        hh_target_for_team: assignForm.hh_target_for_team ? parseInt(assignForm.hh_target_for_team) : null,
      });
      if (error) throw error;
      toast({ title: 'Team assigned' });
      setShowAssignTeam(false);
      setAssignForm({ team_id:'', village_id:'', hh_target_for_team:'' });
      await loadCampaignDetail(selectedCampaign.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Submit daily log ──────────────────────────────────────────────────────

  const submitDailyLog = async () => {
    if (!logForm.assignment_id || !logForm.report_date) {
      toast({ title: 'Assignment and date required', variant: 'destructive' }); return;
    }
    const assignment = assignments.find(a => a.id === logForm.assignment_id);
    if (!assignment || !selectedCampaign) return;
    setSaving(true);
    try {
      // Upsert the log row; we need the id to attach photos
      const { data: logRow, error } = await supabase.from('adhoc_daily_logs').upsert({
        assignment_id: logForm.assignment_id,
        campaign_id:   selectedCampaign.id,
        village_id:    assignment.village_id,
        team_id:       assignment.team_id,
        report_date:   logForm.report_date,
        hh_covered:    parseInt(logForm.hh_covered)    || 0,
        male_count:    parseInt(logForm.male_count)    || 0,
        female_count:  parseInt(logForm.female_count)  || 0,
        beneficiaries: parseInt(logForm.beneficiaries) || 0,
        notes:         logForm.notes || null,
        source:        'web',
      }, { onConflict: 'assignment_id,report_date' }).select('id').single();
      if (error) throw error;

      // Upload any attached photos and record them in adhoc_daily_log_photos
      if (logPhotos.length > 0 && logRow?.id) {
        const logId = logRow.id as string;
        const photoInserts: { log_id: string; photo_url: string; storage_path: string }[] = [];

        for (const file of logPhotos) {
          const ext = file.name.split('.').pop() || 'jpg';
          const storagePath = `village-campaign-logs/${logId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: uploadErr } = await supabase.storage
            .from('site-visit-photos')
            .upload(storagePath, file, { upsert: false });

          if (uploadErr) {
            // Non-fatal: log and continue with remaining photos
            console.error('Photo upload error:', uploadErr.message);
            continue;
          }

          const { data: urlData } = supabase.storage
            .from('site-visit-photos')
            .getPublicUrl(storagePath);

          if (urlData?.publicUrl) {
            photoInserts.push({ log_id: logId, photo_url: urlData.publicUrl, storage_path: storagePath });
          }
        }

        if (photoInserts.length > 0) {
          const { error: photoErr } = await supabase.from('adhoc_daily_log_photos').insert(photoInserts);
          if (photoErr) console.error('Photo record insert error:', photoErr.message);
        }
      }

      toast({ title: 'Daily log saved', description: fmtDate(logForm.report_date) });
      setShowDailyLog(false);
      setLogForm({ assignment_id:'', report_date: format(new Date(), 'yyyy-MM-dd'), hh_covered:'', male_count:'', female_count:'', beneficiaries:'', notes:'' });
      setLogPhotos([]);
      await loadCampaignDetail(selectedCampaign.id);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ── Create team ───────────────────────────────────────────────────────────

  const submitCreateTeam = async () => {
    if (!teamForm.team_name.trim() || !teamForm.team_code.trim()) {
      toast({ title: 'Team name and code required', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('adhoc_teams').insert({
        team_name:    teamForm.team_name.trim(),
        team_code:    teamForm.team_code.trim(),
        team_lead_id: teamForm.team_lead_id || null,
        member_count: parseInt(teamForm.member_count) || 0,
        notes:        teamForm.notes || null,
      });
      if (error) throw error;
      toast({ title: 'Team created', description: teamForm.team_code });
      setShowCreateTeam(false);
      setTeamForm({ team_name:'', team_code:'', team_lead_id:'', member_count:'', notes:'' });
      await loadTeams();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const deleteTeam = async (id: string) => {
    await supabase.from('adhoc_teams').update({ is_active: false }).eq('id', id);
    await loadTeams();
    toast({ title: 'Team deactivated' });
  };

  const deleteCampaign = async (id: string) => {
    await supabase.from('adhoc_campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await loadCampaigns();
    if (selectedCampaign?.id === id) setSelectedCampaign(null);
    toast({ title: 'Campaign deleted' });
  };

  // ── Completion report export ──────────────────────────────────────────────

  const exportCompletion = () => {
    if (!selectedCampaign) return;
    const wb = XLSX.utils.book_new();

    // Sheet 1: By Village
    const vilRows = villages.map(v => ({
      'Village Code':   v.village_code,
      'Village Name':   v.village_name,
      'State':          v.state || '—',
      'Locality':       v.locality || '—',
      'HH Target':      v.hh_target,
      'HH Covered':     v.hh_covered || 0,
      'Progress %':     pct(v.hh_covered || 0, v.hh_target),
      'Teams Assigned': v.team_count || 0,
      'Status':         v.status,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(vilRows), 'By Village');

    // Sheet 2: By Team
    const teamSummary: Record<string, { team_name: string; team_code: string; lead: string; villages: string[]; total_hh: number; total_beneficiaries: number }> = {};
    for (const a of assignments) {
      if (!teamSummary[a.team_id]) {
        teamSummary[a.team_id] = { team_name: a.team_name||'', team_code: a.team_code||'', lead: a.team_lead_name||'', villages: [], total_hh: 0, total_beneficiaries: 0 };
      }
      teamSummary[a.team_id].villages.push(a.village_name || '');
      teamSummary[a.team_id].total_hh += a.hh_covered || 0;
    }
    for (const l of dailyLogs) {
      if (teamSummary[l.team_id]) teamSummary[l.team_id].total_beneficiaries += l.beneficiaries || 0;
    }
    const teamRows = Object.values(teamSummary).map(t => ({
      'Team Code':   t.team_code,
      'Team Name':   t.team_name,
      'Team Lead':   t.lead,
      'Villages Worked': t.villages.join(', '),
      'Total HH Covered': t.total_hh,
      'Total Beneficiaries': t.total_beneficiaries,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(teamRows), 'By Team');

    // Sheet 3: Daily Logs
    const logRows = dailyLogs.map(l => ({
      'Date':          l.report_date,
      'Village':       l.village_name,
      'Team Code':     l.team_code,
      'Team Name':     l.team_name,
      'HH Covered':    l.hh_covered,
      'Male':          l.male_count,
      'Female':        l.female_count,
      'Beneficiaries': l.beneficiaries,
      'Notes':         l.notes || '',
      'Submitted By':  l.submitted_by_name,
      'Source':        l.source,
      'Submitted At':  fmtDate(l.submitted_at),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), 'Daily Logs');

    XLSX.writeFile(wb, `${selectedCampaign.campaign_name.replace(/\s+/g, '_')}_completion_report.xlsx`);
    toast({ title: 'Report exported' });
  };

  // ── Campaign List View ────────────────────────────────────────────────────

  if (!selectedCampaign) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              Village Campaigns
            </h2>
            <p className="text-sm text-muted-foreground">Coordinate multi-team coverage of villages with daily progress tracking</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={campaignStatusFilter} onValueChange={setCampaignStatusFilter}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            {canManage && (
              <>
                <Button variant="outline" size="sm" onClick={() => setShowTeamRegistry(true)} className="h-8 gap-1.5">
                  <Users className="h-3.5 w-3.5" /> Teams
                </Button>
                <Button size="sm" onClick={() => { resetWizard(); setShowCreateCampaign(true); }} className="h-8 gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> New Campaign
                </Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={loadCampaigns} className="h-8 w-8 p-0">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Campaign Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading campaigns…
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Building2 className="h-10 w-10 opacity-30" />
            <p className="font-medium">No campaigns yet</p>
            {canManage && <Button size="sm" onClick={() => { resetWizard(); setShowCreateCampaign(true); }}><Plus className="h-3.5 w-3.5 mr-1.5" />Create first campaign</Button>}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCampaigns.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-primary/40" onClick={() => { setSelectedCampaign(c); setCampaignTab('overview'); }}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm leading-tight">{c.campaign_name}</p>
                      {c.state && <p className="text-xs text-muted-foreground mt-0.5">{c.state}{c.locality ? ` › ${c.locality}` : ''}</p>}
                    </div>
                    <Badge className={`text-[10px] ${statusColor(c.status)} border-0 shrink-0`}>{c.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    {c.start_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{fmtDate(c.start_date)}</span>}
                    {c.coordinator_name && c.coordinator_name !== '—' && <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{c.coordinator_name}</span>}
                    {c.project_name && c.project_name !== '—' && <span className="flex items-center gap-1 col-span-2"><ClipboardList className="h-3 w-3" />{c.project_name}</span>}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t">
                    <span className="text-xs text-muted-foreground">View details</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Create Campaign Wizard ────────────────────────────────────────── */}
        <Dialog open={showCreateCampaign} onOpenChange={setShowCreateCampaign}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Village Campaign — Step {wizardStep} of 3</DialogTitle>
              <DialogDescription>
                {wizardStep === 1 && 'Campaign details, dates and personnel'}
                {wizardStep === 2 && 'Add the villages to be covered (with HH targets)'}
                {wizardStep === 3 && 'Optionally assign teams to villages now'}
              </DialogDescription>
            </DialogHeader>

            {/* Step 1: Campaign details */}
            {wizardStep === 1 && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Campaign Name *</Label>
                    <Input value={campaignForm.campaign_name} onChange={e => setCampaignForm(f => ({ ...f, campaign_name: e.target.value }))} placeholder="e.g. North Darfur HH Survey Wave 3" />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={campaignForm.status} onValueChange={v => setCampaignForm(f => ({ ...f, status: v as Campaign['status'] }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>State</Label>
                    <Select value={campaignForm.state} onValueChange={v => setCampaignForm(f => ({ ...f, state: v, locality: '' }))}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>{sudanStates.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {campaignForm.state && localities.length > 0 && (
                    <div>
                      <Label>Locality</Label>
                      <Select value={campaignForm.locality} onValueChange={v => setCampaignForm(f => ({ ...f, locality: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select locality" /></SelectTrigger>
                        <SelectContent>{localities.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={campaignForm.start_date} onChange={e => setCampaignForm(f => ({ ...f, start_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={campaignForm.end_date} onChange={e => setCampaignForm(f => ({ ...f, end_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Coordinator</Label>
                    <Select value={campaignForm.coordinator_id} onValueChange={v => setCampaignForm(f => ({ ...f, coordinator_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select coordinator" /></SelectTrigger>
                      <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.username}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Supervisor</Label>
                    <Select value={campaignForm.supervisor_id} onValueChange={v => setCampaignForm(f => ({ ...f, supervisor_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select supervisor" /></SelectTrigger>
                      <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.username}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Linked Project (optional)</Label>
                    <Select value={campaignForm.project_id} onValueChange={v => setCampaignForm(f => ({ ...f, project_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Villages */}
            {wizardStep === 2 && (
              <div className="space-y-3">
                {wizardVillages.map((v, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-5 items-end p-3 border rounded-lg bg-muted/20">
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Village Name *</Label>
                      <Input value={v.village_name} onChange={e => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, village_name: e.target.value } : r))} placeholder="Village name" />
                    </div>
                    <div>
                      <Label className="text-xs">Code</Label>
                      <Input value={v.village_code} onChange={e => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, village_code: e.target.value } : r))} placeholder="VLG-01" />
                    </div>
                    <div>
                      <Label className="text-xs">HH Target</Label>
                      <Input type="number" min="0" value={v.hh_target} onChange={e => setWizardVillages(vs => vs.map((r, i) => i === idx ? { ...r, hh_target: e.target.value } : r))} placeholder="0" />
                    </div>
                    <div className="flex gap-1">
                      {wizardVillages.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 text-red-500" onClick={() => setWizardVillages(vs => vs.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setWizardVillages(vs => [...vs, { village_name:'', village_code: autoVillageCode(vs.length), hh_target:'', state:'', locality:'' }])}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Village
                </Button>
              </div>
            )}

            {/* Step 3: Team Assignments */}
            {wizardStep === 3 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Assign teams to villages. Teams can work multiple villages. You can also add teams later from the campaign detail.</p>
                {allTeams.length === 0 ? (
                  <div className="text-sm text-muted-foreground border rounded p-4 text-center">
                    No teams in registry yet. <Button variant="link" className="p-0 h-auto text-sm" onClick={() => { setShowCreateCampaign(false); setShowTeamRegistry(true); }}>Create a team first →</Button>
                  </div>
                ) : (
                  <>
                    {wizardTeams.map((ta, idx) => (
                      <div key={idx} className="grid gap-2 sm:grid-cols-3 items-end p-3 border rounded-lg bg-muted/20">
                        <div>
                          <Label className="text-xs">Team</Label>
                          <Select value={ta.team_id} onValueChange={v => setWizardTeams(ts => ts.map((r, i) => i === idx ? { ...r, team_id: v } : r))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select team" /></SelectTrigger>
                            <SelectContent>{allTeams.map(t => <SelectItem key={t.id} value={t.id}>{t.team_code} — {t.team_name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Villages (blank = all)</Label>
                          <Select value={ta.village_ids[0] || ''} onValueChange={v => setWizardTeams(ts => ts.map((r, i) => i === idx ? { ...r, village_ids: v ? [v] : [] } : r))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="All villages" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">All villages</SelectItem>
                              {wizardVillages.filter(v => v.village_name).map((v, vi) => <SelectItem key={vi} value={v.village_code}>{v.village_name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2 items-end">
                          <div className="flex-1">
                            <Label className="text-xs">Team HH Target</Label>
                            <Input type="number" min="0" className="h-8 text-xs" value={ta.hh_target_for_team} onChange={e => setWizardTeams(ts => ts.map((r, i) => i === idx ? { ...r, hh_target_for_team: e.target.value } : r))} placeholder="Optional" />
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 shrink-0" onClick={() => setWizardTeams(ts => ts.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={() => setWizardTeams(ts => [...ts, { team_id:'', village_ids:[], hh_target_for_team:'' }])}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Team Assignment
                    </Button>
                  </>
                )}
              </div>
            )}

            <DialogFooter className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => wizardStep > 1 ? setWizardStep(s => s - 1) : setShowCreateCampaign(false)}>
                {wizardStep === 1 ? 'Cancel' : '← Back'}
              </Button>
              {wizardStep < 3 ? (
                <Button onClick={() => setWizardStep(s => s + 1)} disabled={wizardStep === 1 && !campaignForm.campaign_name.trim()}>
                  Next →
                </Button>
              ) : (
                <Button onClick={submitCampaign} disabled={saving}>
                  {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Create Campaign
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Team Registry Dialog ──────────────────────────────────────────── */}
        <TeamRegistryDialog
          open={showTeamRegistry}
          onOpenChange={setShowTeamRegistry}
          teams={allTeams}
          profiles={profiles}
          onRefresh={loadTeams}
          canManage={canManage}
          showCreateTeam={showCreateTeam}
          setShowCreateTeam={setShowCreateTeam}
          teamForm={teamForm}
          setTeamForm={setTeamForm}
          onSubmitTeam={submitCreateTeam}
          saving={saving}
          autoCode={() => autoTeamCode(allTeams)}
          onDeleteTeam={deleteTeam}
        />
      </div>
    );
  }

  // ── Campaign Detail View ──────────────────────────────────────────────────

  const totalTarget  = campaignTotals.totalTarget;
  const totalCovered = campaignTotals.totalCovered;

  return (
    <div className="space-y-4">
      {/* Back + header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(null)} className="gap-1.5 h-8">
            <ChevronLeft className="h-3.5 w-3.5" /> Campaigns
          </Button>
          <div>
            <h2 className="text-lg font-bold leading-tight">{selectedCampaign.campaign_name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge className={`text-[10px] ${statusColor(selectedCampaign.status)} border-0`}>{selectedCampaign.status}</Badge>
              {selectedCampaign.state && <span className="text-xs text-muted-foreground">{selectedCampaign.state}{selectedCampaign.locality ? ` › ${selectedCampaign.locality}` : ''}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportCompletion}>
            <Download className="h-3.5 w-3.5" /> Export Report
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setShowAddVillage(true)}>
                <MapPin className="h-3.5 w-3.5" /> Add Village
              </Button>
              <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setShowAssignTeam(true)}>
                <Users className="h-3.5 w-3.5" /> Assign Team
              </Button>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => setShowDailyLog(true)}>
                <Plus className="h-3.5 w-3.5" /> Daily Log
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => loadCampaignDetail(selectedCampaign.id)}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-500 hover:text-red-600" onClick={() => deleteCampaign(selectedCampaign.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total HH Target', value: totalTarget.toLocaleString(), icon: Target, color: 'text-blue-600' },
          { label: 'HH Covered', value: totalCovered.toLocaleString(), icon: CheckCircle2, color: 'text-emerald-600' },
          { label: 'Villages', value: villages.length, icon: MapPin, color: 'text-amber-600' },
          { label: 'Teams Active', value: new Set(assignments.filter(a => a.status === 'active').map(a => a.team_id)).size, icon: Users, color: 'text-purple-600' },
        ].map(s => (
          <Card key={s.label} className="border-0 shadow-sm">
            <CardContent className="p-3 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color} opacity-70 shrink-0`} />
              <div>
                <p className="text-xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Progress bar */}
      {totalTarget > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Overall Coverage</span>
            <span className="font-semibold text-foreground">{pct(totalCovered, totalTarget)}%</span>
          </div>
          <Progress value={pct(totalCovered, totalTarget)} className="h-2.5" />
        </div>
      )}

      {/* ── Detail Tabs ──────────────────────────────────────────────────────── */}
      <Tabs value={campaignTab} onValueChange={setCampaignTab}>
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><BarChart3 className="h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="villages" className="text-xs gap-1.5"><MapPin className="h-3.5 w-3.5" />Villages</TabsTrigger>
          <TabsTrigger value="teams" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" />Teams</TabsTrigger>
          <TabsTrigger value="logs" className="text-xs gap-1.5"><Activity className="h-3.5 w-3.5" />Daily Logs</TabsTrigger>
          <TabsTrigger value="report" className="text-xs gap-1.5"><FileText className="h-3.5 w-3.5" />Completion</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4">
          {villages.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">No villages added yet. <Button variant="link" className="p-0 h-auto" onClick={() => setShowAddVillage(true)}>Add one →</Button></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {villages.map(v => {
                const vilPct = pct(v.hh_covered || 0, v.hh_target);
                const vilAssigns = assignments.filter(a => a.village_id === v.id);
                return (
                  <Card key={v.id} className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{v.village_name}</p>
                          <p className="text-xs text-muted-foreground">{v.village_code}</p>
                        </div>
                        <Badge className={`text-[10px] ${statusColor(v.status)} border-0`}>{v.status.replace('_',' ')}</Badge>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{(v.hh_covered||0).toLocaleString()} / {v.hh_target.toLocaleString()} HH</span>
                          <span className="font-semibold">{vilPct}%</span>
                        </div>
                        <Progress value={vilPct} className="h-2" />
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{vilAssigns.length} team{vilAssigns.length !== 1 ? 's' : ''}</span>
                        {v.state && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{v.state}</span>}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* VILLAGES */}
        <TabsContent value="villages" className="mt-4">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Code</TableHead>
                  <TableHead>Village Name</TableHead>
                  <TableHead>State / Locality</TableHead>
                  <TableHead className="text-right">HH Target</TableHead>
                  <TableHead className="text-right">HH Covered</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                  <TableHead>Teams</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {villages.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No villages yet</TableCell></TableRow>
                ) : villages.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-mono text-xs">{v.village_code}</TableCell>
                    <TableCell className="font-medium">{v.village_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{[v.state, v.locality].filter(Boolean).join(' › ') || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{v.hh_target.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 font-semibold">{(v.hh_covered||0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Progress value={pct(v.hh_covered||0, v.hh_target)} className="h-1.5 w-16" />
                        <span className="text-xs tabular-nums w-8">{pct(v.hh_covered||0, v.hh_target)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{v.team_count ?? 0}</TableCell>
                    <TableCell><Badge className={`text-[10px] border-0 ${statusColor(v.status)}`}>{v.status.replace('_',' ')}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TEAMS */}
        <TabsContent value="teams" className="mt-4 space-y-4">
          {/* Per-village breakdown */}
          {villages.map(v => {
            const vilAssigns = assignments.filter(a => a.village_id === v.id);
            return (
              <div key={v.id}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  {v.village_name} <span className="text-muted-foreground font-normal">({v.village_code})</span>
                  <span className="ml-auto text-xs text-muted-foreground font-normal">{(v.hh_covered||0).toLocaleString()} / {v.hh_target.toLocaleString()} HH covered</span>
                </h3>
                <div className="rounded-md border overflow-x-auto mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Team Code</TableHead>
                        <TableHead>Team Name</TableHead>
                        <TableHead>Team Lead</TableHead>
                        <TableHead className="text-right">Members</TableHead>
                        <TableHead className="text-right">Team HH Target</TableHead>
                        <TableHead className="text-right">HH Covered</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vilAssigns.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground text-xs">No teams assigned to this village yet</TableCell></TableRow>
                      ) : vilAssigns.map(a => (
                        <TableRow key={a.id}>
                          <TableCell className="font-mono text-xs font-semibold">{a.team_code}</TableCell>
                          <TableCell>{a.team_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{a.team_lead_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{a.member_count}</TableCell>
                          <TableCell className="text-right tabular-nums">{a.hh_target_for_team?.toLocaleString() || '—'}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-600 font-semibold">{(a.hh_covered||0).toLocaleString()}</TableCell>
                          <TableCell><Badge className={`text-[10px] border-0 ${statusColor(a.status)}`}>{a.status}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* DAILY LOGS */}
        <TabsContent value="logs" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={logFilterVillage} onValueChange={setLogFilterVillage}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All villages" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All villages</SelectItem>
                {villages.map(v => <SelectItem key={v.id} value={v.id}>{v.village_name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={logFilterTeam} onValueChange={setLogFilterTeam}>
              <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="All teams" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All teams</SelectItem>
                {[...new Map(assignments.map(a => [a.team_id, a])).values()].map(a => (
                  <SelectItem key={a.team_id} value={a.team_id}>{a.team_code} — {a.team_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">{filteredLogs.length} record{filteredLogs.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-6" />
                  <TableHead>Date</TableHead>
                  <TableHead>Village</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">HH Covered</TableHead>
                  <TableHead className="text-right">Male</TableHead>
                  <TableHead className="text-right">Female</TableHead>
                  <TableHead className="text-right">Beneficiaries</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Submitted By</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-center">Photos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLogs.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No daily logs yet</TableCell></TableRow>
                ) : filteredLogs.map(l => {
                  const photos = photosByLogId[l.id] || [];
                  const isExpanded = expandedLogId === l.id;
                  return (
                    <>
                      <TableRow key={l.id} className={isExpanded ? 'border-b-0' : undefined}>
                        <TableCell className="pr-0">
                          {photos.length > 0 && (
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setExpandedLogId(isExpanded ? null : l.id)}
                            >
                              {isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5" />
                                : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">{l.report_date}</TableCell>
                        <TableCell className="text-xs">{l.village_name}</TableCell>
                        <TableCell className="text-xs"><span className="font-mono text-[10px] text-muted-foreground">{l.team_code}</span> {l.team_name}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-emerald-600">{l.hh_covered.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{l.male_count.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{l.female_count.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{l.beneficiaries.toLocaleString()}</TableCell>
                        <TableCell className="text-xs max-w-[160px] truncate text-muted-foreground">{l.notes || '—'}</TableCell>
                        <TableCell className="text-xs">{l.submitted_by_name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{l.source}</Badge></TableCell>
                        <TableCell className="text-center">
                          {photos.length > 0 ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              onClick={() => setExpandedLogId(isExpanded ? null : l.id)}
                            >
                              <ImageIcon className="h-3 w-3" />
                              {photos.length}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* ── Expandable photo strip ── */}
                      {isExpanded && photos.length > 0 && (
                        <TableRow key={`${l.id}-photos`} className="bg-muted/20">
                          <TableCell colSpan={12} className="py-3 px-4">
                            <div className="flex flex-wrap gap-2">
                              {photos.map((p, idx) => (
                                <a
                                  key={idx}
                                  href={p.photo_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block w-20 h-20 rounded overflow-hidden border bg-muted hover:opacity-80 transition-opacity"
                                  title={p.caption || `Photo ${idx + 1}`}
                                >
                                  <img
                                    src={p.photo_url}
                                    alt={p.caption || `Field photo ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                                  />
                                </a>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* COMPLETION REPORT */}
        <TabsContent value="report" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Completion Summary</h3>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={exportCompletion}>
              <Download className="h-3.5 w-3.5" /> Export Excel
            </Button>
          </div>

          {/* By Village */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide">By Village</p>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Code</TableHead>
                    <TableHead>Village</TableHead>
                    <TableHead className="text-right">HH Target</TableHead>
                    <TableHead className="text-right">HH Covered</TableHead>
                    <TableHead className="text-right">Progress</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {villages.map(v => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono text-xs">{v.village_code}</TableCell>
                      <TableCell className="font-medium text-sm">{v.village_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.hh_target.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 font-bold">{(v.hh_covered||0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={pct(v.hh_covered||0, v.hh_target)} className="h-1.5 w-16" />
                          <span className="text-xs tabular-nums">{pct(v.hh_covered||0, v.hh_target)}%</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge className={`text-[10px] border-0 ${statusColor(v.status)}`}>{v.status.replace('_',' ')}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  {villages.length > 0 && (
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell colSpan={2} className="text-right text-xs uppercase tracking-wide text-muted-foreground">TOTAL</TableCell>
                      <TableCell className="text-right tabular-nums">{totalTarget.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-700">{totalCovered.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={pct(totalCovered, totalTarget)} className="h-1.5 w-16" />
                          <span className="text-xs tabular-nums">{pct(totalCovered, totalTarget)}%</span>
                        </div>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* By Team */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide">By Team</p>
            {(() => {
              const byTeam: Record<string, { code: string; name: string; lead: string; villages: Set<string>; hh: number; bens: number }> = {};
              for (const a of assignments) {
                if (!byTeam[a.team_id]) byTeam[a.team_id] = { code: a.team_code||'', name: a.team_name||'', lead: a.team_lead_name||'', villages: new Set(), hh: 0, bens: 0 };
                byTeam[a.team_id].villages.add(a.village_name || '');
                byTeam[a.team_id].hh += a.hh_covered || 0;
              }
              for (const l of dailyLogs) {
                if (byTeam[l.team_id]) byTeam[l.team_id].bens += l.beneficiaries || 0;
              }
              const rows = Object.values(byTeam);
              return (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Team Code</TableHead>
                        <TableHead>Team Name</TableHead>
                        <TableHead>Team Lead</TableHead>
                        <TableHead>Villages Worked</TableHead>
                        <TableHead className="text-right">Total HH</TableHead>
                        <TableHead className="text-right">Beneficiaries</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No team data yet</TableCell></TableRow>
                      ) : rows.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs font-semibold">{t.code}</TableCell>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{t.lead}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{[...t.villages].join(', ')}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold text-emerald-600">{t.hh.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.bens.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
          </div>

          {/* Campaign info */}
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              ['Campaign', selectedCampaign.campaign_name],
              ['Coordinator', selectedCampaign.coordinator_name || '—'],
              ['Supervisor', selectedCampaign.supervisor_name || '—'],
              ['Period', [fmtDate(selectedCampaign.start_date), fmtDate(selectedCampaign.end_date)].filter(d => d !== '—').join(' → ') || '—'],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{label}:</span> {value}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Add Village Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showAddVillage} onOpenChange={setShowAddVillage}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Village</DialogTitle>
            <DialogDescription>Add a new village to {selectedCampaign.campaign_name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Village Name *</Label>
              <Input value={villageForm.village_name} onChange={e => setVillageForm(f => ({ ...f, village_name: e.target.value }))} placeholder="Village name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Village Code</Label>
                <Input value={villageForm.village_code} onChange={e => setVillageForm(f => ({ ...f, village_code: e.target.value }))} placeholder={autoVillageCode(villages.length)} />
              </div>
              <div>
                <Label>HH Target</Label>
                <Input type="number" min="0" value={villageForm.hh_target} onChange={e => setVillageForm(f => ({ ...f, hh_target: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>State</Label>
                <Select value={villageForm.state} onValueChange={v => setVillageForm(f => ({ ...f, state: v, locality: '' }))}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{sudanStates.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Locality</Label>
                <Input value={villageForm.locality} onChange={e => setVillageForm(f => ({ ...f, locality: e.target.value }))} placeholder="Locality" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddVillage(false)}>Cancel</Button>
            <Button onClick={submitAddVillage} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Add Village
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign Team Dialog ────────────────────────────────────────────────── */}
      <Dialog open={showAssignTeam} onOpenChange={setShowAssignTeam}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Team to Village</DialogTitle>
            <DialogDescription>A team can be assigned to multiple villages and move between them</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Team *</Label>
              <Select value={assignForm.team_id} onValueChange={v => setAssignForm(f => ({ ...f, team_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select team" /></SelectTrigger>
                <SelectContent>
                  {allTeams.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground text-center">No teams. Create one in the Team Registry first.</div>
                  ) : allTeams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.team_code} — {t.team_name} ({t.member_count} members)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Village *</Label>
              <Select value={assignForm.village_id} onValueChange={v => setAssignForm(f => ({ ...f, village_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select village" /></SelectTrigger>
                <SelectContent>{villages.map(v => <SelectItem key={v.id} value={v.id}>{v.village_code} — {v.village_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Team HH Target (optional)</Label>
              <Input type="number" min="0" value={assignForm.hh_target_for_team} onChange={e => setAssignForm(f => ({ ...f, hh_target_for_team: e.target.value }))} placeholder="Sub-target for this team in this village" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignTeam(false)}>Cancel</Button>
            <Button onClick={submitAssignTeam} disabled={saving || !assignForm.team_id || !assignForm.village_id}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Assign Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Daily Log Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={showDailyLog} onOpenChange={setShowDailyLog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Daily Progress Log</DialogTitle>
            <DialogDescription>Record today's fieldwork progress for a team</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Team Assignment *</Label>
              <Select value={logForm.assignment_id} onValueChange={v => setLogForm(f => ({ ...f, assignment_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select team → village" /></SelectTrigger>
                <SelectContent>
                  {assignments.filter(a => a.status === 'active').map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.team_code} → {a.village_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Report Date *</Label>
              <Input type="date" value={logForm.report_date} onChange={e => setLogForm(f => ({ ...f, report_date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>HH Covered Today</Label>
                <Input type="number" min="0" value={logForm.hh_covered} onChange={e => setLogForm(f => ({ ...f, hh_covered: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Beneficiaries</Label>
                <Input type="number" min="0" value={logForm.beneficiaries} onChange={e => setLogForm(f => ({ ...f, beneficiaries: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Male</Label>
                <Input type="number" min="0" value={logForm.male_count} onChange={e => setLogForm(f => ({ ...f, male_count: e.target.value }))} placeholder="0" />
              </div>
              <div>
                <Label>Female</Label>
                <Input type="number" min="0" value={logForm.female_count} onChange={e => setLogForm(f => ({ ...f, female_count: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Notes / Observations</Label>
              <Textarea value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any observations, issues, or highlights from today's fieldwork…" rows={3} />
            </div>

            {/* ── Photo upload ─────────────────────────────────── */}
            <div>
              <Label className="flex items-center gap-1.5 mb-1.5">
                <Camera className="h-3.5 w-3.5" /> Field Photos
                <span className="text-xs text-muted-foreground font-normal">(optional)</span>
              </Label>

              {/* Thumbnail preview of selected photos */}
              {logPhotos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {logPhotos.map((file, idx) => {
                    const src = URL.createObjectURL(file);
                    return (
                      <div key={idx} className="relative group w-16 h-16 rounded overflow-hidden border bg-muted">
                        <img src={src} alt={`photo-${idx}`} className="w-full h-full object-cover" onLoad={() => URL.revokeObjectURL(src)} />
                        <button
                          type="button"
                          className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setLogPhotos(prev => prev.filter((_, i) => i !== idx))}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                  onClick={() => logPhotoInputRef.current?.click()}>
                  <ImageIcon className="h-3.5 w-3.5" /> Add Photos
                </Button>
                {logPhotos.length > 0 && (
                  <span className="text-xs text-muted-foreground self-center">
                    {logPhotos.length} photo{logPhotos.length !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              <input
                ref={logPhotoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  setLogPhotos(prev => [...prev, ...files]);
                  // Reset input so same file can be re-selected after removal
                  e.target.value = '';
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDailyLog(false); setLogPhotos([]); }}>Cancel</Button>
            <Button onClick={submitDailyLog} disabled={saving || !logForm.assignment_id}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Save Log
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Team Registry Dialog ──────────────────────────────────────────────────────

function TeamRegistryDialog({
  open, onOpenChange, teams, profiles, onRefresh, canManage,
  showCreateTeam, setShowCreateTeam, teamForm, setTeamForm,
  onSubmitTeam, saving, autoCode, onDeleteTeam,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  teams: Team[]; profiles: ProfileOption[];
  onRefresh: () => void; canManage: boolean;
  showCreateTeam: boolean; setShowCreateTeam: (v: boolean) => void;
  teamForm: { team_name: string; team_code: string; team_lead_id: string; member_count: string; notes: string };
  setTeamForm: (f: any) => void;
  onSubmitTeam: () => void; saving: boolean;
  autoCode: () => string;
  onDeleteTeam: (id: string) => void;
}) {
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Team Registry</DialogTitle>
            <DialogDescription>Global team list — teams can be assigned to any campaign or village</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mb-2">
            {canManage && (
              <Button size="sm" onClick={() => { setTeamForm({ team_name:'', team_code: autoCode(), team_lead_id:'', member_count:'', notes:'' }); setShowCreateTeam(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New Team
              </Button>
            )}
          </div>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>Code</TableHead>
                  <TableHead>Team Name</TableHead>
                  <TableHead>Team Lead</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead>Notes</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {teams.length === 0 ? (
                  <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">No teams yet. Create the first one →</TableCell></TableRow>
                ) : teams.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs font-semibold">{t.team_code}</TableCell>
                    <TableCell className="font-medium">{t.team_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.team_lead_name || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.member_count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{t.notes || '—'}</TableCell>
                    {canManage && (
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600" onClick={() => onDeleteTeam(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Team sub-dialog */}
      <Dialog open={showCreateTeam} onOpenChange={setShowCreateTeam}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Team Name *</Label>
                <Input value={teamForm.team_name} onChange={e => setTeamForm((f: any) => ({ ...f, team_name: e.target.value }))} placeholder="e.g. North Darfur Alpha" />
              </div>
              <div>
                <Label>Team Code *</Label>
                <Input value={teamForm.team_code} onChange={e => setTeamForm((f: any) => ({ ...f, team_code: e.target.value }))} placeholder="TM-001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Team Lead</Label>
                <Select value={teamForm.team_lead_id} onValueChange={v => setTeamForm((f: any) => ({ ...f, team_lead_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select lead" /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name || p.username}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Member Count</Label>
                <Input type="number" min="0" value={teamForm.member_count} onChange={e => setTeamForm((f: any) => ({ ...f, member_count: e.target.value }))} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={teamForm.notes} onChange={e => setTeamForm((f: any) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes about this team…" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTeam(false)}>Cancel</Button>
            <Button onClick={onSubmitTeam} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />} Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
