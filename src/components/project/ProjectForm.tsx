import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, X, UserCircle } from 'lucide-react';

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

const formSchema = z.object({
  name: z.string().min(3, {
    message: 'Project name must be at least 3 characters.',
  }),
  description: z.string().optional(),
  projectType: z.enum(['infrastructure', 'survey', 'compliance', 'monitoring', 'training', 'other']),
  status: z.enum(['draft', 'active', 'onHold', 'completed', 'cancelled']),
  projectManager: z.string().optional(),
  startDate: z.date({
    required_error: 'Start date is required.',
  }),
  endDate: z.date({
    required_error: 'End date is required.',
  }).refine(
    (date) => date > new Date(),
    {
      message: 'End date must be in the future',
    }
  ),
  budgetTotal: z.coerce.number().min(0).optional(),
  budgetCurrency: z.string(),
  country: z.string({
    required_error: 'Country is required',
  }),
  region: z.string().optional(),
  selectedState: z.string().optional(),
  state: z.string().optional(),
  locality: z.string().optional(),
});

interface ProjectFormProps {
  onSubmit: (data: Project) => void;
  initialData?: Partial<Project>;
  isEditing?: boolean;
}

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
      return role.includes('manager') || role === 'admin' || role === 'supervisor';
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
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || '',
      description: initialData?.description || '',
      projectType: (initialData?.projectType as ProjectType) || 'survey',
      status: (initialData?.status as ProjectStatus) || 'draft',
      startDate: initialData?.startDate ? new Date(initialData.startDate) : new Date(),
      endDate: initialData?.endDate ? new Date(initialData.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      budgetTotal: initialData?.budget?.total || 0,
      budgetCurrency: initialData?.budget?.currency || 'USD',
      projectManager: initialData?.team?.projectManager || '',
      country: initialData?.location?.country || '',
      region: initialData?.location?.region || '',
      selectedState: initialData?.location?.selectedStates && initialData.location.selectedStates.length > 0 
        ? initialData.location.selectedStates[0] 
        : '',
      state: initialData?.location?.state || '',
      locality: initialData?.location?.locality || '',
    },
  });

  const handleFormSubmit = async (values: z.infer<typeof formSchema>) => {
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
              allocated: 0,
              remaining: values.budgetTotal,
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
                        <SelectItem value="infrastructure">Infrastructure</SelectItem>
                        <SelectItem value="survey">Survey</SelectItem>
                        <SelectItem value="compliance">Compliance</SelectItem>
                        <SelectItem value="monitoring">Monitoring</SelectItem>
                        <SelectItem value="training">Training</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
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
                    <FormLabel>Currency</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {countries.map((country) => (
                          <SelectItem key={country.currency.code} value={country.currency.code}>
                            {country.currency.code} - {country.currency.name}
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
