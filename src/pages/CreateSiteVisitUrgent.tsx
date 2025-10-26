import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';
import { ChevronLeft, AlertTriangle, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useForm, Controller } from 'react-hook-form';
import { useMMP } from '@/context/mmp/MMPContext';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { toast } from "sonner";
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

interface UrgentSiteVisitForm {
  siteSource: 'existing' | 'new';
  siteName: string;
  description: string;
  location: string;
  priority: 'high' | 'medium' | 'low';
  selectedMmpSite?: string;
  hub?: string;
  state: string;
  locality?: string;
  mainActivity: string;
  projectName: string;
  complexity: 'low' | 'medium' | 'high';
  estimatedDuration: string;
  coordinatorName: string;
  supervisorName: string;
  risks: string;
  resources: string;
  feeCurrency: string;
  distanceFee: string;
  complexityFee: string;
  urgencyFee: string;
}

const CreateSiteVisitUrgent = () => {
  const navigate = useNavigate();
  const { currentUser, users } = useUser();
  const { mmpFiles } = useMMP();
  const { createSiteVisit } = useSiteVisitContext();
  const [localities, setLocalities] = useState<{ id: string; name: string; }[]>([]);
  const [availableStates, setAvailableStates] = useState<typeof sudanStates>([]);
  
  const coordinators = users.filter(user => user.role === 'coordinator');
  const supervisors = users.filter(user => user.role === 'supervisor');
  
  const form = useForm<UrgentSiteVisitForm>({
    defaultValues: {
      siteSource: 'existing',
      priority: 'high',
      state: '',
      complexity: 'medium',
      feeCurrency: 'SDG',
      distanceFee: '',
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

  if (!currentUser || !['admin', 'ict'].includes(currentUser.role)) {
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
    console.log('Form submitted:', data);
    
    if (data.siteSource === 'existing' && !data.selectedMmpSite) {
      toast.error("Please select an existing site");
      return;
    }
    
    if (data.siteSource === 'new') {
      const requiredFields = [
        { field: 'siteName', label: 'Site Name' },
        { field: 'state', label: 'State' },
        { field: 'hub', label: 'Hub' },
        { field: 'mainActivity', label: 'Main Activity' },
        { field: 'projectName', label: 'Project Name' }
      ];
      
      const missingFields = requiredFields
        .filter(({ field }) => !data[field as keyof UrgentSiteVisitForm])
        .map(({ label }) => label);
      
      if (missingFields.length > 0) {
        toast.error(`Please fill in all required fields: ${missingFields.join(', ')}`);
        return;
      }
    }

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
        toast.success(`Urgent site visit created successfully!`);
        setTimeout(() => {
          navigate(`/site-visits`);
        }, 1000);
      } else {
        toast.error("Failed to create site visit");
      }
    } catch (error) {
      console.error("Error creating site visit:", error);
      toast.error("An error occurred while creating the site visit");
    }
  };

  return (
    <div className="space-y-6 container mx-auto max-w-2xl">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/site-visits/create")}
          className="mr-2"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center">
            <AlertTriangle className="h-6 w-6 mr-2 text-amber-500" />
            Create Urgent Site Visit
          </h1>
          <p className="text-muted-foreground">
            Create an urgent site visit by selecting an existing site or adding a new one
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Urgent Site Visit Details</CardTitle>
          <CardDescription>
            Provide essential information for an urgent site visit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="siteSource"
                  render={({ field }) => (
                    <FormItem>
                      <div className="space-y-4">
                        <div>
                          <div className="flex items-center space-x-2">
                            <RadioGroup
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                              value={field.value}
                              className="flex flex-col space-y-4"
                            >
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="existing" id="existing" />
                                <Label htmlFor="existing">Select from Existing Sites</Label>
                              </div>
                              
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="new" id="new" />
                                <Label htmlFor="new">Add as New Urgent Site</Label>
                              </div>
                            </RadioGroup>
                          </div>
                          
                          {field.value === "existing" && (
                            <ScrollArea className="h-48 mt-4 border rounded-md">
                              <div className="p-4 space-y-2">
                                {approvedMmpSites.length > 0 ? (
                                  approvedMmpSites.map((site) => (
                                    <div
                                      key={site.id}
                                      className="flex items-center space-x-2 p-2 hover:bg-accent rounded-md"
                                    >
                                      <input
                                        type="radio"
                                        id={site.id}
                                        value={site.id}
                                        {...form.register("selectedMmpSite")}
                                        className="rounded-full"
                                      />
                                      <label htmlFor={site.id} className="flex-1 cursor-pointer">
                                        <div className="font-medium">{site.name}</div>
                                        <div className="text-sm text-muted-foreground">
                                          Code: {site.code}
                                        </div>
                                      </label>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-muted-foreground text-center py-4">
                                    No approved sites available
                                  </p>
                                )}
                              </div>
                            </ScrollArea>
                          )}
                          
                          {form.watch('siteSource') === "new" && (
                            <div className="space-y-4 mt-4">
                              <FormField
                                control={form.control}
                                name="siteName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Site Name *</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Enter site name" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

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
                                        <SelectTrigger className="w-full">
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
                                        <SelectTrigger className="w-full">
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
                                        <SelectTrigger className="w-full">
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
                                name="projectName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Project Name *</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Enter project name" />
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
                                      <Input {...field} placeholder="Enter main activity" />
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
                                        <SelectTrigger className="w-full">
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
                                      <Input {...field} placeholder="e.g., 2 days" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

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

                              <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                      <Textarea {...field} placeholder="Provide details about the urgent site visit" />
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
                                      <Textarea {...field} placeholder="List any potential risks" />
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
                                      <Textarea {...field} placeholder="List required resources" />
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
                                      <Input {...field} placeholder="City or region" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <FormLabel className="text-sm">Fees</FormLabel>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <FormField
                      control={form.control}
                      name="feeCurrency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Currency</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., SDG" />
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
                            <Input {...field} type="number" placeholder="0" />
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
                            <Input {...field} type="number" placeholder="0" />
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
                            <Input {...field} type="number" placeholder="0" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {(() => {
                      const toAmount = (v: any) => {
                        const n = typeof v === 'string' ? parseFloat(v) : Number(v || 0);
                        return isNaN(n) ? 0 : n;
                      };
                      const d = toAmount(watchDistanceFee);
                      const c = toAmount(watchComplexityFee);
                      const u = toAmount(watchUrgencyFee);
                      const total = d + c + u;
                      return `Total: ${total.toLocaleString()} ${watchFeeCurrency || 'SDG'}`;
                    })()}
                  </div>
                </div>

                <Button type="submit" variant="destructive" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Urgent Site Visit
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateSiteVisitUrgent;
