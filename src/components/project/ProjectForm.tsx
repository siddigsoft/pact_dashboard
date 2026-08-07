import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, X, UserCircle, GitBranch, ChevronDown, ChevronUp, Handshake, Loader2, DollarSign, Wallet, BarChart3, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getProjectFlow } from '@/config/projectFlows';
import { getProjectTypeConfig } from '@/config/projectTypeConfig';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { Project, ProjectType, ProjectStatus, ProjectTeamMember } from '@/types/project';
import { useUser } from '@/context/user/UserContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/toast';
import { ActivityManager } from '@/components/project/activity/ActivityManager';
import { countries, getRegionsByCountry, getStatesByRegion, getLocalitiesByState } from '@/data/countryData';
import { SUPPORTED_CURRENCIES } from '@/utils/currencyUtils';
import { GlobeIcon, MapPinIcon } from 'lucide-react';
import { TeamCompositionManager } from '@/components/project/team/TeamCompositionManager';
import { sudanStates, SudanState } from '@/data/sudanStates';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { LinkedEntitiesSection } from '@/components/project/LinkedEntitiesSection';

const createFormSchema = (isEditing: boolean) => z.object({
  name: z.string().min(3, {
    message: 'Project name must be at least 3 characters.',
  }),
  description: z.string().optional(),
  projectType: z.enum([
    'tpm', 'baseline_survey', 'endline_survey', 'assessment', 'evaluation',
    'research', 'capacity_building', 'compliance', 'infrastructure', 'proposal', 'other',
    // legacy values kept for editing existing records
    'survey', 'monitoring', 'training',
  ]),
  status: z.enum(['draft', 'active', 'onHold', 'completed', 'cancelled']),
  projectManager: z.string().optional(),
  startDate: z.date({
    required_error: 'Start date is required.',
  }),
  endDate: z.date({
    required_error: 'End date is required.',
  }),
  budgetTotal: z.coerce.number().min(0).optional(),
  budgetCurrency: z.string(),
  budgetExpenseCurrency: z.string(),
  country: z.string({
    required_error: 'Country is required',
  }),
  region: z.string().optional(),
  selectedState: z.string().optional(),
  state: z.string().optional(),
  locality: z.string().optional(),
  clientType: z.enum(['internal', 'customer']),
  clientName: z.string().optional(),
  partnerId: z.string().optional(),
}).refine(
  (data) => data.endDate > data.startDate,
  {
    message: 'End date must be after the start date',
    path: ['endDate'],
  }
);

type FormSchema = z.infer<ReturnType<typeof createFormSchema>>;

type PmUserRef = { id: string; name: string; performance?: { currentWorkload?: number } };

/**
 * When projectManager changes, keep teamComposition aligned:
 * - promote/add the selected PM with role projectManager
 * - demote any former PM still on the team (role → other)
 */
function syncProjectManagerInTeam(
  members: ProjectTeamMember[],
  pmUser: PmUserRef | undefined,
): ProjectTeamMember[] {
  const existing = Array.isArray(members) ? members : [];

  const updated = existing.map((member) => {
    if (member.role !== 'projectManager') return member;
    if (pmUser?.id && member.userId === pmUser.id) {
      return { ...member, name: pmUser.name, role: 'projectManager' as const };
    }
    return { ...member, role: 'other' as const };
  });

  if (!pmUser?.id) return updated;

  const pmIndex = updated.findIndex((m) => m.userId === pmUser.id);
  if (pmIndex >= 0) {
    const next = [...updated];
    next[pmIndex] = {
      ...next[pmIndex],
      name: pmUser.name,
      role: 'projectManager',
    };
    return next;
  }

  return [
    ...updated,
    {
      userId: pmUser.id,
      name: pmUser.name,
      role: 'projectManager',
      joinedAt: new Date().toISOString(),
      memberType: 'internal',
      workload: pmUser.performance?.currentWorkload || 0,
    },
  ];
}

function resolvePmUser(
  pmName: string,
  candidates: PmUserRef[],
): PmUserRef | undefined {
  if (!pmName) return undefined;
  return candidates.find((u) => String(u.name).trim() === pmName);
}

export interface BudgetFormData {
  budgetPeriod: 'monthly' | 'quarterly' | 'annual' | 'project_lifetime';
  fiscalYear: string;
  categoryAllocations: Record<string, string>;
  budgetNotes: string;
}

interface ProjectFormProps {
  onSubmit: (data: Project, budgetConfig?: BudgetFormData) => void | Promise<void>;
  initialData?: Partial<Project>;
  isEditing?: boolean;
}

interface FlowTypePreviewProps {
  stages: { id: string; label: string; description?: string }[];
  typeName: string;
}

const FlowTypePreview: React.FC<FlowTypePreviewProps> = ({ stages, typeName }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2 rounded-md border border-[#1D3461]/20 bg-[#0F2041]/5 dark:bg-[#1D3461]/10 text-xs">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 text-[#1D3461] dark:text-blue-300 font-medium"
        onClick={() => setExpanded(v => !v)}
        data-testid="button-toggle-flow-preview"
      >
        <span className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          {stages.length}-stage flow for {typeName}
        </span>
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-1.5">
          {stages.map((s, i) => (
            <div key={s.id} className="flex items-start gap-2">
              <span className="flex-shrink-0 h-4 w-4 rounded-full bg-[#1D3461]/20 dark:bg-[#1D3461]/40 text-[#1D3461] dark:text-blue-300 flex items-center justify-center font-bold leading-none" style={{ fontSize: '9px' }}>
                {i + 1}
              </span>
              <div>
                <span className="font-medium text-foreground">{s.label}</span>
                {s.description && (
                  <span className="text-muted-foreground ml-1">— {s.description}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectForm: React.FC<ProjectFormProps> = ({ 
  onSubmit, 
  initialData, 
  isEditing = false 
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { users } = useUser();
  
  const projectManagerUsers = users?.filter(u => 
    u.roles?.some(r => {
      const role = r.toLowerCase();
      const isFieldTeam = role === 'supervisor' || role === 'coordinator' || role === 'datacollector' || role === 'data collector';
      const isPMRole = role.includes('projectmanager') || role.includes('project manager') || role === 'pm' || role === 'fieldopmanager' || role === 'admin';
      return isPMRole && !isFieldTeam;
    })
  ) || [];
  const [selectedCountry, setSelectedCountry] = useState<string>(initialData?.location?.country || '');
  const [selectedRegion, setSelectedRegion] = useState<string>(initialData?.location?.region || '');
  const [selectedState, setSelectedState] = useState<string>(initialData?.location?.state || '');
  const [singleSelectedState, setSingleSelectedState] = useState<string>(
    initialData?.location?.selectedStates && initialData.location.selectedStates.length > 0 
      ? initialData.location.selectedStates[0] 
      : ''
  );
  const [isStatePopoverOpen, setIsStatePopoverOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<ProjectTeamMember[]>(
    initialData?.team?.teamComposition || []
  );
  const [relatedMMPs, setRelatedMMPs] = useState<string[]>(initialData?.relatedMMPs ?? []);
  const [relatedSiteVisits, setRelatedSiteVisits] = useState<string[]>(initialData?.relatedSiteVisits ?? []);
  const [crmPartners, setCrmPartners] = useState<{ id: string; name: string; type: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetFormData['budgetPeriod']>('annual');
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear().toString());
  const [categoryValues, setCategoryValues] = useState<Record<string, string>>({});
  const [categoryDisplayValues, setCategoryDisplayValues] = useState<Record<string, string>>({});
  const [budgetNotes, setBudgetNotes] = useState('');
  const [categoriesExpanded, setCategoriesExpanded] = useState(true);
  useEffect(() => {
    supabase.from('crm_partners').select('id, name, type').eq('status', 'active').order('name')
      .then(({ data }) => { if (data) setCrmPartners(data); });
  }, []);
  
  const formSchema = createFormSchema(isEditing);
  const form = useForm<FormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      projectType: (initialData?.projectType as ProjectType) || 'tpm',
      status: (initialData?.status as ProjectStatus) || 'draft',
      startDate: initialData?.startDate ? new Date(initialData.startDate) : new Date(),
      endDate: initialData?.endDate ? new Date(initialData.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      budgetTotal: Math.max(0, initialData?.budget?.total ?? 0),
      budgetCurrency: initialData?.budget?.currency || 'USD',
      budgetExpenseCurrency: initialData?.budget?.expenseCurrency || initialData?.budget?.currency || 'SDG',
      projectManager: initialData?.team?.projectManager || '',
      country: initialData?.location?.country || '',
      region: initialData?.location?.region || '',
      selectedState: initialData?.location?.selectedStates && initialData.location.selectedStates.length > 0 
        ? initialData.location.selectedStates[0] 
        : '',
      state: initialData?.location?.state || '',
      locality: initialData?.location?.locality || '',
      clientType: (initialData?.clientType as 'internal' | 'customer') || 'internal',
      clientName: initialData?.clientName || '',
      partnerId: initialData?.partnerId || '',
    },
  });

  const watchProjectManager = form.watch('projectManager');

  // When PM changes on edit/create, reflect it in team members immediately.
  useEffect(() => {
    const pmNameRaw = (watchProjectManager ?? '').toString().trim();
    const pmName = pmNameRaw && pmNameRaw.toLowerCase() !== 'none' ? pmNameRaw : '';
    if (pmName && projectManagerUsers.length === 0) return;

    const pmUser = resolvePmUser(pmName, projectManagerUsers);
    if (pmName && !pmUser) return;

    setTeamMembers((prev) => syncProjectManagerInTeam(prev, pmUser));
  }, [watchProjectManager, projectManagerUsers]);

  const handleFormSubmit = async (values: FormSchema) => {
    // T35 — region validation: a Sudan project without any state selection
    // breaks geo-zone matching, MMP coverage, and site dispatch. Block submit
    // and tell the user exactly what to do.
    const isSudan = (values.country || '').toLowerCase() === 'sudan';
    const hasAnyRegion = !!(values.selectedState || values.state);
    if (isSudan && !hasAnyRegion) {
      toast({
        title: "Region required",
        description: "Sudan projects need at least a state. Pick one in the Location section before saving.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const projectCode = isEditing && initialData?.projectCode
        ? initialData.projectCode
        : `PROJ-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const selectedStates = values.selectedState ? [values.selectedState] : [];

      // Ensure the selected Project Manager is always included in the
      // teamComposition so they appear in the "Team" section immediately.
      // In DB, `projects.team.projectManager` is stored as a display name,
      // while `teamComposition` requires the member's `userId`.
      const pmNameRaw = (values.projectManager ?? '').toString().trim();
      const pmName = pmNameRaw && pmNameRaw.toLowerCase() !== 'none' ? pmNameRaw : '';
      const pmUser = resolvePmUser(pmName, projectManagerUsers);
      const teamCompositionWithPm = syncProjectManagerInTeam(
        Array.isArray(teamMembers) ? teamMembers : [],
        pmUser,
      );

      const project: Project = {
        id: initialData?.id || `proj-${Date.now()}`,
        name: values.name,
        projectCode,
        description: values.description,
        projectType: values.projectType,
        status: values.status,
        startDate: values.startDate.toISOString(),
        endDate: values.endDate.toISOString(),
        budget: values.budgetTotal
          ? {
              total: values.budgetTotal,
              currency: values.budgetCurrency,
              expenseCurrency: values.budgetExpenseCurrency,
              allocated: isEditing && initialData?.budget ? initialData.budget.allocated : 0,
              remaining: isEditing && initialData?.budget 
                ? values.budgetTotal - initialData.budget.allocated
                : values.budgetTotal,
            }
          : undefined,
        location: {
          country: values.country,
          region: values.region || '',
          selectedStates: selectedStates,
          state: values.state || '',
          locality: values.locality,
        },
        team: {
          ...(initialData?.team || {}),
          projectManager: pmName || undefined,
          teamComposition: teamCompositionWithPm,
          // Keep legacy `members` in sync for any UI that reads it.
          members: teamCompositionWithPm
            .filter(m => m?.memberType !== 'external')
            .map(m => m.userId)
            .filter(Boolean),
        },
        activities: initialData?.activities || [],
        relatedMMPs,
        relatedSiteVisits,
        clientType: values.clientType,
        clientName: values.clientType === 'customer' ? (values.clientName || undefined) : undefined,
        partnerId: values.partnerId || undefined,
        createdAt: initialData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const budgetConfig: BudgetFormData = {
        budgetPeriod,
        fiscalYear,
        categoryAllocations: categoryValues,
        budgetNotes,
      };
      await onSubmit(project, budgetConfig);

    } catch (error) {
      console.error('Error submitting project form:', error);
      toast({
        title: "Error",
        description: "Failed to save project. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const watchCountry = form.watch('country');
  const watchRegion = form.watch('region');
  const watchState = form.watch('state');
  const watchSelectedState = form.watch('selectedState');
  const watchProjectType = form.watch('projectType');
  const watchBudgetTotal = form.watch('budgetTotal') ?? 0;
  const watchBudgetCurrency = form.watch('budgetCurrency') || 'USD';

  // Formatted display string for Budget Total (shows commas + decimals)
  const formatBudgetDisplay = (n: number) =>
    n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
  const [budgetDisplayValue, setBudgetDisplayValue] = useState(() =>
    formatBudgetDisplay(form.getValues('budgetTotal') ?? 0)
  );

  // Budget categories react to selected project type
  const budgetCategories = getProjectTypeConfig(watchProjectType || 'tpm').budgetCategories;
  const categoryTotal = Object.values(categoryValues).reduce((s, v) => s + (parseFloat(v) || 0), 0);

  useEffect(() => {
    if (watchCountry !== selectedCountry) {
      setSelectedCountry(watchCountry);
      form.setValue('region', '');
      form.setValue('state', '');
      form.setValue('locality', '');
      form.setValue('selectedState', '');
      setSingleSelectedState('');
      
      const country = countries.find(c => c.code === watchCountry);
      if (country) {
        form.setValue('budgetCurrency', country.currency.code);
        form.setValue('budgetExpenseCurrency', country.currency.code);
      }
    }
  }, [watchCountry, selectedCountry, form]);

  useEffect(() => {
    if (watchRegion !== selectedRegion) {
      setSelectedRegion(watchRegion);
      form.setValue('state', '');
      form.setValue('locality', '');
    }
  }, [watchRegion, selectedRegion, form]);

  useEffect(() => {
    if (watchState !== selectedState) {
      setSelectedState(watchState);
      form.setValue('locality', '');
    }
  }, [watchState, selectedState, form]);

  useEffect(() => {
    if (watchSelectedState !== singleSelectedState) {
      setSingleSelectedState(watchSelectedState);
    }
  }, [watchSelectedState, singleSelectedState]);

  const handleTeamChange = (updatedTeam: ProjectTeamMember[]) => {
    setTeamMembers(updatedTeam);
  };

  const getSelectedStateName = (stateId: string): string => {
    const state = sudanStates.find(s => s.id === stateId);
    return state ? state.name : '';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{isEditing ? 'Edit Project' : 'Create New Project'}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name*</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter project name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="projectType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Type*</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select project type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="tpm">Third Party Monitoring (TPM)</SelectItem>
                        <SelectItem value="baseline_survey">Baseline Survey</SelectItem>
                        <SelectItem value="endline_survey">Endline Survey</SelectItem>
                        <SelectItem value="assessment">Field Assessment</SelectItem>
                        <SelectItem value="evaluation">Programme Evaluation</SelectItem>
                        <SelectItem value="research">Research Study</SelectItem>
                        <SelectItem value="capacity_building">Capacity Building</SelectItem>
                        <SelectItem value="compliance">Compliance Review</SelectItem>
                        <SelectItem value="infrastructure">Infrastructure</SelectItem>
                        <SelectItem value="proposal">Proposal / Bid</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                    {/* Flow preview for selected type */}
                    {field.value && (() => {
                      const flowDef = getProjectFlow(field.value as any);
                      if (!flowDef.stages.length) return null;
                      return (
                        <FlowTypePreview stages={flowDef.stages} typeName={flowDef.label} />
                      );
                    })()}
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status*</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="onHold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="internal">Internal</SelectItem>
                        <SelectItem value="customer">Customer / Donor</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch('clientType') === 'customer' && (
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Customer / Donor Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. USAID, UNICEF, World Bank…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="partnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Handshake className="h-4 w-4" />
                      Linked Partner / Donor (CRM)
                    </FormLabel>
                    <Select
                      onValueChange={v => field.onChange(v === 'none' ? '' : v)}
                      value={field.value || 'none'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select from CRM partners…" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">— No partner linked —</SelectItem>
                        {crmPartners.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                            <span className="ml-2 text-xs text-muted-foreground capitalize">({p.type.replace('_', ' ')})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="projectManager"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <UserCircle className="h-4 w-4" />
                      Project Manager
                    </FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      value={field.value || undefined}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select project manager" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {projectManagerUsers.map((user) => (
                          <SelectItem key={user.id} value={user.name}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {countries.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            <div className="flex items-center">
                              <GlobeIcon className="h-4 w-4 mr-2" />
                              {country.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {watchCountry === 'SD' && (
                <FormField
                  control={form.control}
                  name="selectedState"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center text-sm">
                        <MapPinIcon className="h-4 w-4 mr-2" />
                        Sudan State (Optional)
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a state (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {sudanStates.map((state) => (
                            <SelectItem key={state.id} value={state.id}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {watchCountry && watchCountry !== 'SD' && (
                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getRegionsByCountry(watchCountry).map((region) => (
                            <SelectItem key={region.id} value={region.id}>
                              {region.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {watchCountry && watchCountry !== 'SD' && watchRegion && (
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select state" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getStatesByRegion(watchCountry, watchRegion).map((state) => (
                            <SelectItem key={state.id} value={state.id}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {watchCountry && watchCountry !== 'SD' && watchRegion && watchState && (
                <FormField
                  control={form.control}
                  name="locality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Locality</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select locality" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {getLocalitiesByState(watchCountry, watchRegion, watchState).map((locality) => (
                            <SelectItem key={locality.id} value={locality.id}>
                              {locality.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Budget fields moved to the dedicated Budget & Finance section below */}
              
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date*</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date*</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
              
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter project description"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* ══════════════════════════════════════════════════════════════
                 💰  BUDGET & FINANCE
                 All budget setup in one place — replaces the old scattered
                 fields + the separate post-creation budget dialog.
                ══════════════════════════════════════════════════════════════ */}
            <div className="rounded-xl border-2 border-[#1D3461]/15 bg-gradient-to-br from-[#0F2041]/5 to-transparent dark:from-[#1D3461]/15 p-5 space-y-5">

              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-[#1D3461] flex items-center justify-center shrink-0">
                  <DollarSign className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground">Budget & Finance</h3>
                  <p className="text-xs text-muted-foreground">Total budget, currencies, period, and category allocations</p>
                </div>
              </div>

              {/* Accounting GL notice */}
              <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2.5">
                <Info className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  <span className="font-semibold">Accounting GL:</span> Approved cost submissions and advance payments for this project are automatically tagged with the project dimension in all journal entries, enabling real-time budget vs actuals reconciliation.
                </p>
              </div>

              {/* Budget Total + Income Currency */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="budgetTotal"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Wallet className="h-3 w-3 text-[#1D3461]" /> Budget Total
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          inputMode="decimal"
                          placeholder="e.g. 500,000.00"
                          value={budgetDisplayValue}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9.]/g, '');
                            setBudgetDisplayValue(e.target.value.replace(/[^0-9.,]/g, ''));
                            field.onChange(parseFloat(raw) || 0);
                          }}
                          onBlur={() => {
                            setBudgetDisplayValue(formatBudgetDisplay(field.value ?? 0));
                            field.onBlur();
                          }}
                          onFocus={() => {
                            const v = field.value ?? 0;
                            setBudgetDisplayValue(v > 0 ? String(v) : '');
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="budgetCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Income / Budget Currency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-income-currency-form">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.flag} {c.code} – {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Expense Currency + Budget Period */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="budgetExpenseCurrency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expense Currency</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-expense-currency-form">
                            <SelectValue placeholder="Select expense currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              {c.flag} {c.code} – {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">Used when submitting operational costs against this project.</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Budget Period</label>
                  <Select value={budgetPeriod} onValueChange={(v) => setBudgetPeriod(v as BudgetFormData['budgetPeriod'])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      <SelectItem value="project_lifetime">Project Lifetime</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Fiscal Year — shown for annual / quarterly */}
              {(budgetPeriod === 'annual' || budgetPeriod === 'quarterly') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none">Fiscal Year</label>
                    <Input
                      type="number"
                      min="2020"
                      max="2050"
                      value={fiscalYear}
                      onChange={(e) => setFiscalYear(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Category Allocations */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5 text-[#1D3461]" />
                    <span className="text-sm font-medium">Category Allocations</span>
                    <span className="text-xs text-muted-foreground">
                      — {budgetCategories.length} categories for {getProjectTypeConfig(watchProjectType || 'tpm').shortLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setCategoriesExpanded(v => !v)}
                  >
                    {categoriesExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {categoriesExpanded ? 'Collapse' : 'Expand'}
                  </button>
                </div>

                {categoriesExpanded && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg bg-muted/30 border p-3">
                    {budgetCategories.map((cat) => (
                      <div key={cat.key} className="space-y-1.5">
                        <div className="flex items-center gap-1">
                          <label className="text-xs font-medium text-muted-foreground leading-none">{cat.label}</label>
                          {cat.description && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs text-xs">
                                  {cat.description}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex rounded-md shadow-sm">
                          <span className="inline-flex items-center px-2 rounded-l-md border border-r-0 border-input bg-muted text-[11px] font-semibold text-muted-foreground select-none whitespace-nowrap">
                            {watchBudgetCurrency}
                          </span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0"
                            value={categoryDisplayValues[cat.key] ?? categoryValues[cat.key] ?? ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/[^0-9.]/g, '');
                              setCategoryDisplayValues(prev => ({ ...prev, [cat.key]: e.target.value.replace(/[^0-9.,]/g, '') }));
                              setCategoryValues(prev => ({ ...prev, [cat.key]: raw }));
                            }}
                            onFocus={() => {
                              const raw = categoryValues[cat.key] ?? '';
                              setCategoryDisplayValues(prev => ({ ...prev, [cat.key]: raw }));
                            }}
                            onBlur={() => {
                              const num = parseFloat(categoryValues[cat.key] ?? '');
                              setCategoryDisplayValues(prev => ({
                                ...prev,
                                [cat.key]: num > 0
                                  ? num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                  : '',
                              }));
                            }}
                            className="h-8 text-sm rounded-l-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live allocation summary bar */}
                {watchBudgetTotal > 0 && (
                  <div className={cn(
                    'rounded-lg border p-3 space-y-2 transition-colors',
                    categoryTotal > watchBudgetTotal
                      ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
                      : 'bg-muted/40 border-border',
                  )}>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-muted-foreground">Category Allocation</span>
                      <span className={cn('font-bold tabular-nums', categoryTotal > watchBudgetTotal ? 'text-red-600' : 'text-[#1D3461] dark:text-blue-300')}>
                        {watchBudgetCurrency} {categoryTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                        {' / '}
                        {watchBudgetTotal.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all duration-300', categoryTotal > watchBudgetTotal ? 'bg-red-500' : 'bg-[#1D3461]')}
                        style={{ width: `${Math.min(100, watchBudgetTotal > 0 ? (categoryTotal / watchBudgetTotal) * 100 : 0)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        {Math.round((categoryTotal / watchBudgetTotal) * 100)}% allocated
                      </span>
                      <span className={cn('font-medium', categoryTotal > watchBudgetTotal ? 'text-red-600' : 'text-emerald-600')}>
                        {categoryTotal > watchBudgetTotal
                          ? `⚠ ${watchBudgetCurrency} ${(categoryTotal - watchBudgetTotal).toLocaleString()} over budget`
                          : `${watchBudgetCurrency} ${(watchBudgetTotal - categoryTotal).toLocaleString()} unallocated`
                        }
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Budget Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Budget Notes</label>
                <Textarea
                  placeholder="Donor constraints, exchange rate assumptions, contingency policy, funding conditions…"
                  value={budgetNotes}
                  onChange={(e) => setBudgetNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            {isEditing && initialData?.id && (
              <TeamCompositionManager
                project={{
                  ...(initialData as Project),
                  team: {
                    ...(initialData?.team || {}),
                    projectManager: watchProjectManager || initialData?.team?.projectManager,
                    teamComposition: teamMembers,
                    members: teamMembers
                      .filter((m) => m.memberType !== 'external')
                      .map((m) => m.userId)
                      .filter(Boolean),
                  },
                }}
                onTeamChange={handleTeamChange}
              />
            )}
            
            <div className="border-t pt-6">
              {isEditing && initialData?.id &&(
              <ActivityManager
                activities={initialData?.activities || []}
                onActivitiesChange={(activities) => {
                  if (initialData) {
                    const updatedProject: Project = {
                      ...initialData as Project,
                      activities,
                    };
                    onSubmit(updatedProject);
                  }
                }}
                projectType={form.watch('projectType')}
              />
              )
}
            </div>

            <LinkedEntitiesSection
              relatedMMPs={relatedMMPs}
              onRelatedMMPsChange={setRelatedMMPs}
              relatedSiteVisits={relatedSiteVisits}
              onRelatedSiteVisitsChange={setRelatedSiteVisits}
            />

            <div className="flex justify-end space-x-4">
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => navigate(-1)}>Cancel</Button>
              <Button type="submit" className="bg-primary" disabled={isSubmitting} data-testid="button-submit-project">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isEditing ? 'Updating...' : 'Creating...'}
                  </>
                ) : (
                  isEditing ? 'Update Project' : 'Create Project'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default ProjectForm;
