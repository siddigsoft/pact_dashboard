import { useState } from "react";
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
import { SupportingDocument, OperationalExpenseCategory, OPERATIONAL_EXPENSE_LABELS } from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";
import { Loader2, DollarSign, FileText, Calendar, Building2, User, Receipt, Info } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";

const formSchema = z.object({
  expenseCategory: z.string().min(1, "Please select an expense category"),
  amountCents: z.number().min(1, "Amount must be greater than 0"),
  description: z.string().min(10, "Please provide a detailed description (at least 10 characters)"),
  expenseDate: z.string().min(1, "Please select the expense date"),
  vendor: z.string().optional(),
  referenceNumber: z.string().optional(),
  hubId: z.string().optional(),
  projectId: z.string().optional(),
  currency: z.string().default("SDG")
});

type FormValues = z.infer<typeof formSchema>;

interface OperationalCostFormProps {
  hubs?: { id: string; name: string }[];
  projects?: { id: string; name: string }[];
  onSuccess?: () => void;
}

const OperationalCostForm = ({ hubs = [], projects = [], onSuccess }: OperationalCostFormProps) => {
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supportingDocuments, setSupportingDocuments] = useState<SupportingDocument[]>([]);

  const expenseCategories: OperationalExpenseCategory[] = [
    'permits',
    'incentives',
    'communications',
    'training',
    'general_transport',
    'equipment',
    'printing',
    'meetings',
    'other'
  ];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      expenseCategory: "",
      amountCents: 0,
      description: "",
      expenseDate: new Date().toISOString().split('T')[0],
      vendor: "",
      referenceNumber: "",
      hubId: currentUser?.hubId || "",
      projectId: "",
      currency: "SDG"
    },
    mode: "onChange"
  });

  const watchedAmount = form.watch("amountCents");

  const onSubmit = async (values: FormValues) => {
    if (!currentUser) {
      toast({
        title: "Error",
        description: "You must be logged in to submit expenses",
        variant: "destructive"
      });
      return;
    }

    if (supportingDocuments.length === 0) {
      toast({
        title: "Documents Required",
        description: "Please upload at least one supporting document (receipt, invoice, etc.)",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('operational_cost_submissions')
        .insert({
          expense_category: values.expenseCategory,
          amount_cents: values.amountCents,
          currency: values.currency,
          description: values.description,
          expense_date: values.expenseDate,
          vendor: values.vendor || null,
          reference_number: values.referenceNumber || null,
          hub_id: values.hubId || null,
          project_id: values.projectId || null,
          submitted_by: currentUser.id,
          submitter_role: currentUser.role || 'Coordinator',
          supporting_documents: supportingDocuments,
          status: 'pending',
          tier1_status: 'pending',
          tier2_status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Expense Submitted",
        description: "Your operational expense has been submitted for approval",
      });

      form.reset();
      setSupportingDocuments([]);
      onSuccess?.();

    } catch (error: any) {
      console.error('Error submitting operational cost:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit expense. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          Submit Operational Expense
        </CardTitle>
        <CardDescription>
          Submit operational expenses for permits, training, communications, and other field operation costs.
          All submissions require two-tier approval (Supervisor/FOM, then Admin).
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-6">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                This form is for operational expenses only (permits, training, communications, etc.).
                For site visit transportation costs, use the "Site Visit Costs" tab.
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="expenseCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expense Category *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-expense-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expenseCategories.map((category) => (
                          <SelectItem key={category} value={category}>
                            {OPERATIONAL_EXPENSE_LABELS[category].en}
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
                name="expenseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expense Date *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="date"
                          className="pl-10"
                          data-testid="input-expense-date"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amountCents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount (SDG) *</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          min="0"
                          step="100"
                          className="pl-10"
                          placeholder="Enter amount in SDG"
                          data-testid="input-amount"
                          value={field.value / 100 || ""}
                          onChange={(e) => field.onChange(Math.round(parseFloat(e.target.value || "0") * 100))}
                        />
                      </div>
                    </FormControl>
                    <FormDescription>
                      {watchedAmount > 0 && (
                        <span className="text-primary font-medium">
                          {(watchedAmount / 100).toLocaleString()} SDG
                        </span>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="vendor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor / Supplier</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-10"
                          placeholder="Vendor name (optional)"
                          data-testid="input-vendor"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="referenceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice / Receipt Number</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          className="pl-10"
                          placeholder="Reference number (optional)"
                          data-testid="input-reference"
                          {...field}
                        />
                      </div>
                    </FormControl>
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
                      <FormLabel>Related Project</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-project">
                            <SelectValue placeholder="Select project (optional)" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">No specific project</SelectItem>
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Provide a detailed description of the expense, including purpose and justification..."
                      className="min-h-[100px]"
                      data-testid="input-description"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Be specific about what the expense was for and why it was necessary.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <FormLabel className="mb-2 block">Supporting Documents *</FormLabel>
              <CostDocumentUpload
                documents={supportingDocuments}
                onChange={setSupportingDocuments}
              />
              <p className="text-sm text-muted-foreground mt-2">
                Upload receipts, invoices, or other supporting documents. At least one document is required.
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Approval Workflow</h4>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="outline">Step 1</Badge>
                <span>Supervisor / FOM Review</span>
                <span className="text-muted-foreground/50">→</span>
                <Badge variant="outline">Step 2</Badge>
                <span>Admin Approval</span>
                <span className="text-muted-foreground/50">→</span>
                <Badge variant="secondary">Payment</Badge>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                form.reset();
                setSupportingDocuments([]);
              }}
              disabled={isSubmitting}
              data-testid="button-reset"
            >
              Clear Form
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !form.formState.isValid}
              data-testid="button-submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Receipt className="mr-2 h-4 w-4" />
                  Submit Expense
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
};

export default OperationalCostForm;
