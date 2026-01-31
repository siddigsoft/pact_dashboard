import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  DollarSign, 
  FileText, 
  Building2, 
  Wallet, 
  Receipt,
  AlertCircle,
  Info,
  Loader2,
  Calendar,
  Send
} from "lucide-react";
import { SupportingDocument } from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";

const EXPENSE_CATEGORIES = {
  permits: "Permits & Licenses",
  incentives: "Incentives & Allowances",
  communications: "Internet & Communications",
  training: "Training & Capacity Building",
  transport: "Transportation & Travel",
  equipment: "Equipment & Supplies",
  printing: "Printing & Stationery",
  meetings: "Meetings & Refreshments",
  office_admin: "Office & Administration",
  other: "Other Expenses"
} as const;

type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

const formSchema = z.object({
  fundingType: z.enum(['advance', 'reimbursement']),
  expenseCategory: z.string().min(1, "Please select an expense category"),
  projectId: z.string().optional(),
  hubId: z.string().optional(),
  amount: z.number().min(1, "Amount must be greater than 0"),
  currency: z.string().default("SDG"),
  title: z.string().min(3, "Title is required (min 3 characters)"),
  description: z.string().min(10, "Please provide a detailed description (at least 10 characters)"),
  justification: z.string().min(10, "Please explain why this expense is needed (at least 10 characters)"),
  expenseDate: z.string().optional(),
  vendor: z.string().optional(),
  referenceNumber: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface Project {
  id: string;
  name: string;
  budgetRemaining?: number;
}

interface Hub {
  id: string;
  name: string;
}

interface UnifiedCostRequestFormProps {
  projects?: Project[];
  hubs?: Hub[];
  onSuccess?: () => void;
}

export default function UnifiedCostRequestForm({ 
  projects = [], 
  hubs = [],
  onSuccess 
}: UnifiedCostRequestFormProps) {
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supportingDocuments, setSupportingDocuments] = useState<SupportingDocument[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      fundingType: 'advance',
      expenseCategory: '',
      projectId: '',
      hubId: currentUser?.hubId || '',
      amount: 0,
      currency: 'SDG',
      title: '',
      description: '',
      justification: '',
      expenseDate: new Date().toISOString().split('T')[0],
      vendor: '',
      referenceNumber: '',
    },
    mode: "onChange"
  });

  const watchedFundingType = form.watch('fundingType');
  const watchedAmount = form.watch('amount');

  const onSubmit = async (values: FormValues) => {
    if (!currentUser) {
      toast({
        title: "Error",
        description: "You must be logged in to submit a request",
        variant: "destructive"
      });
      return;
    }

    // Documents required for reimbursements (proof of payment), optional for advances
    if (values.fundingType === 'reimbursement' && supportingDocuments.length === 0) {
      toast({
        title: "Documents Required",
        description: "Please upload receipts or proof of payment for reimbursement requests",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .insert({
          user_id: currentUser.id,
          expense_category: values.expenseCategory,
          amount_cents: Math.round(values.amount * 100),
          currency: values.currency,
          description: `[${values.fundingType.toUpperCase()}] ${values.title}\n\n${values.description}\n\nJustification: ${values.justification}`,
          expense_date: values.expenseDate || new Date().toISOString().split('T')[0],
          vendor: values.vendor || null,
          reference_number: values.referenceNumber || null,
          hub_id: values.hubId || currentUser.hubId || null,
          project_id: values.projectId || null,
          supporting_documents: supportingDocuments,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: values.fundingType === 'advance' ? "Advance Request Submitted" : "Reimbursement Request Submitted",
        description: `Your ${values.fundingType} request for ${values.currency} ${values.amount.toLocaleString()} has been submitted for approval.`,
      });

      form.reset();
      setSupportingDocuments([]);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error submitting request:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit request. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Field Cost Request
            </CardTitle>
            <CardDescription>
              Request funds for field operations. All requests require approval and reconciliation after spending.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <FormField
              control={form.control}
              name="fundingType"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Request Type *</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex gap-4"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="advance" id="advance" />
                        <label htmlFor="advance" className="text-sm font-medium cursor-pointer">
                          <Badge variant="outline" className="gap-1">
                            <Wallet className="h-3 w-3" />
                            Advance
                          </Badge>
                          <span className="ml-2 text-muted-foreground">I need funds upfront</span>
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="reimbursement" id="reimbursement" />
                        <label htmlFor="reimbursement" className="text-sm font-medium cursor-pointer">
                          <Badge variant="outline" className="gap-1">
                            <Receipt className="h-3 w-3" />
                            Reimbursement
                          </Badge>
                          <span className="ml-2 text-muted-foreground">I already paid</span>
                        </label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
                {watchedFundingType === 'advance' 
                  ? "Advance: You'll receive funds before spending. You must reconcile with receipts after the activity."
                  : "Reimbursement: You've already paid. Attach receipts to get your money back."}
              </AlertDescription>
            </Alert>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="expenseCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expense Category *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-expense-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => (
                          <SelectItem key={key} value={key} data-testid={`category-${key}`}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {projects.length > 0 && (
                <FormField
                  control={form.control}
                  name="projectId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-project">
                            <SelectValue placeholder="Select project" />
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Request Title *</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Training materials for January workshop" 
                      {...field}
                      data-testid="input-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          placeholder="0"
                          className="pl-9"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          data-testid="input-amount"
                        />
                      </div>
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
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-currency">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="SDG">SDG</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expenseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {watchedFundingType === 'advance' ? 'Planned Date' : 'Expense Date'}
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          className="pl-9"
                          {...field}
                          data-testid="input-date"
                        />
                      </div>
                    </FormControl>
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
                      placeholder="Describe what this expense is for..."
                      className="min-h-[80px]"
                      {...field}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormDescription>
                    Provide details about the expense and what it will be used for.
                  </FormDescription>
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
                      placeholder="Explain why this expense is necessary..."
                      className="min-h-[80px]"
                      {...field}
                      data-testid="input-justification"
                    />
                  </FormControl>
                  <FormDescription>
                    Explain why this expense is needed for field operations.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="vendor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor/Supplier (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Vendor name"
                          className="pl-9"
                          {...field}
                          data-testid="input-vendor"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="referenceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reference Number (Optional)</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Invoice/Receipt number"
                          className="pl-9"
                          {...field}
                          data-testid="input-reference"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">
                  Supporting Documents {watchedFundingType === 'reimbursement' ? '*' : '(Optional)'}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {watchedFundingType === 'advance' 
                    ? "Upload quotes, estimates, or supporting documentation if available."
                    : "Upload receipts, invoices, or proof of payment (required)."}
                </p>
                <CostDocumentUpload
                  documents={supportingDocuments}
                  onChange={setSupportingDocuments}
                />
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between border-t pt-6">
            <div className="text-sm text-muted-foreground">
              {watchedAmount > 0 && (
                <span className="font-medium">
                  Total: {form.watch('currency')} {watchedAmount.toLocaleString()}
                </span>
              )}
            </div>
            <Button 
              type="submit" 
              disabled={isSubmitting}
              data-testid="button-submit-request"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Submit Request
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Reminder:</strong> All approved requests require reconciliation. 
            After spending, you must submit receipts documenting how the funds were used.
          </AlertDescription>
        </Alert>
      </form>
    </Form>
  );
}
