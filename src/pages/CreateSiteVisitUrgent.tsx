import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';
import { 
  ChevronLeft, 
  AlertTriangle, 
  Plus, 
  Info, 
  MapPin, 
  Users, 
  DollarSign, 
  CheckCircle,
  Clock,
  Building2,
  Calendar
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMMP } from '@/context/mmp/MMPContext';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sudanStates, hubs, getLocalitiesByState, getHubForState } from '@/data/sudanStates';
import { useUser } from '@/context/user/UserContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useAuthorization } from '@/hooks/use-authorization';

// Enhanced form validation schema
const urgentSiteVisitSchema = z.object({
  siteSource: z.enum(['existing', 'new']),
  siteName: z.string().min(3, 'Site name must be at least 3 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  location: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']),
  selectedMmpSite: z.string().optional(),
  hub: z.string().optional(),
  state: z.string().optional(),
  locality: z.string().optional(),
  mainActivity: z.string().min(3, 'Main activity must be at least 3 characters').optional(),
  projectName: z.string().min(3, 'Project name must be at least 3 characters').optional(),
  complexity: z.enum(['low', 'medium', 'high']),
  estimatedDuration: z.string().optional(),
  coordinatorName: z.string().optional(),
  supervisorName: z.string().optional(),
  risks: z.string().max(1000, 'Risks description must be less than 1000 characters').optional(),
  resources: z.string().max(1000, 'Resources description must be less than 1000 characters').optional(),
  feeCurrency: z.string().min(1, 'Currency is required'),
  distanceFee: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Must be a valid positive number'),
  complexityFee: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Must be a valid positive number'),
  urgencyFee: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, 'Must be a valid positive number'),
}).refine((data) => {
  if (data.siteSource === 'existing') {
    return !!data.selectedMmpSite;
  }
  if (data.siteSource === 'new') {
    return !!(data.siteName && data.state && data.hub && data.mainActivity && data.projectName);
  }
  return true;
}, {
  message: "Please complete all required fields for the selected site source",
});

type UrgentSiteVisitForm = z.infer<typeof urgentSiteVisitSchema>;

const CreateSiteVisitUrgent = () => {
  const navigate = useNavigate();
  const { currentUser, users } = useUser();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const { mmpFiles } = useMMP();
  const { createSiteVisit } = useSiteVisitContext();
  const [localities, setLocalities] = useState<{ id: string; name: string; }[]>([]);
  const [availableStates, setAvailableStates] = useState<typeof sudanStates>([]);
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const coordinators = users.filter(user => user.role === 'coordinator');
  const supervisors = users.filter(user => user.role === 'supervisor');
  
  const form = useForm<UrgentSiteVisitForm>({
    resolver: zodResolver(urgentSiteVisitSchema),
    defaultValues: {
      siteSource: 'existing',
      priority: 'high',
      state: '',
      complexity: 'medium',
      feeCurrency: 'SDG',
      distanceFee: '0',
      complexityFee: '0',
      urgencyFee: '0',
    }
  });

  const watchState = form.watch('state');
  const watchHub = form.watch('hub');
  const watchDistanceFee = form.watch('distanceFee');
  const watchComplexityFee = form.watch('complexityFee');
  const watchUrgencyFee = form.watch('urgencyFee');
  const watchFeeCurrency = form.watch('feeCurrency');
  
  useEffect(() => {
    if (watchHub) {
      const selectedHub = hubs.find(hub => hub.id === watchHub);
      if (selectedHub) {
        const hubStates = sudanStates.filter(state => 
          selectedHub.states.includes(state.id)
        );
        setAvailableStates(hubStates);
        form.setValue('state', '');
        form.setValue('locality', '');
      }
    } else {
      setAvailableStates(sudanStates);
    }
  }, [watchHub, form]);

  useEffect(() => {
    if (watchState) {
      setLocalities(getLocalitiesByState(watchState));
      form.setValue('locality', '');
      
      if (!watchHub) {
        const hubId = getHubForState(watchState);
        if (hubId) {
          form.setValue('hub', hubId);
        }
      }
    } else {
      setLocalities([]);
    }
  }, [watchState, watchHub, form]);

  const approvedMmpSites = mmpFiles
    .filter(mmp => mmp.status === 'approved')
    .flatMap(mmp => mmp.siteEntries || [])
    .map(site => ({
      id: site.id,
      name: site.siteName,
      code: site.siteCode
    }));

  const canAccess = checkPermission('site_visits', 'create') || hasAnyRole(['admin']);
  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => navigate('/site-visits')}
              className="w-full"
            >
              Return to Site Visits
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const onSubmit = async (data: UrgentSiteVisitForm) => {
    setIsSubmitting(true);
    
    try {
      let siteVisitId;
      const toAmount = (v: any) => {
        const n = typeof v === 'string' ? parseFloat(v) : Number(v || 0);
        return isNaN(n) ? 0 : n;
      };
      const distanceFeeVal = toAmount(data.distanceFee);
      const complexityFeeVal = toAmount(data.complexityFee);
      const urgencyFeeVal = toAmount(data.urgencyFee);
      const totalFee = distanceFeeVal + complexityFeeVal + urgencyFeeVal;
      
      if (data.siteSource === 'existing') {
        const selectedSite = approvedMmpSites.find(site => site.id === data.selectedMmpSite);
        if (selectedSite) {
          siteVisitId = await createSiteVisit({
            siteName: selectedSite.name,
            siteCode: selectedSite.code,
            priority: data.priority,
            visitType: 'urgent',
            status: 'pending',
            fees: {
              total: totalFee,
              currency: data.feeCurrency || 'SDG',
              distanceFee: distanceFeeVal,
              complexityFee: complexityFeeVal,
              urgencyFee: urgencyFeeVal,
            },
          });
        }
      } else {
        const selectedState = sudanStates.find(state => state.id === data.state);
        const selectedLocality = localities.find(loc => loc.id === data.locality);
        
        siteVisitId = await createSiteVisit({
          siteName: data.siteName,
          priority: data.priority,
          state: data.state,
          locality: selectedLocality?.name || '',
          hub: data.hub,
          mainActivity: data.mainActivity,
          projectName: data.projectName,
          complexity: data.complexity,
          visitType: 'urgent',
          status: 'pending',
          estimatedDuration: data.estimatedDuration,
          description: data.description?.toString() || '',
          risks: data.risks?.toString() || '',
          resources: data.resources ? [data.resources] : [],
          fees: {
            total: totalFee,
            currency: data.feeCurrency || 'SDG',
            distanceFee: distanceFeeVal,
            complexityFee: complexityFeeVal,
            urgencyFee: urgencyFeeVal,
          },
          team: {
            coordinator: data.coordinatorName,
            supervisor: data.supervisorName
          }
        });
      }
      
      if (siteVisitId) {
        toast.success(
          "Urgent site visit created successfully!",
          {
            description: "The site visit has been submitted for approval.",
            duration: 4000,
          }
        );
        setTimeout(() => {
          navigate('/site-visits');
        }, 1500);
      } else {
        throw new Error("Failed to create site visit");
      }
    } catch (error) {
      console.error("Error creating site visit:", error);
      toast.error(
        "Failed to create site visit",
        {
          description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
          duration: 5000,
        }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const canProceedToStep = (step: number) => {
    const siteSource = form.watch('siteSource');
    
    switch (step) {
      case 2:
        if (siteSource === 'existing') {
          return !!form.watch('selectedMmpSite');
        }
        return !!(form.watch('siteName') && form.watch('state') && form.watch('hub'));
      case 3:
        return true; // Can always proceed to fees step
      default:
        return false;
    }
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between p-6 bg-blue-50 rounded-xl border">
        {[1, 2, 3].map((step, index) => {
          const isActive = currentStep === step;
          const isCompleted = currentStep > step;
          const stepTitles = ['Site Selection', 'Details & Team', 'Fees & Submit'];
          
          return (
            <React.Fragment key={step}>
              <div className="flex items-center space-x-4">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all duration-200 ${
                  isCompleted 
                    ? 'bg-green-500 text-white' 
                    : isActive 
                    ? 'bg-primary text-primary-foreground shadow-lg' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {isCompleted ? <CheckCircle className="h-5 w-5" /> : step}
                </div>
                <div className="text-left">
                  <div className={`font-medium transition-colors ${
                    isActive ? 'text-primary' : isCompleted ? 'text-green-600' : 'text-muted-foreground'
                  }`}>
                    {stepTitles[index]}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Step {step} of 3
                  </div>
                </div>
              </div>
              {index < 2 && (
                <div className={`flex-1 h-0.5 mx-4 transition-colors ${
                  currentStep > step + 1 ? 'bg-green-500' : 'bg-border'
                }`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );

  const renderSiteSelection = () => (
    <Card className="shadow-lg border-0 bg-white">
      <CardHeader className="pb-6">
        <CardTitle className="flex items-center text-xl">
          <MapPin className="h-6 w-6 mr-3 text-blue-600" />
          Site Selection
        </CardTitle>
        <CardDescription className="text-base">
          Choose whether to create a visit for an existing approved site or add a new urgent site
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <FormField
          control={form.control}
          name="siteSource"
          render={({ field }) => (
            <FormItem>
              <RadioGroup
                onValueChange={field.onChange}
                defaultValue={field.value}
                value={field.value}
                className="grid grid-cols-1 lg:grid-cols-2 gap-6"
              >
                <div className="relative group">
                  <RadioGroupItem value="existing" id="existing" className="peer sr-only" />
                  <Label
                    htmlFor="existing"
                    className="flex flex-col space-y-4 rounded-xl border-2 border-muted bg-card p-6 hover:bg-accent/50 hover:border-primary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all duration-200 group-hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Building2 className="h-5 w-5 text-blue-600" />
                        <span className="font-semibold">Existing Approved Site</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {approvedMmpSites.length} available
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Select from sites already approved in MMP files. This option ensures compliance with existing project plans.
                    </p>
                  </Label>
                </div>

                <div className="relative group">
                  <RadioGroupItem value="new" id="new" className="peer sr-only" />
                  <Label
                    htmlFor="new"
                    className="flex flex-col space-y-4 rounded-xl border-2 border-muted bg-card p-6 hover:bg-accent/50 hover:border-primary/50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all duration-200 group-hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <AlertTriangle className="h-5 w-5 text-amber-500" />
                        <span className="font-semibold">New Urgent Site</span>
                      </div>
                      <Badge variant="destructive" className="text-xs animate-pulse">
                        URGENT
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Create a new site for urgent, unscheduled visits that require immediate attention.
                    </p>
                  </Label>
                </div>
              </RadioGroup>
            </FormItem>
          )}
        />

        {form.watch('siteSource') === 'existing' && (
          <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Select from {approvedMmpSites.length} approved sites. Only sites with approved MMP status are available for urgent visits.
              </AlertDescription>
            </Alert>
            
            {approvedMmpSites.length > 0 ? (
              <ScrollArea className="h-80 border rounded-lg bg-white dark:bg-gray-900">
                <div className="p-4 space-y-3">
                  <RadioGroup
                    value={form.watch('selectedMmpSite')}
                    onValueChange={(value) => form.setValue('selectedMmpSite', value)}
                    className="space-y-3"
                  >
                    {approvedMmpSites.map((site) => (
                      <div key={site.id} className="group">
                        <RadioGroupItem value={site.id} id={site.id} className="peer sr-only" />
                        <Label 
                          htmlFor={site.id} 
                          className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-accent/50 peer-data-[state=checked]:bg-primary/5 peer-data-[state=checked]:border-primary cursor-pointer transition-all duration-200 group-hover:shadow-sm"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-foreground">{site.name}</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              Site Code: <span className="font-mono bg-muted px-2 py-0.5 rounded text-xs">{site.code}</span>
                            </div>
                          </div>
                          <CheckCircle className="h-4 w-4 text-green-500 opacity-0 peer-data-[state=checked]:opacity-100 transition-opacity" />
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </ScrollArea>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="h-16 w-16 mx-auto mb-4 opacity-30" />
                <h3 className="font-medium text-lg mb-2">No Approved Sites Available</h3>
                <p className="text-sm mb-4">There are currently no approved sites in your MMP files.</p>
                <Button 
                  variant="outline" 
                  onClick={() => form.setValue('siteSource', 'new')}
                  className="mt-2"
                >
                  Create New Urgent Site Instead
                </Button>
              </div>
            )}
          </div>
        )}

        {form.watch('siteSource') === 'new' && (
          <div className="space-y-8 animate-in slide-in-from-top-2 duration-300">
            <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/10">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-200">
                Creating a new urgent site. Please ensure all required information is accurate as this will be submitted for immediate approval.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="siteName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center text-sm font-medium">
                      Site Name <span className="text-destructive ml-1">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Enter descriptive site name" 
                        className="h-11"
                      />
                    </FormControl>
                    <FormDescription>
                      Provide a clear, descriptive name for the site
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority Level</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                              <span>High Priority</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="medium">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                              <span>Medium Priority</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="low">
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              <span>Low Priority</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator className="my-6" />

            <div className="space-y-6">
              <h4 className="font-semibold flex items-center text-lg">
                <MapPin className="h-5 w-5 mr-2 text-blue-600" />
                Location Details
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="hub"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hub *</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="w-full h-11">
                            <SelectValue placeholder="Select Hub" />
                          </SelectTrigger>
                          <SelectContent>
                            {hubs.map((hub) => (
                              <SelectItem key={hub.id} value={hub.id}>
                                {hub.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State *</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!watchHub}
                        >
                          <SelectTrigger className="w-full h-11">
                            <SelectValue placeholder={!watchHub ? "Select Hub First" : "Select State"} />
                          </SelectTrigger>
                          <SelectContent>
                            {availableStates.map((state) => (
                              <SelectItem key={state.id} value={state.id}>
                                {state.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="locality"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Locality</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={!watchState || localities.length === 0}
                        >
                          <SelectTrigger className="w-full h-11">
                            <SelectValue placeholder={!watchState ? "Select State First" : "Select Locality"} />
                          </SelectTrigger>
                          <SelectContent>
                            {localities.map((locality) => (
                              <SelectItem key={locality.id} value={locality.id}>
                                {locality.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="City or region" className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Separator className="my-6" />

            <div className="space-y-6">
              <h4 className="font-semibold text-lg">Project Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="projectName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter project name" className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mainActivity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Main Activity *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter main activity" className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="complexity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Complexity Level</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="w-full h-11">
                            <SelectValue placeholder="Select complexity" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="estimatedDuration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estimated Duration</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., 2 days" className="h-11" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between pt-6 border-t">
          <Button variant="outline" onClick={() => navigate('/site-visits/create')}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={() => setCurrentStep(2)}
            disabled={!canProceedToStep(2)}
            className="min-w-[140px]"
          >
            Continue
            <ChevronLeft className="h-4 w-4 ml-2 rotate-180" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderDetailsAndTeam = () => (
    <Card className="shadow-lg border-0 bg-white">
      <CardHeader className="pb-6">
        <CardTitle className="flex items-center text-xl">
          <Users className="h-6 w-6 mr-3 text-blue-600" />
          Visit Details & Team Assignment
        </CardTitle>
        <CardDescription className="text-base">
          Provide additional details and assign team members for this urgent visit
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-6">
          <h4 className="font-semibold flex items-center text-lg">
            <Users className="h-5 w-5 mr-2 text-blue-600" />
            Team Assignment
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="coordinatorName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Coordinator</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Coordinator" />
                      </SelectTrigger>
                      <SelectContent>
                        {coordinators.map((coordinator) => (
                          <SelectItem 
                            key={coordinator.id} 
                            value={coordinator.id}
                          >
                            {coordinator.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="supervisorName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Supervisor</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Supervisor" />
                      </SelectTrigger>
                      <SelectContent>
                        {supervisors.map((supervisor) => (
                          <SelectItem 
                            key={supervisor.id} 
                            value={supervisor.id}
                          >
                            {supervisor.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Separator />

        <div className="space-y-6">
          <h4 className="font-semibold text-lg">Additional Information</h4>
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Provide details about the urgent site visit" className="resize-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="risks"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Risks</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="List any potential risks" className="resize-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="resources"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Required Resources</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="List required resources" className="resize-none" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-between pt-6 border-t">
          <Button variant="outline" onClick={() => setCurrentStep(1)}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button onClick={() => setCurrentStep(3)} className="min-w-[140px]">
            Continue
            <ChevronLeft className="h-4 w-4 ml-2 rotate-180" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  const renderFeesAndSubmit = () => (
    <Card className="shadow-lg border-0 bg-white">
      <CardHeader className="pb-6">
        <CardTitle className="flex items-center text-xl">
          <DollarSign className="h-6 w-6 mr-3 text-blue-600" />
          Fee Calculation & Submit
        </CardTitle>
        <CardDescription className="text-base">
          Set fees for this urgent site visit and submit for approval
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FormField
              control={form.control}
              name="feeCurrency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., SDG" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="distanceFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Distance Fee</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" placeholder="0" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="complexityFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Complexity Fee</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" placeholder="0" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="urgencyFee"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Urgency Fee</FormLabel>
                  <FormControl>
                    <Input {...field} type="number" placeholder="0" className="h-11" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">Total Cost</h3>
                  <p className="text-sm text-muted-foreground">All fees included</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">
                    {(() => {
                      const toAmount = (v: any) => {
                        const n = typeof v === 'string' ? parseFloat(v) : Number(v || 0);
                        return isNaN(n) ? 0 : n;
                      };
                      const total = toAmount(watchDistanceFee) + toAmount(watchComplexityFee) + toAmount(watchUrgencyFee);
                      return `${total.toLocaleString()} ${watchFeeCurrency || 'SDG'}`;
                    })()}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between pt-6 border-t">
          <Button variant="outline" onClick={() => setCurrentStep(2)}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            type="submit" 
            variant="default"
            onClick={form.handleSubmit(onSubmit)}
            disabled={isSubmitting}
            className="min-w-[160px] bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting ? (
              <>
                <Clock className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create Urgent Visit
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
  <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto max-w-5xl py-8 px-4">
        <div className="flex items-center gap-6 mb-8">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => navigate("/site-visits/create")}
            className="hover:bg-white dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-5 w-5 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center text-blue-600">
              <AlertTriangle className="h-8 w-8 mr-3 text-amber-500" />
              Create Urgent Site Visit
            </h1>
            <p className="text-muted-foreground text-lg mt-2">
              Create an urgent site visit by selecting an existing site or adding a new one
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            {renderStepIndicator()}
            
            {currentStep === 1 && renderSiteSelection()}
            {currentStep === 2 && renderDetailsAndTeam()}
            {currentStep === 3 && renderFeesAndSubmit()}
          </form>
        </Form>
      </div>
    </div>
  );
};

export default CreateSiteVisitUrgent;
