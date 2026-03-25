import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/shared/hooks/use-toast";
import { 
  Receipt, 
  Upload, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowDown,
  ArrowUp,
  Wallet,
  FileCheck,
  Clock,
  Building2
} from "lucide-react";
import { 
  EnhancedCostRequest, 
  SupportingDocument, 
  SubmitReconciliationRequest,
  BUDGET_LINE_LABELS
} from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";
import { format } from "date-fns";

const reconciliationSchema = z.object({
  actualSpentAmount: z.number().min(0, "Amount must be 0 or greater"),
  reconciliationNotes: z.string().optional(),
});

type ReconciliationFormData = z.infer<typeof reconciliationSchema>;

interface CostReconciliationFormProps {
  request: EnhancedCostRequest;
  onSubmit: (data: SubmitReconciliationRequest) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export default function CostReconciliationForm({
  request,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: CostReconciliationFormProps) {
  const { toast } = useToast();
  const [reconciliationDocs, setReconciliationDocs] = useState<SupportingDocument[]>(
    request.reconciliationDocuments || []
  );

  const disbursedAmount = (request.disbursedAmountCents || 0) / 100;

  const form = useForm<ReconciliationFormData>({
    resolver: zodResolver(reconciliationSchema),
    defaultValues: {
      actualSpentAmount: disbursedAmount,
      reconciliationNotes: '',
    },
  });

  const watchedActualSpent = form.watch('actualSpentAmount') || 0;
  const balance = disbursedAmount - watchedActualSpent;
  const balancePercentage = disbursedAmount > 0 ? (watchedActualSpent / disbursedAmount) * 100 : 0;

  const getBalanceStatus = () => {
    if (balance === 0) return { status: 'settled', color: 'text-green-600', bg: 'bg-green-100' };
    if (balance > 0) return { status: 'underspent', color: 'text-blue-600', bg: 'bg-blue-100' };
    return { status: 'overspent', color: 'text-amber-600', bg: 'bg-amber-100' };
  };

  const balanceInfo = getBalanceStatus();

  const handleDocsChange = (docs: SupportingDocument[]) => {
    setReconciliationDocs(docs);
  };

  const handleFormSubmit = async (data: ReconciliationFormData) => {
    if (reconciliationDocs.length === 0) {
      toast({
        title: "Receipts Required",
        description: "Please upload at least one receipt to reconcile this advance.",
        variant: "destructive",
      });
      return;
    }

    const submitData: SubmitReconciliationRequest = {
      requestId: request.id,
      actualSpentCents: Math.round(data.actualSpentAmount * 100),
      reconciliationDocuments: reconciliationDocs,
      reconciliationNotes: data.reconciliationNotes,
    };

    await onSubmit(submitData);
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-primary" />
            Reconcile Advance Payment
          </CardTitle>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            <Clock className="h-3 w-3 mr-1" />
            Awaiting Reconciliation
          </Badge>
        </div>
        <CardDescription>
          Upload receipts and enter the actual amount spent to close this advance payment.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Request Details
          </h4>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Title</p>
              <p className="font-medium">{request.title}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Project</p>
              <p className="font-medium flex items-center gap-1">
                <Building2 className="h-4 w-4" />
                {request.projectName || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Budget Line</p>
              <p className="font-medium">
                {BUDGET_LINE_LABELS[request.budgetLineCategory]?.en || request.budgetLineCategory}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Disbursed On</p>
              <p className="font-medium">
                {request.disbursedAt 
                  ? format(new Date(request.disbursedAt), 'MMM d, yyyy')
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Wallet className="h-4 w-4" />
                Disbursed
              </div>
              <p className="text-2xl font-bold text-primary">
                {disbursedAmount.toLocaleString()} {request.currency}
              </p>
            </CardContent>
          </Card>

          <Card className={`${balanceInfo.bg} border-none`}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Receipt className="h-4 w-4" />
                Actual Spent
              </div>
              <p className={`text-2xl font-bold ${balanceInfo.color}`}>
                {watchedActualSpent.toLocaleString()} {request.currency}
              </p>
            </CardContent>
          </Card>

          <Card className={balance !== 0 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200' : 'bg-green-50 dark:bg-green-950/30 border-green-200'}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                {balance > 0 ? <ArrowDown className="h-4 w-4" /> : balance < 0 ? <ArrowUp className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                Balance
              </div>
              <p className={`text-2xl font-bold ${balance === 0 ? 'text-green-600' : balance > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                {Math.abs(balance).toLocaleString()} {request.currency}
                {balance > 0 && <span className="text-sm font-normal ml-1">(to return)</span>}
                {balance < 0 && <span className="text-sm font-normal ml-1">(needs top-up)</span>}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Spending Progress</span>
            <span>{Math.min(balancePercentage, 100).toFixed(0)}%</span>
          </div>
          <Progress value={Math.min(balancePercentage, 100)} className="h-2" />
          {balancePercentage > 100 && (
            <p className="text-xs text-amber-600">
              Spent {(balancePercentage - 100).toFixed(0)}% more than disbursed amount
            </p>
          )}
        </div>

        <Separator />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="actualSpentAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Actual Amount Spent *
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        data-testid="input-actual-spent"
                      />
                    </FormControl>
                    <FormDescription>
                      Enter the total amount spent from receipts
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-end">
                <div className={`p-3 rounded-lg flex-1 ${balanceInfo.bg}`}>
                  {balance === 0 ? (
                    <div className="flex items-center gap-2 text-green-700">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">Exact match - Balance settled</span>
                    </div>
                  ) : balance > 0 ? (
                    <div className="flex items-center gap-2 text-blue-700">
                      <ArrowDown className="h-5 w-5" />
                      <span className="font-medium">
                        Return {balance.toLocaleString()} {request.currency}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-amber-700">
                      <ArrowUp className="h-5 w-5" />
                      <span className="font-medium">
                        Need additional {Math.abs(balance).toLocaleString()} {request.currency}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <FormField
              control={form.control}
              name="reconciliationNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reconciliation Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Explain any variance between disbursed and spent amounts..."
                      className="min-h-[80px]"
                      {...field}
                      data-testid="textarea-reconciliation-notes"
                    />
                  </FormControl>
                  <FormDescription>
                    {balance !== 0 && "Please explain the difference between disbursed and actual spent amounts."}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                <span className="font-medium">Receipts & Invoices *</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Upload all receipts and invoices for the expenses. At least one document is required.
              </p>

              <CostDocumentUpload
                documents={reconciliationDocs}
                onChange={handleDocsChange}
              />
            </div>

            {balance < 0 && (
              <Alert className="bg-amber-50 dark:bg-amber-950/30 border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Overspent Amount</AlertTitle>
                <AlertDescription className="text-amber-700">
                  You spent more than the disbursed amount. After reconciliation is verified, 
                  you may receive an additional payment of {Math.abs(balance).toLocaleString()} {request.currency}.
                </AlertDescription>
              </Alert>
            )}

            {balance > 0 && (
              <Alert className="bg-blue-50 dark:bg-blue-950/30 border-blue-200">
                <ArrowDown className="h-4 w-4 text-blue-600" />
                <AlertTitle className="text-blue-800">Balance to Return</AlertTitle>
                <AlertDescription className="text-blue-700">
                  You have {balance.toLocaleString()} {request.currency} remaining. 
                  Please arrange to return this amount after reconciliation is approved.
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
                disabled={isSubmitting || reconciliationDocs.length === 0}
                className="min-w-[180px]"
                data-testid="button-submit-reconciliation"
              >
                {isSubmitting ? (
                  "Submitting..."
                ) : (
                  <>
                    <FileCheck className="mr-2 h-4 w-4" />
                    Submit Reconciliation
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