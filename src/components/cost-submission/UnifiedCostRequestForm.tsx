import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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
  MoreHorizontal,
  CheckCircle2,
  ArrowRight,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Copy
} from "lucide-react";
import { SupportingDocument } from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";

const EXPENSE_CATEGORIES = {
  permits: { label: "Permits & Licenses", icon: Ticket, color: "from-purple-500 to-purple-600" },
  incentives: { label: "Incentives & Allowances", icon: Gift, color: "from-pink-500 to-pink-600" },
  communications: { label: "Internet & Comms", icon: Wifi, color: "from-blue-500 to-blue-600" },
  training: { label: "Training", icon: GraduationCap, color: "from-emerald-500 to-emerald-600" },
  general_transport: { label: "Transportation", icon: Car, color: "from-orange-500 to-orange-600" },
  equipment: { label: "Equipment & Supplies", icon: Package, color: "from-cyan-500 to-cyan-600" },
  printing: { label: "Printing & Stationery", icon: Printer, color: "from-slate-500 to-slate-600" },
  meetings: { label: "Meetings", icon: Coffee, color: "from-amber-500 to-amber-600" },
  other: { label: "Other", icon: MoreHorizontal, color: "from-gray-500 to-gray-600" }
} as const;

type ExpenseCategory = keyof typeof EXPENSE_CATEGORIES;

interface LineItem {
  id: string;
  expenseCategory: string;
  title: string;
  amount: number;
  currency: string;
  description: string;
  justification: string;
  expenseDate: string;
  vendor: string;
  referenceNumber: string;
}

interface Project {
  id: string;
  name: string;
  budgetRemaining?: number;
}

interface Hub {
  id: string;
  name: string;
}

interface EditSubmissionData {
  id: string;
  expense_category: string;
  amount_cents: number;
  currency: string;
  description: string | null;
  expense_date: string | null;
  vendor: string | null;
  reference_number: string | null;
  hub_id: string | null;
  project_id: string | null;
  supporting_documents: any;
  status: string;
}

interface UnifiedCostRequestFormProps {
  projects?: Project[];
  hubs?: Hub[];
  onSuccess?: () => void;
  editData?: EditSubmissionData | null;
  onCancelEdit?: () => void;
}

type ItemErrors = Record<string, Record<string, string>>;

function createEmptyItem(): LineItem {
  return {
    id: uuidv4(),
    expenseCategory: '',
    title: '',
    amount: 0,
    currency: 'SDG',
    description: '',
    justification: '',
    expenseDate: new Date().toISOString().split('T')[0],
    vendor: '',
    referenceNumber: '',
  };
}

export default function UnifiedCostRequestForm({ 
  projects = [], 
  hubs = [],
  onSuccess,
  editData,
  onCancelEdit,
}: UnifiedCostRequestFormProps) {
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [supportingDocuments, setSupportingDocuments] = useState<SupportingDocument[]>(
    editData?.supporting_documents && Array.isArray(editData.supporting_documents) 
      ? editData.supporting_documents 
      : []
  );

  const parseEditDescription = (desc: string | null) => {
    if (!desc) return { fundingType: 'advance' as const, title: '', description: '', justification: '' };
    const fundingMatch = desc.match(/^\[(ADVANCE|REIMBURSEMENT)\]\s*/);
    const fundingType = fundingMatch?.[1]?.toLowerCase() === 'reimbursement' ? 'reimbursement' as const : 'advance' as const;
    const withoutFunding = desc.replace(/^\[(ADVANCE|REIMBURSEMENT)\]\s*/, '');
    const parts = withoutFunding.split('\n\n');
    const title = parts[0] || '';
    const justificationIdx = withoutFunding.indexOf('\n\nJustification: ');
    let description = '';
    let justification = '';
    if (justificationIdx >= 0) {
      description = withoutFunding.substring(title.length + 2, justificationIdx);
      justification = withoutFunding.substring(justificationIdx + '\n\nJustification: '.length);
    } else {
      description = parts.slice(1).join('\n\n');
    }
    return { fundingType, title, description, justification };
  };

  const editDefaults = editData ? parseEditDescription(editData.description) : null;
  const isEditMode = !!editData;
  const isResubmit = editData?.status === 'rejected' || editData?.status === 'resubmit';

  const [fundingType, setFundingType] = useState<'advance' | 'reimbursement'>(
    editDefaults?.fundingType || 'advance'
  );
  const [projectId, setProjectId] = useState(editData?.project_id || '');
  const [hubId, setHubId] = useState(editData?.hub_id || currentUser?.hubId || '');

  const initialItem: LineItem = editData ? {
    id: uuidv4(),
    expenseCategory: editData.expense_category || '',
    title: editDefaults?.title || '',
    amount: editData.amount_cents / 100,
    currency: editData.currency || 'SDG',
    description: editDefaults?.description || '',
    justification: editDefaults?.justification || '',
    expenseDate: editData.expense_date || new Date().toISOString().split('T')[0],
    vendor: editData.vendor || '',
    referenceNumber: editData.reference_number || '',
  } : createEmptyItem();

  const [lineItems, setLineItems] = useState<LineItem[]>([initialItem]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set([initialItem.id]));
  const [itemErrors, setItemErrors] = useState<ItemErrors>({});

  const updateLineItem = useCallback((itemId: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
    setItemErrors(prev => {
      if (!prev[itemId]?.[field]) return prev;
      const next = { ...prev };
      const { [field]: _, ...rest } = next[itemId];
      next[itemId] = rest;
      if (Object.keys(next[itemId]).length === 0) delete next[itemId];
      return next;
    });
  }, []);

  const addLineItem = useCallback(() => {
    const newItem = createEmptyItem();
    setLineItems(prev => [...prev, newItem]);
    setExpandedItems(prev => new Set([...prev, newItem.id]));
  }, []);

  const duplicateLineItem = useCallback((sourceItem: LineItem) => {
    const newItem = { ...sourceItem, id: uuidv4(), title: `${sourceItem.title} (copy)` };
    setLineItems(prev => [...prev, newItem]);
    setExpandedItems(prev => new Set([...prev, newItem.id]));
  }, []);

  const removeLineItem = useCallback((itemId: string) => {
    setLineItems(prev => prev.filter(item => item.id !== itemId));
    setExpandedItems(prev => { const next = new Set(prev); next.delete(itemId); return next; });
    setItemErrors(prev => { const next = { ...prev }; delete next[itemId]; return next; });
  }, []);

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }, []);

  const totalAmount = useMemo(() => {
    return lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [lineItems]);

  const totalCurrency = lineItems[0]?.currency || 'SDG';

  const CATEGORY_ORDER = Object.keys(EXPENSE_CATEGORIES);

  const categoryGroups = useMemo(() => {
    const groups: Record<string, { items: LineItem[]; subtotal: number; currency: string }> = {};
    for (const item of lineItems) {
      if (!item.expenseCategory || item.amount <= 0) continue;
      const key = item.expenseCategory;
      if (!groups[key]) {
        groups[key] = { items: [], subtotal: 0, currency: item.currency };
      }
      groups[key].items.push(item);
      groups[key].subtotal += item.amount;
    }
    return groups;
  }, [lineItems]);

  const sortedCategoryEntries = useMemo(() => {
    return Object.entries(categoryGroups).sort(([a], [b]) => {
      const ia = CATEGORY_ORDER.indexOf(a);
      const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [categoryGroups]);

  const hasMultipleCategories = Object.keys(categoryGroups).length > 1;
  const hasDuplicateCategories = Object.values(categoryGroups).some(g => g.items.length > 1);
  const showInvoiceSummary = lineItems.length > 1 && lineItems.some(i => i.amount > 0 && i.expenseCategory);

  const getItemSummary = (item: LineItem) => {
    const cat = item.expenseCategory ? EXPENSE_CATEGORIES[item.expenseCategory as ExpenseCategory] : null;
    const label = cat?.label || 'No category';
    const title = item.title || 'Untitled';
    return { label, title };
  };

  const getItemProgress = (item: LineItem) => {
    let done = 0;
    if (item.expenseCategory) done++;
    if (item.title && item.title.length >= 3) done++;
    if (item.amount > 0) done++;
    if (item.description && item.description.length >= 10) done++;
    if (item.justification && item.justification.length >= 10) done++;
    return done;
  };

  const overallProgress = useMemo(() => {
    const totalFields = lineItems.length * 5;
    const completedFields = lineItems.reduce((sum, item) => sum + getItemProgress(item), 0);
    return totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;
  }, [lineItems]);

  const validateItems = (): boolean => {
    const errors: ItemErrors = {};
    let hasError = false;
    const firstErrorItemId: string | null = null;

    for (const item of lineItems) {
      const itemErr: Record<string, string> = {};
      if (!item.expenseCategory) { itemErr.expenseCategory = 'Select a category'; hasError = true; }
      if (!item.title || item.title.length < 3) { itemErr.title = 'Title required (min 3 chars)'; hasError = true; }
      if (!item.amount || item.amount <= 0) { itemErr.amount = 'Amount must be greater than 0'; hasError = true; }
      if (!item.description || item.description.length < 10) { itemErr.description = 'Description required (min 10 chars)'; hasError = true; }
      if (!item.justification || item.justification.length < 10) { itemErr.justification = 'Justification required (min 10 chars)'; hasError = true; }
      if (Object.keys(itemErr).length > 0) {
        errors[item.id] = itemErr;
      }
    }

    const currencies = new Set(lineItems.map(i => i.currency));
    if (currencies.size > 1) {
      toast({ title: "Mixed Currencies", description: "All items in a submission must use the same currency. Please update items to use a single currency.", variant: "destructive" });
      hasError = true;
    }

    setItemErrors(errors);

    if (hasError) {
      const errorItemIds = Object.keys(errors);
      setExpandedItems(prev => new Set([...prev, ...errorItemIds]));
    }

    return !hasError;
  };

  const onSubmit = async () => {
    if (!currentUser) {
      toast({ title: "Error", description: "You must be logged in to submit a request", variant: "destructive" });
      return;
    }
    if (!currentUser.id) {
      toast({ title: "Error", description: "User session is invalid. Please log out and log back in.", variant: "destructive" });
      return;
    }
    if (fundingType === 'reimbursement' && supportingDocuments.length === 0) {
      toast({ title: "Documents Required", description: "Please upload receipts for reimbursement requests", variant: "destructive" });
      return;
    }
    if (!validateItems()) {
      toast({ title: "Please fix errors", description: "Some items have missing or invalid fields. Check highlighted items.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);

    try {
      const resolvedHubId = hubId && hubId.trim() !== '' ? hubId : (currentUser.hubId || null);
      const resolvedProjectId = projectId && projectId.trim() !== '' ? projectId : null;

      if (isEditMode && editData) {
        const item = lineItems[0];
        const updateData: Record<string, any> = {
          expense_category: item.expenseCategory,
          amount_cents: Math.round(item.amount * 100),
          currency: item.currency,
          description: `[${fundingType.toUpperCase()}] ${item.title}\n\n${item.description}\n\nJustification: ${item.justification}`,
          expense_date: item.expenseDate || new Date().toISOString().split('T')[0],
          vendor: item.vendor && item.vendor.trim() !== '' ? item.vendor : null,
          reference_number: item.referenceNumber && item.referenceNumber.trim() !== '' ? item.referenceNumber : null,
          hub_id: resolvedHubId,
          project_id: resolvedProjectId,
          supporting_documents: supportingDocuments.length > 0 ? supportingDocuments : [],
          updated_at: new Date().toISOString(),
        };

        if (isResubmit) {
          updateData.status = 'pending';
          updateData.tier1_status = 'pending';
          updateData.tier1_approved_by = null;
          updateData.tier1_approved_at = null;
          updateData.tier1_notes = null;
          updateData.tier2_status = 'pending';
          updateData.tier2_approved_by = null;
          updateData.tier2_approved_at = null;
          updateData.tier2_notes = null;
          updateData.rejection_reason = null;
        }

        const { error } = await supabase
          .from('operational_cost_submissions')
          .update(updateData)
          .eq('id', editData.id);

        if (error) {
          console.error('Supabase update error:', error);
          throw new Error(error.message || 'Failed to update submission');
        }

        toast({
          title: isResubmit ? "Resubmitted Successfully" : "Updated Successfully",
          description: isResubmit
            ? `Your request has been updated and resubmitted for approval.`
            : `Your request has been updated.`,
        });
      } else {
        const insertRows = lineItems.map(item => ({
          expense_category: item.expenseCategory,
          amount_cents: Math.round(item.amount * 100),
          currency: item.currency,
          description: `[${fundingType.toUpperCase()}] ${item.title}\n\n${item.description}\n\nJustification: ${item.justification}`,
          expense_date: item.expenseDate || new Date().toISOString().split('T')[0],
          vendor: item.vendor && item.vendor.trim() !== '' ? item.vendor : null,
          reference_number: item.referenceNumber && item.referenceNumber.trim() !== '' ? item.referenceNumber : null,
          hub_id: resolvedHubId,
          project_id: resolvedProjectId,
          supporting_documents: supportingDocuments.length > 0 ? supportingDocuments : [],
          submitted_by: currentUser.id,
          submitter_role: currentUser.role || 'user',
          status: 'pending',
          tier1_status: 'pending',
          tier2_status: 'pending',
        }));

        const { error } = await supabase
          .from('operational_cost_submissions')
          .insert(insertRows)
          .select();

        if (error) {
          console.error('Supabase insert error:', error);
          let userMessage = error.message || 'Database insertion failed';
          if (error.code === '42501' || error.message?.includes('row-level security') || error.message?.includes('policy')) {
            userMessage = 'Your role does not have permission to submit operational costs. Please contact your administrator.';
          } else if (error.code === '42P01' || error.message?.includes('does not exist')) {
            userMessage = 'The operational cost submissions table has not been created yet. Please contact your administrator.';
          } else if (error.code === '23514' || error.message?.includes('check constraint')) {
            userMessage = 'Invalid expense category. Please contact your administrator.';
          }
          throw new Error(userMessage);
        }

        const totalAmt = lineItems.reduce((s, i) => s + i.amount, 0);
        toast({
          title: fundingType === 'advance' ? "Advance Request Submitted" : "Reimbursement Submitted",
          description: lineItems.length === 1
            ? `Your request for ${lineItems[0].currency} ${lineItems[0].amount.toLocaleString()} has been submitted.`
            : `${lineItems.length} items totalling ${totalCurrency} ${totalAmt.toLocaleString()} have been submitted.`,
        });
      }

      const freshItem = createEmptyItem();
      setLineItems([freshItem]);
      setExpandedItems(new Set([freshItem.id]));
      setSupportingDocuments([]);
      setProjectId('');
      setItemErrors({});
      onSuccess?.();
    } catch (error: any) {
      console.error('Error submitting request:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit request. Please try again.",
        variant: "destructive",
        duration: 10000
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-0 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl font-bold">
                  {isResubmit ? 'Edit & Resubmit Request' : isEditMode ? 'Edit Cost Request' : 'Field Cost Request'}
                </h2>
                <p className="text-blue-100 text-xs sm:text-sm">
                  {isResubmit ? 'Update and resubmit your rejected request' : isEditMode ? 'Modify your pending request' : 'Request funds for field operations'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isEditMode && lineItems.length > 1 && (
                <Badge className="bg-white/20 text-white border-white/30">
                  {lineItems.length} items
                </Badge>
              )}
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-xs text-blue-200">Progress</div>
                  <div className="text-lg font-bold">{overallProgress}%</div>
                </div>
                <div className="w-12 h-12 rounded-full border-2 border-white/30 flex items-center justify-center relative">
                  <svg className="absolute inset-0 w-full h-full -rotate-90">
                    <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                    <circle cx="24" cy="24" r="20" fill="none" stroke="white" strokeWidth="3" strokeDasharray={`${overallProgress * 1.26} 126`} strokeLinecap="round" />
                  </svg>
                  {overallProgress === 100 ? (
                    <CheckCircle2 className="h-5 w-5 text-white" />
                  ) : (
                    <span className="text-xs font-bold">{Math.round(overallProgress / 20)}/5</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 space-y-6">
          <div className="flex gap-2 p-1 bg-muted rounded-lg">
            <Button
              type="button"
              variant={fundingType === 'advance' ? 'default' : 'ghost'}
              className={cn("flex-1 gap-2 transition-all", fundingType === 'advance' && "shadow-md")}
              onClick={() => setFundingType('advance')}
              data-testid="button-advance"
            >
              <Wallet className="h-4 w-4" />
              <span className="hidden sm:inline">Advance</span>
              <span className="sm:hidden">Adv</span>
              <span className="text-xs opacity-70 hidden md:inline">- Get funds first</span>
            </Button>
            <Button
              type="button"
              variant={fundingType === 'reimbursement' ? 'default' : 'ghost'}
              className={cn("flex-1 gap-2 transition-all", fundingType === 'reimbursement' && "shadow-md")}
              onClick={() => setFundingType('reimbursement')}
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
            fundingType === 'advance'
              ? "border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30"
              : "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
          )}>
            <Info className={cn("h-4 w-4", fundingType === 'advance' ? "text-blue-600" : "text-green-600")} />
            <AlertDescription className={cn(
              "text-sm",
              fundingType === 'advance' ? "text-blue-700 dark:text-blue-300" : "text-green-700 dark:text-green-300"
            )}>
              {fundingType === 'advance'
                ? "You'll receive funds upfront. Reconcile with receipts after spending."
                : "Attach receipts to get reimbursed for expenses you've already paid."}
            </AlertDescription>
          </Alert>

          {projects.length > 0 && (
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Project (Optional)</Label>
              <Select onValueChange={setProjectId} value={projectId}>
                <SelectTrigger data-testid="select-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
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
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="text-sm font-medium">
                Expense Items {lineItems.length > 1 && <span className="text-muted-foreground">({lineItems.length} items)</span>}
              </Label>
              {!isEditMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addLineItem}
                  className="gap-1.5"
                  data-testid="button-add-item"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Item
                </Button>
              )}
            </div>

            {lineItems.map((item, index) => {
              const isExpanded = expandedItems.has(item.id);
              const hasErrors = !!itemErrors[item.id] && Object.keys(itemErrors[item.id]).length > 0;
              const progress = getItemProgress(item);
              const { label: catLabel } = getItemSummary(item);
              const catInfo = item.expenseCategory ? EXPENSE_CATEGORIES[item.expenseCategory as ExpenseCategory] : null;

              return (
                <Card key={item.id} className={cn("border transition-all", hasErrors && "border-destructive/50")} data-testid={`expense-item-${index}`}>
                  <div
                    className="flex items-center gap-3 p-3 cursor-pointer select-none"
                    onClick={() => toggleExpanded(item.id)}
                    data-testid={`toggle-item-${index}`}
                  >
                    <div className={cn(
                      "flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold shrink-0",
                      progress === 5 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      hasErrors ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {progress === 5 ? <CheckCircle2 className="h-4 w-4" /> : hasErrors ? <AlertCircle className="h-4 w-4" /> : index + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {item.title || `Item ${index + 1}`}
                        </span>
                        {catInfo && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {catInfo.label}
                          </Badge>
                        )}
                      </div>
                      {item.amount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {item.currency} {item.amount.toLocaleString()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!isEditMode && lineItems.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); removeLineItem(item.id); }}
                          data-testid={`remove-item-${index}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                      {!isEditMode && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); duplicateLineItem(item); }}
                          data-testid={`duplicate-item-${index}`}
                        >
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-4 pt-2 border-t space-y-4">
                      <div>
                        <Label className="text-sm font-medium mb-2 block">
                          Expense Category <span className="text-destructive">*</span>
                        </Label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                          {Object.entries(EXPENSE_CATEGORIES).map(([key, { label, icon: Icon, color }]) => (
                            <Button
                              key={key}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-auto py-2.5 px-2 flex-col gap-1 border-2 transition-all",
                                item.expenseCategory === key
                                  ? `bg-gradient-to-br ${color} text-white border-transparent shadow-lg scale-[1.02]`
                                  : "hover-elevate"
                              )}
                              onClick={() => updateLineItem(item.id, 'expenseCategory', key)}
                              data-testid={`category-${key}-${index}`}
                            >
                              <Icon className="h-4 w-4" />
                              <span className="text-[10px] sm:text-xs font-medium text-center leading-tight">{label}</span>
                            </Button>
                          ))}
                        </div>
                        {itemErrors[item.id]?.expenseCategory && (
                          <p className="text-xs text-destructive mt-1.5">{itemErrors[item.id].expenseCategory}</p>
                        )}
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Request Title <span className="text-destructive">*</span></Label>
                        <Input
                          placeholder="e.g., Training materials for workshop"
                          className={cn("mt-1", itemErrors[item.id]?.title && "border-destructive")}
                          value={item.title}
                          onChange={(e) => updateLineItem(item.id, 'title', e.target.value)}
                          data-testid={`input-title-${index}`}
                        />
                        {itemErrors[item.id]?.title && (
                          <p className="text-xs text-destructive mt-1">{itemErrors[item.id].title}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label className="text-sm font-medium">Amount <span className="text-destructive">*</span></Label>
                          <div className="relative mt-1">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="number"
                              placeholder="0"
                              className={cn("pl-9", itemErrors[item.id]?.amount && "border-destructive")}
                              value={item.amount > 0 ? item.amount : ''}
                              onChange={(e) => updateLineItem(item.id, 'amount', parseFloat(e.target.value) || 0)}
                              data-testid={`input-amount-${index}`}
                            />
                          </div>
                          {itemErrors[item.id]?.amount && (
                            <p className="text-xs text-destructive mt-1">{itemErrors[item.id].amount}</p>
                          )}
                        </div>

                        <div>
                          <Label className="text-sm font-medium">Currency</Label>
                          <Select
                            onValueChange={(val) => updateLineItem(item.id, 'currency', val)}
                            value={item.currency}
                          >
                            <SelectTrigger className="mt-1" data-testid={`select-currency-${index}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SDG">SDG</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm font-medium">Date</Label>
                          <div className="relative mt-1">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                            <Input
                              type="date"
                              className="pl-9"
                              value={item.expenseDate}
                              onChange={(e) => updateLineItem(item.id, 'expenseDate', e.target.value)}
                              data-testid={`input-date-${index}`}
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Description <span className="text-destructive">*</span></Label>
                        <Textarea
                          placeholder="What is this expense for? Provide details..."
                          className={cn("min-h-[70px] resize-none mt-1", itemErrors[item.id]?.description && "border-destructive")}
                          value={item.description}
                          onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                          data-testid={`input-description-${index}`}
                        />
                        {itemErrors[item.id]?.description && (
                          <p className="text-xs text-destructive mt-1">{itemErrors[item.id].description}</p>
                        )}
                      </div>

                      <div>
                        <Label className="text-sm font-medium">Justification <span className="text-destructive">*</span></Label>
                        <Textarea
                          placeholder="Why is this expense necessary for field operations?"
                          className={cn("min-h-[70px] resize-none mt-1", itemErrors[item.id]?.justification && "border-destructive")}
                          value={item.justification}
                          onChange={(e) => updateLineItem(item.id, 'justification', e.target.value)}
                          data-testid={`input-justification-${index}`}
                        />
                        {itemErrors[item.id]?.justification && (
                          <p className="text-xs text-destructive mt-1">{itemErrors[item.id].justification}</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium">Vendor/Supplier (Optional)</Label>
                          <div className="relative mt-1">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Vendor name"
                              className="pl-9"
                              value={item.vendor}
                              onChange={(e) => updateLineItem(item.id, 'vendor', e.target.value)}
                              data-testid={`input-vendor-${index}`}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Reference # (Optional)</Label>
                          <div className="relative mt-1">
                            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Invoice/Receipt number"
                              className="pl-9"
                              value={item.referenceNumber}
                              onChange={(e) => updateLineItem(item.id, 'referenceNumber', e.target.value)}
                              data-testid={`input-reference-${index}`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}

            {!isEditMode && (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-dashed"
                onClick={addLineItem}
                data-testid="button-add-item-bottom"
              >
                <Plus className="h-4 w-4" />
                Add Another Expense Item
              </Button>
            )}
          </div>

          {showInvoiceSummary && (
            <div className="rounded-lg border bg-background overflow-hidden" data-testid="invoice-summary">
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 px-4 py-3 border-b">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Payment Request (PR)
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {lineItems.length} line items
                  </Badge>
                </div>
              </div>

              <div className="text-xs">
                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2 border-b bg-muted/40 font-semibold text-muted-foreground">
                  <span>#</span>
                  <span>Description</span>
                  <span className="text-right">Currency</span>
                  <span className="text-right">Amount</span>
                </div>

                {sortedCategoryEntries.map(([catKey, group]) => {
                  const catInfo = EXPENSE_CATEGORIES[catKey as ExpenseCategory];
                  const CatIcon = catInfo?.icon;
                  return (
                    <div key={catKey}>
                      {(hasMultipleCategories || hasDuplicateCategories) && (
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-1.5 bg-muted/20 border-b">
                          <span />
                          <span className="font-semibold text-foreground flex items-center gap-1.5">
                            {CatIcon && <CatIcon className="h-3 w-3" />}
                            {catInfo?.label || catKey}
                          </span>
                          <span />
                          <span />
                        </div>
                      )}
                      {group.items.map((item, idx) => {
                        const globalIdx = lineItems.findIndex(li => li.id === item.id);
                        return (
                          <div key={item.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-2 border-b last:border-b-0" data-testid={`invoice-line-${globalIdx}`}>
                            <span className="text-muted-foreground w-6 text-right">{globalIdx + 1}</span>
                            <div className="min-w-0">
                              <span className="truncate block">{item.title || 'Untitled'}</span>
                              {item.vendor && (
                                <span className="text-[10px] text-muted-foreground truncate block">{item.vendor}</span>
                              )}
                            </div>
                            <span className="text-right text-muted-foreground">{item.currency}</span>
                            <span className="text-right font-medium tabular-nums w-20">{item.amount.toLocaleString()}</span>
                          </div>
                        );
                      })}
                      {group.items.length > 1 && (
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-1.5 border-b bg-muted/30">
                          <span />
                          <span className="text-right font-semibold text-muted-foreground pr-2">Subtotal - {catInfo?.label || catKey}</span>
                          <span className="text-right text-muted-foreground">{group.currency}</span>
                          <span className="text-right font-bold tabular-nums w-20">{group.subtotal.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-t-2 border-blue-200 dark:border-blue-800">
                  <span />
                  <span className="text-right font-bold text-sm pr-2">Grand Total</span>
                  <span className="text-right font-bold text-sm">{totalCurrency}</span>
                  <span className="text-right font-bold text-sm tabular-nums w-20">{totalAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents {fundingType === 'reimbursement' && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
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
          {totalAmount > 0 ? (
            <div className="flex items-center gap-3 p-3 bg-background rounded-lg border">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {lineItems.length > 1 ? `${lineItems.length} items` : 'Total'}
                  {hasDuplicateCategories && ` across ${Object.keys(categoryGroups).length} categories`}
                </div>
                <div className="font-bold text-lg">{totalCurrency} {totalAmount.toLocaleString()}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Fill in required fields to submit
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {isEditMode && onCancelEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancelEdit}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting || overallProgress < 100}
              className="gap-2"
              data-testid="button-submit-request"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {isEditMode ? 'Saving...' : `Submitting ${lineItems.length > 1 ? lineItems.length + ' items' : ''}...`}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {isResubmit ? 'Resubmit Request' : isEditMode ? 'Save Changes' : lineItems.length > 1 ? `Submit ${lineItems.length} Items` : 'Submit Request'}
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
