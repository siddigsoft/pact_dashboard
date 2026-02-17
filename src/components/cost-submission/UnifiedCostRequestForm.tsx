import { useState, useMemo, useCallback, useEffect, useRef } from "react";
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
  Copy,
  Save,
  RotateCcw,
  Clock
} from "lucide-react";
import { SupportingDocument } from "@/types/cost-submission";
import CostDocumentUpload from "./CostDocumentUpload";
import ExcelUploadParser from "./ExcelUploadParser";
import { useAppContext } from "@/context/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import { EmailNotificationService } from "@/services/email-notification.service";

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
  otherCategoryDetail: string;
  title: string;
  quantity: number;
  unitCost: number;
  amount: number;
  currency: string;
  description: string;
  justification: string;
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

const DRAFT_STORAGE_KEY = 'pact_cost_submission_draft';
const AUTO_SAVE_INTERVAL_MS = 30000;

interface DraftData {
  fundingType: 'advance' | 'reimbursement';
  projectId: string;
  hubId: string;
  requestDate: string;
  requestTitle: string;
  lineItems: LineItem[];
  supportingDocuments: SupportingDocument[];
  savedAt: string;
}

function saveDraft(userId: string, data: Omit<DraftData, 'savedAt'>): void {
  try {
    const draft: DraftData = { ...data, savedAt: new Date().toISOString() };
    localStorage.setItem(`${DRAFT_STORAGE_KEY}_${userId}`, JSON.stringify(draft));
  } catch { /* quota exceeded or private browsing */ }
}

function loadDraft(userId: string): DraftData | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_STORAGE_KEY}_${userId}`);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftData;
    if (!draft.lineItems || !Array.isArray(draft.lineItems) || draft.lineItems.length === 0) return null;
    const savedDate = new Date(draft.savedAt);
    const daysSince = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 7) {
      localStorage.removeItem(`${DRAFT_STORAGE_KEY}_${userId}`);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function clearDraft(userId: string): void {
  try { localStorage.removeItem(`${DRAFT_STORAGE_KEY}_${userId}`); } catch { /* ignore */ }
}

function createEmptyItem(): LineItem {
  return {
    id: uuidv4(),
    expenseCategory: '',
    otherCategoryDetail: '',
    title: '',
    quantity: 1,
    unitCost: 0,
    amount: 0,
    currency: 'SDG',
    description: '',
    justification: '',
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
    if (!desc) return { fundingType: 'advance' as const, title: '', description: '', justification: '', requestTitle: '', otherCategoryDetail: '' };
    const fundingMatch = desc.match(/^\[(ADVANCE|REIMBURSEMENT)\]\s*/);
    const fundingType = fundingMatch?.[1]?.toLowerCase() === 'reimbursement' ? 'reimbursement' as const : 'advance' as const;
    const withoutFunding = desc.replace(/^\[(ADVANCE|REIMBURSEMENT)\]\s*/, '');
    const requestTitleMatch = withoutFunding.match(/^<<(.+?)>>\n*/);
    const requestTitle = requestTitleMatch?.[1] || '';
    const withoutReqTitle = withoutFunding.replace(/^<<.+?>>\n*/, '');
    const parts = withoutReqTitle.split('\n\n');
    const title = parts[0] || '';
    const otherCatMatch = withoutReqTitle.match(/\n\nOther Category: (.+?)(?:\n\n|$)/);
    const otherCategoryDetail = otherCatMatch?.[1] || '';
    const cleanedBody = withoutReqTitle.replace(/\n\nOther Category: .+?(?=\n\n|$)/, '');
    const justificationIdx = cleanedBody.indexOf('\n\nJustification: ');
    let description = '';
    let justification = '';
    if (justificationIdx >= 0) {
      description = cleanedBody.substring(title.length + 2, justificationIdx);
      justification = cleanedBody.substring(justificationIdx + '\n\nJustification: '.length);
    } else {
      const cleanedParts = cleanedBody.split('\n\n');
      description = cleanedParts.slice(1).join('\n\n');
    }
    return { fundingType, title, description, justification, requestTitle, otherCategoryDetail };
  };

  const editDefaults = editData ? parseEditDescription(editData.description) : null;
  const isEditMode = !!editData;
  const isResubmit = editData?.status === 'rejected' || editData?.status === 'resubmit';

  const [fundingType, setFundingType] = useState<'advance' | 'reimbursement'>(
    editDefaults?.fundingType || 'advance'
  );
  const [projectId, setProjectId] = useState(editData?.project_id || '');
  const [hubId, setHubId] = useState(editData?.hub_id || currentUser?.hubId || '');
  const [requestDate, setRequestDate] = useState(editData?.expense_date || new Date().toISOString().split('T')[0]);
  const [requestTitle, setRequestTitle] = useState(editDefaults?.requestTitle || '');

  const initialItem: LineItem = editData ? {
    id: uuidv4(),
    expenseCategory: editData.expense_category || '',
    otherCategoryDetail: editDefaults?.otherCategoryDetail || '',
    title: editDefaults?.title || '',
    quantity: 1,
    unitCost: editData.amount_cents / 100,
    amount: editData.amount_cents / 100,
    currency: editData.currency || 'SDG',
    description: editDefaults?.description || '',
    justification: editDefaults?.justification || '',
    vendor: editData.vendor || '',
    referenceNumber: editData.reference_number || '',
  } : createEmptyItem();

  const [lineItems, setLineItems] = useState<LineItem[]>([initialItem]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set([initialItem.id]));
  const [itemErrors, setItemErrors] = useState<ItemErrors>({});
  const [draftBanner, setDraftBanner] = useState<DraftData | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const draftInitialized = useRef(false);

  useEffect(() => {
    if (isEditMode || draftInitialized.current || !currentUser?.id) return;
    draftInitialized.current = true;
    const existing = loadDraft(currentUser.id);
    if (existing) {
      setDraftBanner(existing);
    }
  }, [currentUser?.id, isEditMode]);

  const restoreDraft = useCallback(() => {
    if (!draftBanner) return;
    setFundingType(draftBanner.fundingType);
    setProjectId(draftBanner.projectId || '');
    setHubId(draftBanner.hubId || '');
    setRequestDate(draftBanner.requestDate || new Date().toISOString().split('T')[0]);
    setRequestTitle(draftBanner.requestTitle || '');
    setLineItems(draftBanner.lineItems);
    setExpandedItems(new Set([draftBanner.lineItems[0]?.id].filter(Boolean)));
    setSupportingDocuments(draftBanner.supportingDocuments || []);
    setLastSavedAt(draftBanner.savedAt);
    setDraftBanner(null);
    toast({ title: "Draft Restored", description: "Your saved draft has been loaded." });
  }, [draftBanner, toast]);

  const dismissDraft = useCallback(() => {
    if (currentUser?.id) clearDraft(currentUser.id);
    setDraftBanner(null);
  }, [currentUser?.id]);

  const handleSaveDraft = useCallback(() => {
    if (!currentUser?.id) return;
    setIsSavingDraft(true);
    saveDraft(currentUser.id, { fundingType, projectId, hubId, requestDate, requestTitle, lineItems, supportingDocuments });
    setLastSavedAt(new Date().toISOString());
    setTimeout(() => setIsSavingDraft(false), 600);
    toast({ title: "Draft Saved", description: "Your work has been saved. You can close this page and come back later." });
  }, [currentUser?.id, fundingType, projectId, hubId, requestDate, requestTitle, lineItems, supportingDocuments, toast]);

  useEffect(() => {
    if (isEditMode || !currentUser?.id) return;
    const hasContent = lineItems.some(i => i.expenseCategory || i.title || i.unitCost > 0 || i.description);
    if (!hasContent) return;
    const timer = setInterval(() => {
      saveDraft(currentUser.id, { fundingType, projectId, hubId, requestDate, requestTitle, lineItems, supportingDocuments });
      setLastSavedAt(new Date().toISOString());
    }, AUTO_SAVE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isEditMode, currentUser?.id, fundingType, projectId, hubId, requestDate, requestTitle, lineItems, supportingDocuments]);

  const updateLineItem = useCallback((itemId: string, field: keyof LineItem, value: any) => {
    setLineItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unitCost') {
        const qty = field === 'quantity' ? (value as number) : item.quantity;
        const cost = field === 'unitCost' ? (value as number) : item.unitCost;
        updated.amount = Math.round((qty * cost) * 100) / 100;
      }
      return updated;
    }));
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
    const label = item.expenseCategory === 'other' && item.otherCategoryDetail
      ? `Other: ${item.otherCategoryDetail}`
      : (cat?.label || 'No category');
    const title = item.title || 'Untitled';
    return { label, title };
  };

  const handleExcelItems = useCallback((importedItems: LineItem[]) => {
    if (importedItems.length === 0) return;
    const hasOnlyEmpty = lineItems.length === 1 && !lineItems[0].expenseCategory && !lineItems[0].title && lineItems[0].unitCost === 0;
    if (hasOnlyEmpty) {
      setLineItems(importedItems);
      setExpandedItems(new Set([importedItems[0].id]));
    } else {
      setLineItems(prev => [...prev, ...importedItems]);
      setExpandedItems(prev => new Set([...prev, importedItems[0].id]));
    }
  }, [lineItems]);

  const getItemProgress = (item: LineItem) => {
    let done = 0;
    if (item.expenseCategory) done++;
    if (item.title && item.title.length >= 3) done++;
    if (item.unitCost > 0) done++;
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
      if (item.expenseCategory === 'other' && (!item.otherCategoryDetail || item.otherCategoryDetail.trim().length < 3)) { itemErr.otherCategoryDetail = 'Please specify the expense type (min 3 chars)'; hasError = true; }
      if (!item.title || item.title.length < 3) { itemErr.title = 'Title required (min 3 chars)'; hasError = true; }
      if (!item.quantity || item.quantity <= 0) { itemErr.quantity = 'Quantity must be at least 1'; hasError = true; }
      if (!item.unitCost || item.unitCost <= 0) { itemErr.unitCost = 'Unit cost must be greater than 0'; hasError = true; }
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
    if (projects.length > 0 && !projectId) {
      toast({ title: "Project Required", description: "Please select a project for this request.", variant: "destructive" });
      return;
    }
    if (!requestDate) {
      toast({ title: "Date Required", description: "Please select a date for this request.", variant: "destructive" });
      return;
    }
    if (!requestTitle || requestTitle.trim().length < 3) {
      toast({ title: "Title Required", description: "Please enter a request title (at least 3 characters).", variant: "destructive" });
      return;
    }
    if (fundingType === 'reimbursement' && supportingDocuments.length === 0) {
      toast({ title: "Documents Required", description: "Please upload receipts for reimbursement requests", variant: "destructive" });
      return;
    }
    if (!validateItems()) {
      const missingFields: string[] = [];
      for (const item of lineItems) {
        if (!item.expenseCategory) missingFields.push('Expense Category');
        if (!item.title || item.title.length < 3) missingFields.push('Item Title');
        if (!item.unitCost || item.unitCost <= 0) missingFields.push('Unit Cost');
        if (!item.description || item.description.length < 10) missingFields.push('Description (min 10 chars)');
        if (!item.justification || item.justification.length < 10) missingFields.push('Justification (min 10 chars)');
      }
      const unique = [...new Set(missingFields)];
      toast({ title: "Missing Required Fields", description: unique.length > 0 ? `Please fill in: ${unique.join(', ')}` : "Some items have invalid fields. Check highlighted items.", variant: "destructive" });
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
          amount_cents: Math.round(item.amount * 100).toString(),
          currency: item.currency,
          description: `[${fundingType.toUpperCase()}] <<${requestTitle.trim()}>>\n${item.title}${item.expenseCategory === 'other' && item.otherCategoryDetail ? `\n\nOther Category: ${item.otherCategoryDetail.trim()}` : ''}\n\n${item.description}\n\nJustification: ${item.justification}`,
          expense_date: requestDate || new Date().toISOString().split('T')[0],
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

        if (isResubmit) {
          const selectedProject = projects.find(p => p.id === resolvedProjectId);
          const projectLabel = selectedProject?.name || 'N/A';
          const resubmitAmt = lineItems.reduce((s, i) => s + i.amount, 0);
          const catKey = lineItems[0]?.expenseCategory as keyof typeof EXPENSE_CATEGORIES;
          const catLabel = EXPENSE_CATEGORIES[catKey]?.label || lineItems[0]?.expenseCategory || 'N/A';

          EmailNotificationService.sendCostSubmissionToSuperAdmins(
            currentUser.fullName || currentUser.email || 'Unknown User',
            currentUser.email || '',
            `[Resubmitted] ${requestTitle.trim() || 'Untitled Request'}`,
            catLabel,
            resubmitAmt,
            lineItems.length,
            fundingType,
            projectLabel,
            lineItems[0]?.currency || 'SDG'
          ).then(result => {
            if (result.success) {
              console.log('[COST] Email notification sent to super admins for resubmitted cost');
            }
          }).catch(err => {
            console.error('[COST] Error sending resubmit email notification:', err);
          });
        }
      } else {
        const groupId = lineItems.length > 1 ? uuidv4() : null;
        const insertRows = lineItems.map(item => ({
          expense_category: item.expenseCategory,
          amount_cents: Math.round(item.amount * 100).toString(),
          currency: item.currency,
          description: `[${fundingType.toUpperCase()}] <<${requestTitle.trim()}>>\n${item.title}${item.expenseCategory === 'other' && item.otherCategoryDetail ? `\n\nOther Category: ${item.otherCategoryDetail.trim()}` : ''}\n\n${item.description}\n\nJustification: ${item.justification}`,
          expense_date: requestDate || new Date().toISOString().split('T')[0],
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
          request_group_id: groupId,
          request_title: requestTitle.trim() || null,
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

        const selectedProject = projects.find(p => p.id === resolvedProjectId);
        const projectLabel = selectedProject?.name || 'N/A';
        const categoryLabels = lineItems.map(i => {
          const catKey = i.expenseCategory as keyof typeof EXPENSE_CATEGORIES;
          return EXPENSE_CATEGORIES[catKey]?.label || i.expenseCategory;
        }).join(', ');

        EmailNotificationService.sendCostSubmissionToSuperAdmins(
          currentUser.fullName || currentUser.email || 'Unknown User',
          currentUser.email || '',
          requestTitle.trim() || 'Untitled Request',
          categoryLabels,
          totalAmt,
          lineItems.length,
          fundingType,
          projectLabel,
          totalCurrency
        ).then(result => {
          if (result.success) {
            console.log('[COST] Email notification sent to super admins for cost submission');
            toast({
              title: "Notification Sent",
              description: "Super Admin has been notified about your submission via email.",
            });
          } else {
            console.warn('[COST] Failed to send email notification to super admins:', result.error);
          }
        }).catch(err => {
          console.error('[COST] Error sending email notification:', err);
        });
      }

      if (currentUser?.id) clearDraft(currentUser.id);
      setLastSavedAt(null);
      const freshItem = createEmptyItem();
      setLineItems([freshItem]);
      setExpandedItems(new Set([freshItem.id]));
      setSupportingDocuments([]);
      setProjectId('');
      setRequestTitle('');
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
          {draftBanner && !isEditMode && (
            <Alert className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
              <Clock className="h-4 w-4 text-amber-600" />
              <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-medium text-amber-800 dark:text-amber-200">You have a saved draft</span>
                  <span className="text-xs text-amber-600 dark:text-amber-400 ml-2">
                    saved {new Date(draftBanner.savedAt).toLocaleString()} — {draftBanner.lineItems.length} item{draftBanner.lineItems.length !== 1 ? 's' : ''}
                    {draftBanner.requestTitle ? ` — "${draftBanner.requestTitle}"` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={dismissDraft} data-testid="button-dismiss-draft">
                    Discard
                  </Button>
                  <Button type="button" size="sm" onClick={restoreDraft} className="gap-1" data-testid="button-restore-draft">
                    <RotateCcw className="h-3 w-3" />
                    Restore Draft
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {projects.length > 0 && (
              <div>
                <Label className="text-sm font-medium mb-1.5 block">
                  Project <span className="text-destructive">*</span>
                </Label>
                <Select onValueChange={setProjectId} value={projectId}>
                  <SelectTrigger data-testid="select-project" className={cn(!projectId && "border-destructive/50")}>
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
            <div>
              <Label className="text-sm font-medium mb-1.5 block">
                Request Date <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="date"
                  className={cn("pl-9", !requestDate && "border-destructive/50")}
                  value={requestDate}
                  onChange={(e) => setRequestDate(e.target.value)}
                  data-testid="input-request-date"
                />
              </div>
            </div>
          </div>

          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Request Title <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="e.g. March Field Operations - Khartoum Hub"
                className={cn("pl-9", !requestTitle && "border-destructive/50")}
                value={requestTitle}
                onChange={(e) => setRequestTitle(e.target.value)}
                data-testid="input-request-title"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">A brief title describing this payment request</p>
          </div>

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
                            {catLabel}
                          </Badge>
                        )}
                      </div>
                      {item.amount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {item.quantity > 1 ? `${item.quantity} x ${item.unitCost.toLocaleString()} = ` : ''}{item.currency} {item.amount.toLocaleString()}
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
                        {item.expenseCategory === 'other' && (
                          <div className="mt-3">
                            <Label className="text-sm font-medium">
                              Please specify <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              placeholder="e.g., Office rent, Insurance, Legal fees..."
                              className={cn("mt-1", itemErrors[item.id]?.otherCategoryDetail && "border-destructive")}
                              value={item.otherCategoryDetail}
                              onChange={(e) => updateLineItem(item.id, 'otherCategoryDetail', e.target.value)}
                              data-testid={`input-other-detail-${index}`}
                            />
                            {itemErrors[item.id]?.otherCategoryDetail && (
                              <p className="text-xs text-destructive mt-1">{itemErrors[item.id].otherCategoryDetail}</p>
                            )}
                          </div>
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

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <Label className="text-sm font-medium">Quantity <span className="text-destructive">*</span></Label>
                          <Input
                            type="number"
                            min="1"
                            placeholder="1"
                            className={cn("mt-1", itemErrors[item.id]?.quantity && "border-destructive")}
                            value={item.quantity > 0 ? item.quantity : ''}
                            onChange={(e) => updateLineItem(item.id, 'quantity', parseInt(e.target.value) || 0)}
                            data-testid={`input-quantity-${index}`}
                          />
                          {itemErrors[item.id]?.quantity && (
                            <p className="text-xs text-destructive mt-1">{itemErrors[item.id].quantity}</p>
                          )}
                        </div>

                        <div>
                          <Label className="text-sm font-medium">Unit Cost <span className="text-destructive">*</span></Label>
                          <div className="relative mt-1">
                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="number"
                              placeholder="0"
                              className={cn("pl-9", itemErrors[item.id]?.unitCost && "border-destructive")}
                              value={item.unitCost > 0 ? item.unitCost : ''}
                              onChange={(e) => updateLineItem(item.id, 'unitCost', parseFloat(e.target.value) || 0)}
                              data-testid={`input-unitcost-${index}`}
                            />
                          </div>
                          {itemErrors[item.id]?.unitCost && (
                            <p className="text-xs text-destructive mt-1">{itemErrors[item.id].unitCost}</p>
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
                          <Label className="text-sm font-medium">Total</Label>
                          <div className="mt-1 flex items-center h-9 px-3 rounded-md border bg-muted/50 text-sm font-semibold tabular-nums" data-testid={`text-item-total-${index}`}>
                            {item.currency} {item.amount.toLocaleString()}
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
              <div className="space-y-2">
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

                <div className="flex items-center gap-3">
                  <div className="flex-1 border-t border-dashed" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 border-t border-dashed" />
                </div>

                <ExcelUploadParser onItemsParsed={handleExcelItems} />
              </div>
            )}
          </div>

          {showInvoiceSummary && (() => {
            const reqDateObj = requestDate ? new Date(requestDate + 'T00:00:00') : new Date();
            const dateStr = `${String(reqDateObj.getDate()).padStart(2, '0')}${String(reqDateObj.getMonth() + 1).padStart(2, '0')}${reqDateObj.getFullYear()}`;
            const selectedProject = projects.find(p => p.id === projectId);
            const projectAbbr = selectedProject ? selectedProject.name.split(/[\s-]+/).map(w => w[0]?.toUpperCase()).join('').slice(0, 4) : 'GEN';
            const requestNumber = `PR-${projectAbbr}-${dateStr}-${String(lineItems.length).padStart(3, '0')}`;

            return (
            <div className="rounded-lg border bg-background overflow-hidden" data-testid="invoice-summary">
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 px-4 py-3 border-b">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Payment Request Summary (PR)
                  </h3>
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {requestNumber}
                  </Badge>
                </div>
                {requestTitle && (
                  <p className="text-xs text-muted-foreground mt-1 font-medium">{requestTitle}</p>
                )}
              </div>

              <div className="text-xs">
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-4 py-2 border-b bg-muted/40 font-semibold text-muted-foreground">
                  <span>#</span>
                  <span>Details</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit Cost</span>
                  <span className="text-right">Cur.</span>
                  <span className="text-right w-20">Total</span>
                </div>

                {sortedCategoryEntries.map(([catKey, group]) => {
                  const catInfo = EXPENSE_CATEGORIES[catKey as ExpenseCategory];
                  const CatIcon = catInfo?.icon;
                  return (
                    <div key={catKey}>
                      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-4 py-1.5 bg-muted/20 border-b">
                        <span />
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          {CatIcon && <CatIcon className="h-3 w-3" />}
                          {catKey === 'other' && group.items[0]?.otherCategoryDetail
                            ? `Other: ${group.items[0].otherCategoryDetail}`
                            : (catInfo?.label || catKey)}
                        </span>
                        <span />
                        <span />
                        <span />
                        <span />
                      </div>
                      {group.items.map((item) => {
                        const globalIdx = lineItems.findIndex(li => li.id === item.id);
                        return (
                          <div key={item.id} className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-4 py-2 border-b last:border-b-0" data-testid={`invoice-line-${globalIdx}`}>
                            <span className="text-muted-foreground w-6 text-right">{globalIdx + 1}</span>
                            <div className="min-w-0">
                              <span className="truncate block">{item.title || 'Untitled'}</span>
                              {item.vendor && (
                                <span className="text-[10px] text-muted-foreground truncate block">{item.vendor}</span>
                              )}
                            </div>
                            <span className="text-right tabular-nums">{item.quantity}</span>
                            <span className="text-right tabular-nums">{item.unitCost.toLocaleString()}</span>
                            <span className="text-right text-muted-foreground">{item.currency}</span>
                            <span className="text-right font-medium tabular-nums w-20">{item.amount.toLocaleString()}</span>
                          </div>
                        );
                      })}
                      <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-4 py-1.5 border-b bg-muted/30">
                        <span />
                        <span className="text-right font-semibold text-muted-foreground pr-2">Subtotal - {catInfo?.label || catKey}</span>
                        <span />
                        <span />
                        <span className="text-right text-muted-foreground">{group.currency}</span>
                        <span className="text-right font-bold tabular-nums w-20">{group.subtotal.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}

                <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-t-2 border-blue-200 dark:border-blue-800">
                  <span />
                  <span className="text-right font-bold text-sm pr-2">Grand Total</span>
                  <span />
                  <span />
                  <span className="text-right font-bold text-sm">{totalCurrency}</span>
                  <span className="text-right font-bold text-sm tabular-nums w-20">{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              <div className="px-4 py-3 border-t bg-muted/20">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold">Request Summary</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                  <div>
                    <span className="text-muted-foreground">Request No.</span>
                    <p className="font-mono font-medium" data-testid="text-request-number">{requestNumber}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date</span>
                    <p className="font-medium">{reqDateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Title</span>
                    <p className="font-medium truncate">{requestTitle || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Project</span>
                    <p className="font-medium">{selectedProject?.name || 'General'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Items</span>
                    <p className="font-medium">{lineItems.length} line item{lineItems.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Attachments</span>
                    <p className="font-medium">{supportingDocuments.length} file{supportingDocuments.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Categories</span>
                    <p className="font-medium">{Object.keys(categoryGroups).length} categor{Object.keys(categoryGroups).length !== 1 ? 'ies' : 'y'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total</span>
                    <p className="font-bold">{totalCurrency} {totalAmount.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
            );
          })()}

          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Attachments {fundingType === 'reimbursement' && <Badge variant="destructive" className="text-[10px]">Required</Badge>}
              </h3>
              <span className="text-xs text-muted-foreground">
                {supportingDocuments.length} file{supportingDocuments.length !== 1 ? 's' : ''} attached — upload as many as needed
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
            {lastSavedAt && !isEditMode && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Save className="h-3 w-3" />
                Auto-saved {new Date(lastSavedAt).toLocaleTimeString()}
              </span>
            )}
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
            {!isEditMode && (
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={isSavingDraft}
                className="gap-2"
                data-testid="button-save-draft"
              >
                {isSavingDraft ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Draft
              </Button>
            )}
            <Button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
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
