import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { 
  DollarSign, 
  FileText, 
  Building2, 
  Wallet, 
  Receipt,
  Info,
  Loader2,
  Calendar,
  Send,
  Ticket,
  Gift,
  Wifi,
  GraduationCap,
  Car,
  Package,
  Printer,
  Coffee,
  FolderOpen,
  MoreHorizontal,
  CheckCircle2,
  ArrowRight
} from "lucide-react";
import { SupportingDocument } from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";

const EXPENSE_CATEGORIES = {
  permits: { label: "Permits & Licenses", icon: Ticket, color: "from-purple-500 to-purple-600" },
  incentives: { label: "Incentives & Allowances", icon: Gift, color: "from-pink-500 to-pink-600" },
  communications: { label: "Internet & Comms", icon: Wifi, color: "from-blue-500 to-blue-600" },
  training: { label: "Training", icon: GraduationCap, color: "from-emerald-500 to-emerald-600" },
  transport: { label: "Transportation", icon: Car, color: "from-orange-500 to-orange-600" },
  equipment: { label: "Equipment & Supplies", icon: Package, color: "from-cyan-500 to-cyan-600" },
  printing: { label: "Printing & Stationery", icon: Printer, color: "from-slate-500 to-slate-600" },
  meetings: { label: "Meetings", icon: Coffee, color: "from-amber-500 to-amber-600" },
  office_admin: { label: "Office Admin", icon: FolderOpen, color: "from-indigo-500 to-indigo-600" },
  other: { label: "Other", icon: MoreHorizontal, color: "from-gray-500 to-gray-600" }
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
  const watchedCategory = form.watch('expenseCategory');
  const watchedTitle = form.watch('title');

  const formProgress = useMemo(() => {
    let completed = 0;
    if (watchedCategory) completed++;
    if (watchedTitle && watchedTitle.length >= 3) completed++;
    if (watchedAmount > 0) completed++;
    if (form.watch('description')?.length >= 10) completed++;
    if (form.watch('justification')?.length >= 10) completed++;
    return Math.round((completed / 5) * 100);
  }, [watchedCategory, watchedTitle, watchedAmount, form.watch('description'), form.watch('justification')]);

  const onSubmit = async (values: FormValues) => {
    if (!currentUser) {
      toast({
        title: "Error",
        description: "You must be logged in to submit a request",
        variant: "destructive"
      });
      return;
    }

    if (!currentUser.id) {
      toast({
        title: "Error",
        description: "User session is invalid. Please log out and log back in.",
        variant: "destructive"
      });
      return;
    }

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
      const hubId = values.hubId && values.hubId.trim() !== '' ? values.hubId : (currentUser.hubId || null);
      const projectId = values.projectId && values.projectId.trim() !== '' ? values.projectId : null;

      const insertData = {
        submitted_by: currentUser.id,
        submitter_role: currentUser.role || 'user',
        expense_category: values.expenseCategory,
        amount_cents: Math.round(values.amount * 100),
        currency: values.currency,
        description: `[${values.fundingType.toUpperCase()}] ${values.title}\n\n${values.description}\n\nJustification: ${values.justification}`,
        expense_date: values.expenseDate || new Date().toISOString().split('T')[0],
        vendor: values.vendor && values.vendor.trim() !== '' ? values.vendor : null,
        reference_number: values.referenceNumber && values.referenceNumber.trim() !== '' ? values.referenceNumber : null,
        hub_id: hubId,
        project_id: projectId,
        supporting_documents: supportingDocuments.length > 0 ? supportingDocuments : [],
        status: 'pending',
        tier1_status: 'pending',
        tier2_status: 'pending'
      };

      const { data, error } = await supabase
        .from('operational_cost_submissions')
        .insert(insertData)
        .select();

      if (error) {
        console.error('Supabase insert error:', error);
        throw new Error(error.message || 'Database insertion failed');
      }

      toast({
        title: values.fundingType === 'advance' ? "Advance Request Submitted" : "Reimbursement Submitted",
        description: `Your request for ${values.currency} ${values.amount.toLocaleString()} has been submitted successfully.`,
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

  const selectedCategory = watchedCategory ? EXPENSE_CATEGORIES[watchedCategory as ExpenseCategory] : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Card className="overflow-hidden border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold">Field Cost Request</h2>
                  <p className="text-blue-100 text-xs sm:text-sm">Request funds for field operations</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-xs text-blue-200">Progress</div>
                  <div className="text-lg font-bold">{formProgress}%</div>
                </div>
                <div className="w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center relative">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle
                      cx="24" cy="24" r="20"
                      fill="none"
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth="3"
                    />
                    <circle
                      cx="24" cy="24" r="20"
                      fill="none"
                      stroke="white"
                      strokeWidth="3"
                      strokeDasharray={`${formProgress * 1.26} 126`}
                      strokeLinecap="round"
                    />
                  </svg>
                  {formProgress === 100 ? (
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  ) : (
                    <span className="text-xs font-bold">{Math.round(formProgress / 20)}/5</span>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6 space-y-6">
            <div className="flex gap-2 p-1 bg-muted rounded-lg">
              <Button
                type="button"
                variant={watchedFundingType === 'advance' ? 'default' : 'ghost'}
                className={cn(
                  "flex-1 gap-2 transition-all",
                  watchedFundingType === 'advance' && "shadow-md"
                )}
                onClick={() => form.setValue('fundingType', 'advance')}
                data-testid="button-advance"
              >
                <Wallet className="h-4 w-4" />
                <span className="hidden sm:inline">Advance</span>
                <span className="sm:hidden">Adv</span>
                <span className="text-xs opacity-70 hidden md:inline">- Get funds first</span>
              </Button>
              <Button
                type="button"
                variant={watchedFundingType === 'reimbursement' ? 'default' : 'ghost'}
                className={cn(
                  "flex-1 gap-2 transition-all",
                  watchedFundingType === 'reimbursement' && "shadow-md"
                )}
                onClick={() => form.setValue('fundingType', 'reimbursement')}
                data-testid="button-reimbursement"
              >
                <Receipt className="h-4 w-4" />
                <span className="hidden sm:inline">Reimbursement</span>
                <span className="sm:hidden">Reimb</span>
                <span className="text-xs opacity-70 hidden md:inline">- Already paid</span>
              </Button>
            </div>

            <Alert className={cn(
              "border transition-colors",
              watchedFundingType === 'advance' 
                ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"
                : "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
            )}>
              <Info className={cn(
                "h-4 w-4",
                watchedFundingType === 'advance' ? "text-blue-600" : "text-green-600"
              )} />
              <AlertDescription className={cn(
                "text-sm",
                watchedFundingType === 'advance' 
                  ? "text-blue-700 dark:text-blue-300"
                  : "text-green-700 dark:text-green-300"
              )}>
                {watchedFundingType === 'advance' 
                  ? "You'll receive funds upfront. Reconcile with receipts after spending."
                  : "Attach receipts to get reimbursed for expenses you've already paid."}
              </AlertDescription>
            </Alert>

            <div>
              <FormLabel className="text-sm font-medium mb-3 block">
                Expense Category <span className="text-destructive">*</span>
              </FormLabel>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {Object.entries(EXPENSE_CATEGORIES).map(([key, { label, icon: Icon, color }]) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    className={cn(
                      "h-auto py-3 px-2 flex-col gap-1.5 border-2 transition-all",
                      watchedCategory === key 
                        ? `bg-gradient-to-br ${color} text-white border-transparent shadow-lg scale-[1.02]`
                        : "hover-elevate"
                    )}
                    onClick={() => form.setValue('expenseCategory', key)}
                    data-testid={`category-${key}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-[10px] sm:text-xs font-medium text-center leading-tight">{label}</span>
                  </Button>
                ))}
              </div>
              {form.formState.errors.expenseCategory && (
                <p className="text-sm text-destructive mt-2">{form.formState.errors.expenseCategory.message}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Request Title <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., Training materials for workshop" 
                        {...field}
                        data-testid="input-title"
                      />
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

            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount <span className="text-destructive">*</span></FormLabel>
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
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
                  <FormLabel>Description <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="What is this expense for? Provide details..."
                      className="min-h-[70px] resize-none"
                      {...field}
                      data-testid="input-description"
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
                  <FormLabel>Justification <span className="text-destructive">*</span></FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Why is this expense necessary for field operations?"
                      className="min-h-[70px] resize-none"
                      {...field}
                      data-testid="input-justification"
                    />
                  </FormControl>
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
                    <FormLabel>Reference # (Optional)</FormLabel>
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

            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Documents {watchedFundingType === 'reimbursement' && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
                </h3>
                <span className="text-xs text-muted-foreground">
                  {supportingDocuments.length} file{supportingDocuments.length !== 1 ? 's' : ''} attached
                </span>
              </div>
              <CostDocumentUpload
                documents={supportingDocuments}
                onChange={setSupportingDocuments}
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t bg-muted/30 p-4 sm:p-6">
            {watchedAmount > 0 && selectedCategory ? (
              <div className="flex items-center gap-3 p-3 bg-background rounded-lg border">
                <div className={cn(
                  "p-2 rounded-lg bg-gradient-to-br",
                  selectedCategory.color
                )}>
                  <selectedCategory.icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">{selectedCategory.label}</div>
                  <div className="font-bold text-lg">{form.watch('currency')} {watchedAmount.toLocaleString()}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                Fill in required fields to submit
              </div>
            )}
            
            <Button 
              type="submit" 
              disabled={isSubmitting || formProgress < 100}
              className="gap-2"
              data-testid="button-submit-request"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Request
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
