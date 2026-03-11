import { useState, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { SupportingDocument, OperationalExpenseCategory, OPERATIONAL_EXPENSE_LABELS } from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";
import { Loader2, DollarSign, FileText, Calendar, Building2, Receipt, Info, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";

interface LineItem {
  id: string;
  expenseCategory: string;
  amountCents: number;
  description: string;
  expenseDate: string;
  vendor: string;
  referenceNumber: string;
}

interface OperationalCostFormProps {
  hubs?: { id: string; name: string }[];
  projects?: { id: string; name: string }[];
  onSuccess?: () => void;
}

const expenseCategories: OperationalExpenseCategory[] = [
  'permits',
  'incentives',
  'communications',
  'training',
  'equipment',
  'printing',
  'meetings',
  'other'
];

const createEmptyItem = (): LineItem => ({
  id: uuidv4(),
  expenseCategory: "",
  amountCents: 0,
  description: "",
  expenseDate: new Date().toISOString().split('T')[0],
  vendor: "",
  referenceNumber: ""
});

const OperationalCostForm = ({ hubs = [], projects = [], onSuccess }: OperationalCostFormProps) => {
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supportingDocuments, setSupportingDocuments] = useState<SupportingDocument[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([createEmptyItem()]);
  const [projectId, setProjectId] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => new Set([lineItems[0].id]));
  const [itemErrors, setItemErrors] = useState<Record<string, Record<string, string>>>({});

  const toggleExpand = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const addLineItem = useCallback(() => {
    const newItem = createEmptyItem();
    setLineItems(prev => [...prev, newItem]);
    setExpandedItems(prev => new Set([...prev, newItem.id]));
  }, []);

  const removeLineItem = useCallback((id: string) => {
    setLineItems(prev => prev.length > 1 ? prev.filter(item => item.id !== id) : prev);
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const updateLineItem = useCallback((id: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  }, []);

  const totalAmountCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

  const validateItems = (): string | null => {
    const errors: Record<string, Record<string, string>> = {};
    let firstError: string | null = null;
    const expandIds = new Set<string>();

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const itemErr: Record<string, string> = {};
      if (!item.expenseCategory) { itemErr.expenseCategory = "Please select a category"; if (!firstError) firstError = `Item ${i + 1}: Please select an expense category`; }
      if (item.amountCents < 1) { itemErr.amountCents = "Amount must be greater than 0"; if (!firstError) firstError = `Item ${i + 1}: Amount must be greater than 0`; }
      if (!item.description || item.description.length < 10) { itemErr.description = "At least 10 characters required"; if (!firstError) firstError = `Item ${i + 1}: Please provide a description (at least 10 characters)`; }
      if (!item.expenseDate) { itemErr.expenseDate = "Please select a date"; if (!firstError) firstError = `Item ${i + 1}: Please select the expense date`; }
      if (Object.keys(itemErr).length > 0) {
        errors[item.id] = itemErr;
        expandIds.add(item.id);
      }
    }

    setItemErrors(errors);
    if (expandIds.size > 0) {
      setExpandedItems(prev => new Set([...prev, ...expandIds]));
    }
    return firstError;
  };

  const onSubmit = async () => {
    if (!currentUser) {
      toast({ title: "Error", description: "You must be logged in to submit expenses", variant: "destructive" });
      return;
    }

    const validationError = validateItems();
    if (validationError) {
      toast({ title: "Validation Error", description: validationError, variant: "destructive" });
      return;
    }

    if (supportingDocuments.length === 0) {
      toast({ title: "Documents Required", description: "Please upload at least one supporting document (receipt, invoice, etc.)", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const rows = lineItems.map(item => ({
        expense_category: item.expenseCategory,
        amount_cents: item.amountCents,
        currency: "SDG",
        description: item.description,
        expense_date: item.expenseDate,
        vendor: item.vendor || null,
        reference_number: item.referenceNumber || null,
        hub_id: currentUser.hubId || null,
        project_id: projectId || null,
        submitted_by: currentUser.id,
        submitter_role: currentUser.role || 'Coordinator',
        supporting_documents: supportingDocuments,
        status: 'pending',
        tier1_status: 'pending',
        tier2_status: 'pending',
        ...(((currentUser.role || '').toLowerCase().includes('coordinator')) ? { tier3_status: 'pending' } : {})
      }));

      const { error } = await supabase
        .from('operational_cost_submissions')
        .insert(rows);

      if (error) {
        console.error('Supabase insert error:', error);
        let userMessage = error.message || 'Database insertion failed';
        if (error.code === '42501' || error.message?.includes('row-level security') || error.message?.includes('policy')) {
          userMessage = 'Your role does not have permission to submit operational costs. Please contact your administrator to update the database permissions.';
        } else if (error.code === '42P01' || error.message?.includes('does not exist')) {
          userMessage = 'The operational cost submissions table has not been created yet. Please run the migration SQL in Supabase.';
        } else if (error.code === '23514' || error.message?.includes('check constraint')) {
          userMessage = 'Invalid expense category. Please run the latest database migration to update allowed categories.';
        }
        throw new Error(userMessage);
      }

      toast({
        title: "Expenses Submitted",
        description: `${lineItems.length} expense item${lineItems.length > 1 ? 's' : ''} submitted for approval`,
      });

      const newItem = createEmptyItem();
      setLineItems([newItem]);
      setExpandedItems(new Set([newItem.id]));
      setSupportingDocuments([]);
      setProjectId("");
      onSuccess?.();

    } catch (error: any) {
      console.error('Error submitting operational cost:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit expenses. Please try again.",
        variant: "destructive",
        duration: 10000
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
          Submit Operational Expenses
        </CardTitle>
        <CardDescription>
          Add one or more expense items below. You can select the same category multiple times (e.g. Permits for different states).
          {currentUser?.role === 'country_director'
            ? ' Submissions require two-tier approval (Admin, then Super Admin).'
            : ' Submissions require two-tier approval (Supervisor/FOM, then Admin).'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            This form is for operational expenses only (permits, training, communications, etc.).
            For site visit transportation costs, use the "Site Visit Costs" tab.
          </AlertDescription>
        </Alert>

        {projects.length > 0 && (
          <div>
            <Label>Related Project</Label>
            <Select onValueChange={(val) => setProjectId(val === "__none__" ? "" : val)} value={projectId || "__none__"}>
              <SelectTrigger data-testid="select-project" className="mt-1">
                <SelectValue placeholder="Select project (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No specific project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="font-medium text-sm">
              Expense Items ({lineItems.length})
            </h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLineItem}
              data-testid="button-add-item"
            >
              <Plus className="mr-1 h-4 w-4" />
              Add Item
            </Button>
          </div>

          {lineItems.map((item, index) => {
            const isExpanded = expandedItems.has(item.id);
            const categoryLabel = item.expenseCategory
              ? OPERATIONAL_EXPENSE_LABELS[item.expenseCategory as OperationalExpenseCategory]?.en
              : '';
            const amountDisplay = item.amountCents > 0 ? `${(item.amountCents / 100).toLocaleString()} SDG` : '';

            return (
              <Card key={item.id} className="border" data-testid={`card-item-${index}`}>
                <div
                  className="flex items-center justify-between gap-2 p-3 cursor-pointer select-none"
                  onClick={() => toggleExpand(item.id)}
                  data-testid={`button-toggle-item-${index}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                    <Badge variant="secondary" className="shrink-0">
                      #{index + 1}
                    </Badge>
                    {categoryLabel && (
                      <Badge variant="outline" className="shrink-0">
                        {categoryLabel}
                      </Badge>
                    )}
                    {amountDisplay && (
                      <span className="text-sm font-medium text-green-600">{amountDisplay}</span>
                    )}
                    {!categoryLabel && !amountDisplay && (
                      <span className="text-sm text-muted-foreground">New item - click to expand</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {lineItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); removeLineItem(item.id); }}
                        data-testid={`button-remove-item-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 space-y-4 border-t pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Expense Category *</Label>
                        <Select
                          onValueChange={(val) => { updateLineItem(item.id, 'expenseCategory', val); setItemErrors(prev => { const next = { ...prev }; if (next[item.id]) { const { expenseCategory, ...rest } = next[item.id]; next[item.id] = rest; } return next; }); }}
                          value={item.expenseCategory}
                        >
                          <SelectTrigger data-testid={`select-category-${index}`} className={`mt-1 ${itemErrors[item.id]?.expenseCategory ? 'border-destructive' : ''}`}>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {expenseCategories.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {OPERATIONAL_EXPENSE_LABELS[cat].en}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {itemErrors[item.id]?.expenseCategory && <p className="text-xs text-destructive mt-1">{itemErrors[item.id].expenseCategory}</p>}
                      </div>

                      <div>
                        <Label>Expense Date *</Label>
                        <div className="relative mt-1">
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="date"
                            className={`pl-10 ${itemErrors[item.id]?.expenseDate ? 'border-destructive' : ''}`}
                            value={item.expenseDate}
                            onChange={(e) => { updateLineItem(item.id, 'expenseDate', e.target.value); setItemErrors(prev => { const next = { ...prev }; if (next[item.id]) { const { expenseDate, ...rest } = next[item.id]; next[item.id] = rest; } return next; }); }}
                            data-testid={`input-date-${index}`}
                          />
                        </div>
                        {itemErrors[item.id]?.expenseDate && <p className="text-xs text-destructive mt-1">{itemErrors[item.id].expenseDate}</p>}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Amount (SDG) *</Label>
                        <div className="relative mt-1">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="number"
                            min="0"
                            step="100"
                            className={`pl-10 ${itemErrors[item.id]?.amountCents ? 'border-destructive' : ''}`}
                            placeholder="Enter amount in SDG"
                            value={item.amountCents > 0 ? item.amountCents / 100 : ""}
                            onChange={(e) => { updateLineItem(item.id, 'amountCents', Math.round(parseFloat(e.target.value || "0") * 100)); setItemErrors(prev => { const next = { ...prev }; if (next[item.id]) { const { amountCents, ...rest } = next[item.id]; next[item.id] = rest; } return next; }); }}
                            data-testid={`input-amount-${index}`}
                          />
                        </div>
                        {itemErrors[item.id]?.amountCents && <p className="text-xs text-destructive mt-1">{itemErrors[item.id].amountCents}</p>}
                        {!itemErrors[item.id]?.amountCents && item.amountCents > 0 && (
                          <p className="text-xs text-primary font-medium mt-1">
                            {(item.amountCents / 100).toLocaleString()} SDG
                          </p>
                        )}
                      </div>

                      <div>
                        <Label>Vendor / Supplier</Label>
                        <div className="relative mt-1">
                          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            className="pl-10"
                            placeholder="Vendor name (optional)"
                            value={item.vendor}
                            onChange={(e) => updateLineItem(item.id, 'vendor', e.target.value)}
                            data-testid={`input-vendor-${index}`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Invoice / Receipt Number</Label>
                        <div className="relative mt-1">
                          <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            className="pl-10"
                            placeholder="Reference number (optional)"
                            value={item.referenceNumber}
                            onChange={(e) => updateLineItem(item.id, 'referenceNumber', e.target.value)}
                            data-testid={`input-reference-${index}`}
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label>Description *</Label>
                      <Textarea
                        placeholder="Describe this expense - include purpose, location/state, and justification..."
                        className={`min-h-[80px] mt-1 ${itemErrors[item.id]?.description ? 'border-destructive' : ''}`}
                        value={item.description}
                        onChange={(e) => { updateLineItem(item.id, 'description', e.target.value); setItemErrors(prev => { const next = { ...prev }; if (next[item.id]) { const { description, ...rest } = next[item.id]; next[item.id] = rest; } return next; }); }}
                        data-testid={`input-description-${index}`}
                      />
                      {itemErrors[item.id]?.description && <p className="text-xs text-destructive mt-1">{itemErrors[item.id].description}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        At least 10 characters. Be specific about what, where, and why.
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={addLineItem}
            data-testid="button-add-item-bottom"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Another Expense Item
          </Button>
        </div>

        {lineItems.length > 0 && totalAmountCents > 0 && (
          <div className="bg-muted/50 rounded-lg p-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="text-sm text-muted-foreground">Total ({lineItems.length} item{lineItems.length > 1 ? 's' : ''})</span>
            </div>
            <span className="text-lg font-bold text-green-600">
              {(totalAmountCents / 100).toLocaleString()} SDG
            </span>
          </div>
        )}

        <div>
          <Label className="mb-2 block">Supporting Documents *</Label>
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
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

      <CardFooter className="flex justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const newItem = createEmptyItem();
            setLineItems([newItem]);
            setExpandedItems(new Set([newItem.id]));
            setSupportingDocuments([]);
            setProjectId("");
            setItemErrors({});
          }}
          disabled={isSubmitting}
          data-testid="button-reset"
        >
          Clear All
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          data-testid="button-submit"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting {lineItems.length} item{lineItems.length > 1 ? 's' : ''}...
            </>
          ) : (
            <>
              <Receipt className="mr-2 h-4 w-4" />
              Submit {lineItems.length} Expense{lineItems.length > 1 ? 's' : ''}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default OperationalCostForm;
