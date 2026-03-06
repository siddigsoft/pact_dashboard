import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { ClipboardCheck, Save, ChevronDown, ChevronUp, Camera } from 'lucide-react';

const ACTIVITY_TYPES = [
  { key: 'AM', label: 'Activity Monitoring (AM)' },
  { key: 'DM', label: 'Distribution Monitoring (DM)' },
  { key: 'PDM', label: 'Post Distribution Monitoring (PDM)' },
  { key: 'MDM', label: 'Market Distribution Monitoring (MDM)' },
  { key: 'PHL', label: 'Post Harvest Loss (PHL)' },
];

const AM_QUESTIONS = [
  'Were planned activities implemented as scheduled?',
  'Was beneficiary targeting conducted correctly?',
  'Were women/girls adequately represented (>50%)?',
  'Were people with disabilities included?',
  'Was there any evidence of discrimination?',
  'Were community leaders engaged?',
  'Were complaints/feedback mechanisms in place?',
];

const DM_QUESTIONS = [
  'Were correct items/quantities distributed?',
  'Were distribution lists verified against IDs?',
  'Was the distribution site appropriate and accessible?',
  'Were all registered beneficiaries served?',
  'Was the distribution conducted in a dignified manner?',
  'Were commodities in good condition?',
];

const PDM_QUESTIONS = [
  'Did beneficiaries receive their full entitlement?',
  'Were items in good condition upon receipt?',
  'Has the household used/consumed the items?',
  'Were items appropriate for household needs?',
  'Were there any diversion concerns noted?',
  'Would beneficiary participate in future programs?',
];

type ResponseValue = 'yes' | 'no' | 'partial' | 'na' | '';

interface SectionState {
  expanded: boolean;
  responses: Record<string, ResponseValue>;
  comments: Record<string, string>;
  priority: Record<string, string>;
}

export default function MonitoringForm() {
  const { user } = useAppContext();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  const [header, setHeader] = useState({
    enumerator_name: '',
    enumerator_contact: '',
    team_leader: '',
    hub: '',
    site_name: '',
    site_id: '',
    visit_date: new Date().toISOString().split('T')[0],
    visit_time: '',
    mmp_code: '',
    state: '',
    locality: '',
  });

  const [selectedActivities, setSelectedActivities] = useState<Record<string, boolean>>({
    AM: false, DM: false, PDM: false, MDM: false, PHL: false,
  });

  const [sections, setSections] = useState<Record<string, SectionState>>({
    AM: { expanded: false, responses: {}, comments: {}, priority: {} },
    DM: { expanded: false, responses: {}, comments: {}, priority: {} },
    PDM: { expanded: false, responses: {}, comments: {}, priority: {} },
  });

  const [generalNotes, setGeneralNotes] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(false);

  function setResponse(section: string, question: string, value: ResponseValue) {
    setSections(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        responses: { ...prev[section].responses, [question]: value },
      },
    }));
  }

  function setComment(section: string, question: string, value: string) {
    setSections(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        comments: { ...prev[section].comments, [question]: value },
      },
    }));
  }

  function toggleSection(key: string) {
    setSections(prev => ({
      ...prev,
      [key]: { ...prev[key], expanded: !prev[key].expanded },
    }));
  }

  function getQuestions(key: string) {
    if (key === 'AM') return AM_QUESTIONS;
    if (key === 'DM') return DM_QUESTIONS;
    if (key === 'PDM') return PDM_QUESTIONS;
    return [];
  }

  function getResponseColor(val: ResponseValue) {
    if (val === 'yes') return 'bg-green-100 border-green-400 text-green-800';
    if (val === 'no') return 'bg-red-100 border-red-400 text-red-800';
    if (val === 'partial') return 'bg-yellow-100 border-yellow-400 text-yellow-800';
    if (val === 'na') return 'bg-gray-100 border-gray-400 text-gray-600';
    return 'bg-background border-border';
  }

  async function saveForm() {
    if (!header.enumerator_name || !header.site_name || !header.visit_date) {
      toast({ title: 'Please fill required fields: enumerator name, site name, and visit date', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...header,
        selected_activities: Object.keys(selectedActivities).filter(k => selectedActivities[k]),
        section_responses: sections,
        general_notes: generalNotes,
        recommendations,
        follow_up_required: followUpRequired,
        submitted_by: user?.id,
        status: 'submitted',
      };
      const { error } = await supabase.from('monitoring_forms').insert(payload);
      if (error) throw error;
      toast({ title: 'Monitoring form submitted successfully' });
      setCurrentStep(1);
    } catch (e: any) {
      toast({ title: 'Submission failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const activeActivities = Object.keys(selectedActivities).filter(k => selectedActivities[k]);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-green-600" />
            Comprehensive Monitoring Form
          </h1>
          <p className="text-muted-foreground mt-1">Complete field monitoring assessment for site visits</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Step {currentStep} of 3</span>
          <div className="flex gap-1">
            {[1, 2, 3].map(s => (
              <div key={s} className={`w-8 h-2 rounded-full ${currentStep >= s ? 'bg-primary' : 'bg-muted'}`} />
            ))}
          </div>
        </div>
      </div>

      {currentStep === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Step 1: Enumerator & Site Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'enumerator_name', label: 'Enumerator Name *', placeholder: 'Full name' },
                { key: 'enumerator_contact', label: 'Enumerator Contact', placeholder: 'Phone number' },
                { key: 'team_leader', label: 'Team Leader', placeholder: 'Team leader name' },
                { key: 'hub', label: 'Hub / Location', placeholder: 'Hub name' },
                { key: 'site_name', label: 'Site Name *', placeholder: 'Distribution site name' },
                { key: 'site_id', label: 'Site ID / MoDa Code', placeholder: 'Site identifier' },
                { key: 'mmp_code', label: 'MMP Code', placeholder: 'e.g. MMP-2026-001' },
                { key: 'state', label: 'State', placeholder: 'State' },
                { key: 'locality', label: 'Locality', placeholder: 'Locality / Admin Unit' },
              ].map(field => (
                <div key={field.key} className="space-y-2">
                  <Label>{field.label}</Label>
                  <Input
                    placeholder={field.placeholder}
                    value={(header as any)[field.key]}
                    onChange={e => setHeader(h => ({ ...h, [field.key]: e.target.value }))}
                    data-testid={`input-${field.key}`}
                  />
                </div>
              ))}
              <div className="space-y-2">
                <Label>Visit Date *</Label>
                <Input type="date" value={header.visit_date} onChange={e => setHeader(h => ({ ...h, visit_date: e.target.value }))} data-testid="input-visit-date" />
              </div>
              <div className="space-y-2">
                <Label>Visit Time</Label>
                <Input type="time" value={header.visit_time} onChange={e => setHeader(h => ({ ...h, visit_time: e.target.value }))} data-testid="input-visit-time" />
              </div>
            </div>
            <div className="flex justify-end mt-4">
              <Button onClick={() => setCurrentStep(2)} data-testid="button-next-step1">Next: Select Activities →</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Step 2: Activities Monitored</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {ACTIVITY_TYPES.map(act => (
                <div key={act.key} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setSelectedActivities(prev => ({ ...prev, [act.key]: !prev[act.key] }))}
                  data-testid={`checkbox-activity-${act.key}`}>
                  <Checkbox checked={selectedActivities[act.key]} onCheckedChange={checked => setSelectedActivities(prev => ({ ...prev, [act.key]: !!checked }))} />
                  <div>
                    <p className="font-medium">{act.key}</p>
                    <p className="text-sm text-muted-foreground">{act.label}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {activeActivities.map(key => {
            const questions = getQuestions(key);
            if (!questions.length) return null;
            const section = sections[key];
            return (
              <Card key={key}>
                <CardHeader
                  className="cursor-pointer flex flex-row items-center justify-between pb-2"
                  onClick={() => toggleSection(key)}
                >
                  <CardTitle className="text-base">{ACTIVITY_TYPES.find(a => a.key === key)?.label}</CardTitle>
                  {section.expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </CardHeader>
                {section.expanded && (
                  <CardContent className="space-y-4">
                    {questions.map((q, i) => (
                      <div key={i} className="space-y-2 pb-3 border-b last:border-0">
                        <p className="text-sm font-medium">{i + 1}. {q}</p>
                        <div className="flex flex-wrap gap-2">
                          {(['yes', 'no', 'partial', 'na'] as ResponseValue[]).map(val => (
                            <button
                              key={val}
                              onClick={() => setResponse(key, q, val)}
                              className={`px-3 py-1 rounded border text-sm capitalize transition-colors ${section.responses[q] === val ? getResponseColor(val) : 'border-border hover:bg-muted'}`}
                              data-testid={`response-${key}-${i}-${val}`}
                            >
                              {val === 'na' ? 'N/A' : val.charAt(0).toUpperCase() + val.slice(1)}
                            </button>
                          ))}
                        </div>
                        <Input
                          placeholder="Comments (optional)"
                          value={section.comments[q] || ''}
                          onChange={e => setComment(key, q, e.target.value)}
                          className="text-sm"
                          data-testid={`comment-${key}-${i}`}
                        />
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(1)} data-testid="button-back-step2">← Back</Button>
            <Button onClick={() => setCurrentStep(3)} data-testid="button-next-step2">Next: Summary →</Button>
          </div>
        </div>
      )}

      {currentStep === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Step 3: Summary & Recommendations</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>General Observations / Notes</Label>
                <Textarea rows={4} placeholder="Overall observations from the visit..." value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} data-testid="textarea-general-notes" />
              </div>
              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea rows={3} placeholder="Key recommendations for follow-up..." value={recommendations} onChange={e => setRecommendations(e.target.value)} data-testid="textarea-recommendations" />
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <Checkbox checked={followUpRequired} onCheckedChange={v => setFollowUpRequired(!!v)} id="followup" data-testid="checkbox-followup" />
                <label htmlFor="followup" className="text-sm cursor-pointer">Follow-up visit required</label>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg text-sm space-y-1">
                <p className="font-medium">Form Summary</p>
                <p>Site: <span className="font-medium">{header.site_name || 'Not set'}</span></p>
                <p>Date: <span className="font-medium">{header.visit_date}</span></p>
                <p>Activities: <span className="font-medium">{activeActivities.join(', ') || 'None selected'}</span></p>
                <p>Enumerator: <span className="font-medium">{header.enumerator_name || 'Not set'}</span></p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(2)} data-testid="button-back-step3">← Back</Button>
            <Button onClick={saveForm} disabled={saving} className="gap-2" data-testid="button-submit-form">
              <Save className="w-4 h-4" />
              {saving ? 'Submitting...' : 'Submit Monitoring Form'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
