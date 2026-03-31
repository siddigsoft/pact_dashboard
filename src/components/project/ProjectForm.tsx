import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, X, UserCircle, GitBranch, ChevronDown, ChevronUp } from 'lucide-react';
import { getProjectFlow } from '@/config/projectFlows';

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
    'research', 'capacity_building', 'compliance', 'infrastructure', 'other',
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
}).refine(
  (data) => data.endDate > data.startDate,
  {
    message: 'End date must be after the start date',
    path: ['endDate'],
  }
);

type FormSchema = z.infer<ReturnType<typeof createFormSchema>>;

interface ProjectFormProps {
  onSubmit: (data: Project) => void;
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
      budgetTotal: initialData?.budget?.total || 0,
      budgetCurrency: initialData?.budget?.currency || 'USD',
      budgetExpenseCurrency: (initialData?.budget as any)?.expenseCurrency || initialData?.budget?.currency || 'SDG',
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
    },
  });

  const handleFormSubmit = async (values: FormSchema) => {
    try {
      const projectCode = isEditing && initialData?.projectCode
        ? initialData.projectCode
        : `PROJ-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;

      const selectedStates = values.selectedState ? [values.selectedState] : [];

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
          projectManager: values.projectManager,
          teamComposition: teamMembers
        },
        activities: initialData?.activities || [],
        relatedMMPs,
        relatedSiteVisits,
        clientType: values.clientType,
        clientName: values.clientType === 'customer' ? (values.clientName || undefined) : undefined,
        createdAt: initialData?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSubmit(project);

      toast({
        title: isEditing ? "Project Updated" : "Project Created",
        description: `${values.name} has been ${isEditing ? 'updated' : 'created'} successfully.`,
      });

    } catch (error) {
      console.error('Error submitting project form:', error);
      toast({
        title: "Error",
        description: "Failed to save project. Please try again.",
        variant: "destructive",
      });
    }
  };

  const watchCountry = form.watch('country');
  const watchRegion = form.watch('region');
  const watchState = form.watch('state');
  const watchSelectedState = form.watch('selectedState');

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
                      defaultValue={field.value}
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
                      defaultValue={field.value}
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
                      defaultValue={field.value}
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
                        defaultValue={field.value}
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
                        defaultValue={field.value}
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
                        defaultValue={field.value}
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

              <FormField
                control={form.control}
                name="budgetTotal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Budget Total</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        placeholder="Enter budget amount" 
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
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
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
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

              <FormField
                control={form.control}
                name="budgetExpenseCurrency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expense Currency</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
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
                    <p className="text-xs text-muted-foreground mt-1">
                      Currency used when submitting operational costs and expenses against this project.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
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

            {isEditing && initialData?.id && (
              <TeamCompositionManager 
                project={initialData as Project} 
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
              <Button type="button" variant="outline">Cancel</Button>
              <Button type="submit" className="bg-primary">
                {isEditing ? 'Update Project' : 'Create Project'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default ProjectForm;
