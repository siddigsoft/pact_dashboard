import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/shared/hooks/use-toast";
import { 
  DollarSign, 
  FileText, 
  Upload, 
  Building2, 
  Wallet, 
  Receipt, 
  ArrowRight,
  AlertCircle,
  CheckCircle,
  Info
} from "lucide-react";
import { 
  CostRequestType, 
  BudgetLineCategory, 
  COST_REQUEST_TYPE_LABELS, 
  BUDGET_LINE_LABELS,
  SupportingDocument,
  CreateEnhancedCostRequest
} from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";

const costRequestSchema = z.object({
  requestType: z.enum(['advance', 'reimbursement']),
  projectId: z.string().min(1, "Project is required"),
  budgetLineCategory: z.enum([
    'transportation_and_visit_fees',
    'permit_fee',
    'internet_and_communication_fees',
    'training_and_capacity_building',
    'equipment_and_supplies',
    'office_and_admin',
    'personnel_allowances',
    'other'
  ]),
  requestedAmount: z.number().min(1, "Amount must be greater than 0"),
  currency: z.string().default("SDG"),
  title: z.string().min(3, "Title is required (min 3 characters)"),
  description: z.string().min(10, "Description is required (min 10 characters)"),
  justification: z.string().min(10, "Justification is required (min 10 characters)"),
});

type CostRequestFormData = z.infer<typeof costRequestSchema>;

interface Project {
  id: string;
  name: string;
  budgetRemaining?: number;
}

interface CostRequestFormProps {
  projects: Project[];
  onSubmit: (data: CreateEnhancedCostRequest) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export default function CostRequestForm({ 
  projects, 
  onSubmit, 
  onCancel,
  isSubmitting = false 
}: CostRequestFormProps) {
  const { toast } = useToast();
  const [requestType, setRequestType] = useState<CostRequestType>('advance');
  const [justificationDocs, setJustificationDocs] = useState<SupportingDocument[]>([]);
  const [reconciliationDocs, setReconciliationDocs] = useState<SupportingDocument[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const form = useForm<CostRequestFormData>({
    resolver: zodResolver(costRequestSchema),
    defaultValues: {
      requestType: 'advance',
      projectId: '',
      budgetLineCategory: 'other',
      requestedAmount: 0,
      currency: 'SDG',
      title: '',
      description: '',
      justification: '',
    },
  });

  const watchedRequestType = form.watch('requestType');
  const watchedProjectId = form.watch('projectId');
  const watchedAmount = form.watch('requestedAmount');

  useEffect(() => {
    if (watchedProjectId) {
      const project = projects.find(p => p.id === watchedProjectId);
      setSelectedProject(project || null);
    }
  }, [watchedProjectId, projects]);

  const handleRequestTypeChange = (type: CostRequestType) => {
    setRequestType(type);
    form.setValue('requestType', type);
  };

  const handleJustificationDocsChange = (docs: SupportingDocument[]) => {
    setJustificationDocs(docs);
  };

  const handleReconciliationDocsChange = (docs: SupportingDocument[]) => {
    setReconciliationDocs(docs);
  };

  const handleFormSubmit = async (data: CostRequestFormData) => {
    if (data.requestType === 'reimbursement' && reconciliationDocs.length === 0) {
      toast({
        title: "Receipts Required",
        description: "Please upload at least one receipt for reimbursement requests.",
        variant: "destructive",
      });
      return;
    }

    const submitData: CreateEnhancedCostRequest = {
      requestType: data.requestType,
      projectId: data.projectId,
      budgetLineCategory: data.budgetLineCategory,
      requestedAmountCents: Math.round(data.requestedAmount * 100),
      currency: data.currency,
      title: data.title,
      description: data.description,
      justification: data.justification,
      justificationDocuments: justificationDocs,
      reconciliationDocuments: data.requestType === 'reimbursement' ? reconciliationDocs : undefined,
    };

    await onSubmit(submitData);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            New Cost Request
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            {requestType === 'advance' ? 'Advance Payment' : 'Reimbursement'}
          </Badge>
        </div>
        <CardDescription>
          Submit a cost request linked to a project budget. Choose between advance payment or reimbursement.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Tabs value={requestType} onValueChange={(v) => handleRequestTypeChange(v as CostRequestType)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger 
              value="advance" 
              className="flex items-center gap-2"
              data-testid="tab-advance"
            >
              <DollarSign className="h-4 w-4" />
              <span className="hidden sm:inline">Advance Payment</span>
              <span className="sm:hidden">Advance</span>
            </TabsTrigger>
            <TabsTrigger 
              value="reimbursement" 
              className="flex items-center gap-2"
              data-testid="tab-reimbursement"
            >
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Reimbursement</span>
              <span className="sm:hidden">Reimburse</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            {requestType === 'advance' ? (
              <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertDescription className="text-blue-800 dark:text-blue-200">
                  <strong>Advance Payment:</strong> Request funds before spending. After receiving money, 
                  you must upload receipts to reconcile and close the balance.
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  <strong>Reimbursement:</strong> Already paid from your own funds? 
                  Upload receipts now to get reimbursed after approval.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </Tabs>

        <Separator />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Project *
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-project">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedProject?.budgetRemaining !== undefined && (
                      <FormDescription>
                        Budget remaining: {(selectedProject.budgetRemaining / 100).toLocaleString()} SDG
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="budgetLineCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Budget Line *
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-budget-line">
                          <SelectValue placeholder="Select budget category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(BUDGET_LINE_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label.en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Request Title *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Field Visit Transportation - Khartoum Sites" 
                      {...field}
                      data-testid="input-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="requestedAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Amount Requested *
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={field.value || ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          field.onChange(value === '' ? 0 : parseFloat(value));
                        }}
                        data-testid="input-amount"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-currency">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="SDG">SDG (Sudanese Pound)</SelectItem>
                        <SelectItem value="USD">USD (US Dollar)</SelectItem>
                        <SelectItem value="EUR">EUR (Euro)</SelectItem>
                      </SelectContent>
                    </Select>
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
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe what the funds will be used for..."
                      className="min-h-[80px]"
                      {...field}
                      data-testid="textarea-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="justification"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Justification *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Explain why this expense is necessary and how it supports project goals..."
                      className="min-h-[80px]"
                      {...field}
                      data-testid="textarea-justification"
                    />
                  </FormControl>
                  <FormDescription>
                    Provide clear reasoning to help approvers understand the need.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div className="space-y-4">
              <Label className="text-base font-medium flex items-center gap-2">
                <Upload className="h-4 w-4" />
                {requestType === 'advance' ? 'Supporting Documents (Optional)' : 'Receipts & Invoices (Required)'}
              </Label>
              <p className="text-sm text-muted-foreground">
                {requestType === 'advance' 
                  ? 'Upload quotes, estimates, or any documents that support your request.'
                  : 'Upload receipts or invoices proving the expense. Required for reimbursement.'}
              </p>

              {requestType === 'advance' ? (
                <CostDocumentUpload
                  documents={justificationDocs}
                  onChange={handleJustificationDocsChange}
                />
              ) : (
                <CostDocumentUpload
                  documents={reconciliationDocs}
                  onChange={handleReconciliationDocsChange}
                />
              )}
            </div>

            {requestType === 'advance' && (
              <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <AlertDescription className="text-amber-800 dark:text-amber-200">
                  <strong>Important:</strong> After funds are disbursed, you will need to upload receipts 
                  to reconcile and close this request. Unreconciled advances will be tracked as open balances.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end gap-3 pt-4">
              {onCancel && (
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={onCancel}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              )}
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="min-w-[140px]"
                data-testid="button-submit-request"
              >
                {isSubmitting ? (
                  "Submitting..."
                ) : (
                  <>
                    Submit Request
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}