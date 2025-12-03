import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { SiteVisit } from "@/types";
import { useCostSubmissionContext } from "@/context/costApproval/CostSubmissionContext";
import { SupportingDocument } from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";
import { useBudgetRestriction } from "@/hooks/useBudgetRestriction";
import { Loader2, DollarSign, Bus, Hotel, Utensils, MoreHorizontal, FileText, AlertTriangle, Info } from "lucide-react";

const formSchema = z.object({
  mmpSiteEntryId: z.string().min(1, "Please select a site visit"),
  transportationCostCents: z.number().min(0, "Transportation cost must be positive"),
  accommodationCostCents: z.number().min(0, "Accommodation cost must be positive"),
  mealAllowanceCents: z.number().min(0, "Meal allowance must be positive"),
  otherCostsCents: z.number().min(0, "Other costs must be positive"),
  transportationDetails: z.string().optional(),
  accommodationDetails: z.string().optional(),
  mealDetails: z.string().optional(),
  otherCostsDetails: z.string().optional(),
  submissionNotes: z.string().optional(),
  currency: z.string().default("SDG")
});

type FormValues = z.infer<typeof formSchema>;

interface CostSubmissionFormProps {
  siteVisits: SiteVisit[];
}

const CostSubmissionForm = ({ siteVisits }: CostSubmissionFormProps) => {
  const { toast } = useToast();
  const { useCreateSubmission } = useCostSubmissionContext();
  const { mutate: createSubmission, isPending } = useCreateSubmission();
  const { checkRestriction, isChecking, lastResult, canOverride, escalateToSeniorOps } = useBudgetRestriction();
  
  const [selectedSiteVisit, setSelectedSiteVisit] = useState<SiteVisit | null>(null);
  const [supportingDocuments, setSupportingDocuments] = useState<SupportingDocument[]>([]);
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);
  const [budgetBlocked, setBudgetBlocked] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mmpSiteEntryId: "",
      transportationCostCents: 0,
      accommodationCostCents: 0,
      mealAllowanceCents: 0,
      otherCostsCents: 0,
      transportationDetails: "",
      accommodationDetails: "",
      mealDetails: "",
      otherCostsDetails: "",
      submissionNotes: "",
      currency: "SDG"
    },
    mode: "onChange"
  });

  const handleSiteVisitChange = (siteVisitId: string) => {
    const visit = siteVisits.find(v => v.id === siteVisitId);
    setSelectedSiteVisit(visit || null);
    form.setValue("mmpSiteEntryId", siteVisitId);
  };

  const checkBudgetBeforeSubmit = async (totalCents: number): Promise<boolean> => {
    if (!selectedSiteVisit?.mmpDetails?.mmpId) return true;
    
    const result = await checkRestriction(selectedSiteVisit.mmpDetails.mmpId, totalCents);
    
    const projectName = selectedSiteVisit.mmpDetails.projectName || 
                        selectedSiteVisit.projectName || 
                        'Unknown Project';
    
    if (!result.allowed && !canOverride) {
      setBudgetBlocked(true);
      setBudgetWarning(
        `Budget exceeded: Your submission of ${(totalCents / 100).toLocaleString()} SDG exceeds the remaining budget of ${result.budgetDetails.remaining.toLocaleString()} SDG. ` +
        `This request requires Senior Operations Lead approval.`
      );
      
      if (selectedSiteVisit.mmpDetails.projectId) {
        const requestId = `cost_${selectedSiteVisit.id}_${Date.now()}`;
        await escalateToSeniorOps({
          requestId,
          requestType: 'cost_submission',
          amount: totalCents / 100,
          shortfall: result.budgetDetails.shortfall,
          projectId: selectedSiteVisit.mmpDetails.projectId,
          projectName,
          mmpId: selectedSiteVisit.mmpDetails.mmpId,
          reason: `Cost submission for site "${selectedSiteVisit.siteName}" exceeds budget by ${result.budgetDetails.shortfall.toLocaleString()} SDG`,
        });
      }
      return false;
    } else if (!result.allowed && canOverride) {
      setBudgetBlocked(false);
      setBudgetWarning(
        `Budget override available: Your submission exceeds the remaining budget by ${result.budgetDetails.shortfall.toLocaleString()} SDG. ` +
        `As a ${canOverride ? 'privileged user' : ''}, you may override and submit with justification.`
      );
    } else if (result.alerts.length > 0) {
      setBudgetBlocked(false);
      const alert = result.alerts[0];
      setBudgetWarning(alert.message || `Budget at ${result.budgetDetails.utilizationPercentage.toFixed(1)}% utilization`);
    } else {
      setBudgetBlocked(false);
      setBudgetWarning(null);
    }
    
    return true;
  };

  const onSubmit = async (values: FormValues) => {
    if (!selectedSiteVisit) {
      toast({
        title: "Error",
        description: "Please select a site visit",
        variant: "destructive"
      });
      return;
    }

    try {
      if (!selectedSiteVisit.mmpDetails.projectId) {
        toast({
          title: "Error",
          description: "Cannot submit costs: Site visit is not linked to a project",
          variant: "destructive"
        });
        return;
      }

      const totalCents = 
        Number(values.transportationCostCents) +
        Number(values.accommodationCostCents) +
        Number(values.mealAllowanceCents) +
        Number(values.otherCostsCents);

      const budgetOk = await checkBudgetBeforeSubmit(totalCents);
      if (!budgetOk) {
        toast({
          title: "Budget Restriction",
          description: "This expense exceeds the available budget and has been escalated for Senior Operations Lead approval.",
          variant: "warning"
        });
        return;
      }

      await createSubmission({
        siteVisitId: values.mmpSiteEntryId,
        mmpFileId: selectedSiteVisit.mmpDetails.mmpId,
        projectId: selectedSiteVisit.mmpDetails.projectId,
        transportationCostCents: Number(values.transportationCostCents),
        accommodationCostCents: Number(values.accommodationCostCents),
        mealAllowanceCents: Number(values.mealAllowanceCents),
        otherCostsCents: Number(values.otherCostsCents),
        transportationDetails: values.transportationDetails,
        accommodationDetails: values.accommodationDetails,
        mealDetails: values.mealDetails,
        otherCostsDetails: values.otherCostsDetails,
        submissionNotes: values.submissionNotes,
        currency: values.currency,
        supportingDocuments
      });

      toast({
        title: "Success",
        description: "Cost submission created successfully"
      });

      form.reset();
      setSelectedSiteVisit(null);
      setSupportingDocuments([]);
      setBudgetWarning(null);
      setBudgetBlocked(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit costs",
        variant: "destructive"
      });
    }
  };

  const totalCostCents = 
    form.watch("transportationCostCents") +
    form.watch("accommodationCostCents") +
    form.watch("mealAllowanceCents") +
    form.watch("otherCostsCents");

  const formatCurrency = (cents: number, currency: string) => {
    const amount = cents / 100;
    return `${amount.toFixed(2)} ${currency}`;
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Submit Actual Costs</CardTitle>
            <CardDescription>
              Enter the actual costs incurred during your site visit. All amounts should be in whole numbers (e.g., 50 for 0.50 SDG).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {budgetWarning && (
              <Alert variant={budgetBlocked ? "destructive" : "default"} data-testid="alert-budget-warning">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex items-start gap-2">
                  <div>
                    <span className="font-medium">{budgetBlocked ? "Budget Exceeded" : "Budget Alert"}</span>
                    <p className="text-sm mt-1">{budgetWarning}</p>
                    {budgetBlocked && !canOverride && (
                      <p className="text-sm mt-2 text-muted-foreground">
                        A notification has been sent to Senior Operations Lead for approval.
                      </p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {lastResult && !budgetBlocked && lastResult.budgetDetails.allocated > 0 && (
              <Alert variant="default" data-testid="alert-budget-info">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">Budget Status: </span>
                  {lastResult.budgetDetails.remaining.toLocaleString()} SDG remaining 
                  ({(100 - lastResult.budgetDetails.utilizationPercentage).toFixed(1)}% available)
                </AlertDescription>
              </Alert>
            )}
            {/* Site Visit Selection */}
            <FormField
              control={form.control}
              name="mmpSiteEntryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Select Site Visit *</FormLabel>
                  <Select
                    onValueChange={handleSiteVisitChange}
                    value={field.value}
                    data-testid="select-site-visit"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a completed site visit" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {siteVisits.map((visit) => (
                        <SelectItem key={visit.id} value={visit.id} data-testid={`option-site-${visit.id}`}>
                          <div className="flex items-center gap-2">
                            <span>{visit.siteName}</span>
                            <Badge variant="outline" className="text-xs">
                              {visit.siteCode}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {visit.locality}, {visit.state}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select the completed site visit for which you're submitting costs
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Cost Entries */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Transportation */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="transportationCostCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <Bus className="h-4 w-4" />
                          Transportation Cost (cents)
                        </div>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          {...field}
                          value={field.value}
                          onChange={(e) => {
                            const value = e.target.value === '' ? 0 : Number(e.target.value);
                            field.onChange(value);
                          }}
                          data-testid="input-transportation-cost"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter amount in cents (e.g., 5000 for 50.00 SDG)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="transportationDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transportation Details</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Bus fare 30 SDG + Taxi 20 SDG"
                          className="resize-none"
                          {...field}
                          data-testid="textarea-transportation-details"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Accommodation */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="accommodationCostCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <Hotel className="h-4 w-4" />
                          Accommodation Cost (cents)
                        </div>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          {...field}
                          value={field.value}
                          onChange={(e) => {
                            const value = e.target.value === '' ? 0 : Number(e.target.value);
                            field.onChange(value);
                          }}
                          data-testid="input-accommodation-cost"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter amount in cents (e.g., 10000 for 100.00 SDG)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="accommodationDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Accommodation Details</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Hotel stay 1 night at 100 SDG"
                          className="resize-none"
                          {...field}
                          data-testid="textarea-accommodation-details"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Meals */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="mealAllowanceCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <Utensils className="h-4 w-4" />
                          Meal Allowance (cents)
                        </div>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          {...field}
                          value={field.value}
                          onChange={(e) => {
                            const value = e.target.value === '' ? 0 : Number(e.target.value);
                            field.onChange(value);
                          }}
                          data-testid="input-meal-cost"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter amount in cents (e.g., 3000 for 30.00 SDG)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mealDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Meal Details</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Lunch and dinner"
                          className="resize-none"
                          {...field}
                          data-testid="textarea-meal-details"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Other Costs */}
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="otherCostsCents"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <div className="flex items-center gap-2">
                          <MoreHorizontal className="h-4 w-4" />
                          Other Costs (cents)
                        </div>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          {...field}
                          value={field.value}
                          onChange={(e) => {
                            const value = e.target.value === '' ? 0 : Number(e.target.value);
                            field.onChange(value);
                          }}
                          data-testid="input-other-costs"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter amount in cents (e.g., 1500 for 15.00 SDG)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="otherCostsDetails"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Other Costs Details</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Parking fees, phone calls"
                          className="resize-none"
                          {...field}
                          data-testid="textarea-other-details"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Submission Notes */}
            <FormField
              control={form.control}
              name="submissionNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Additional Notes
                    </div>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any additional information about your costs..."
                      className="resize-none"
                      rows={4}
                      {...field}
                      data-testid="textarea-submission-notes"
                    />
                  </FormControl>
                  <FormDescription>
                    Provide any context or justification for your expenses
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Supporting Documents */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Supporting Documents</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload receipts, photos, or other documents to support your cost submission
                </p>
              </div>
              <CostDocumentUpload
                documents={supportingDocuments}
                onChange={setSupportingDocuments}
              />
            </div>

            {/* Total Summary */}
            <Card className="bg-muted">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    <span className="text-lg font-semibold">Total Cost:</span>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary" data-testid="text-total-cost">
                      {formatCurrency(totalCostCents, form.watch("currency"))}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {totalCostCents} cents
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardContent>
          <CardFooter className="flex justify-between gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.reset();
                setSelectedSiteVisit(null);
                setSupportingDocuments([]);
              }}
              disabled={isPending}
              data-testid="button-reset"
            >
              Reset Form
            </Button>
            <Button
              type="submit"
              disabled={isPending || !selectedSiteVisit}
              data-testid="button-submit-costs"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Costs for Approval
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
};

export default CostSubmissionForm;
