# Transportation & Cost Submission Workflow Analysis

## Current Workflow (As-Built)

### Stage 1: MMP Upload & Verification
```
1. Upload MMP file → 2. Validate format → 3. Verify permits → 
4. Verify cooperating partners → 5. Approve MMP
```

### Stage 2: Site Dispatch (CURRENT - No Cost Records Created)
```
Location: src/components/mmp/DispatchSitesDialog.tsx (lines 218-235)

Process:
1. Admin selects sites to dispatch
2. System calculates fees for notification display:
   - enumerator_fee = 20 SDG (from additional_data)
   - transport_fee = 10 SDG (from additional_data)
   - total_cost = enumerator_fee + transport_fee
3. Sends notification to collectors showing fees
4. Updates mmp_site_entries to status='Dispatched'
5. ❌ NO DATABASE RECORD CREATED IN site_visit_costs table
6. ❌ Fees only shown in notification, not persisted
```

**Key Code:**
```typescript
const enumeratorFee = siteEntry.enumerator_fee || additionalData.enumerator_fee || 20;
const transportFee = siteEntry.transport_fee || additionalData.transport_fee || 10;
const totalCost = siteEntry.cost || (enumeratorFee + transportFee);

// Notification shows fees but doesn't create cost record
notificationRows.push({
  message: `Fee: ${totalCost} SDG (Enumerator: ${enumeratorFee} SDG, Transport: ${transportFee} SDG)`
});
```

### Stage 3: Site Visit Completion
```
1. Data collector completes site visit
2. Site visit status = 'completed'
3. ❌ Still no cost records exist
```

### Stage 4: Cost Submission (AFTER Completion)
```
Location: src/pages/CostSubmission.tsx
Table: site_visit_cost_submissions

Process:
1. Data collector navigates to Cost Submission page
2. Selects completed site visit
3. Manually enters ACTUAL costs:
   - transportation_cost_cents
   - accommodation_cost_cents
   - meal_allowance_cents
   - other_costs_cents
4. Uploads supporting documents
5. Submits → status='pending'
```

### Stage 5: Admin Review & Approval
```
Location: src/context/costApproval/supabase.ts (reviewCostSubmission)

Process:
1. Admin reviews cost submission
2. Admin can:
   - Approve (status='approved')
   - Reject (status='rejected')
   - Request Revision (status='under_review')
   - Adjust Amount (paid_amount_cents ≠ total_cost_cents)
3. If approved → Creates wallet_transaction
4. Updates status='paid'
```

---

## Your Requested Workflow (Should-Be)

### Stage 1: MMP Upload & Verification (SAME)
```
1. Upload MMP file → 2. Validate format → 3. Verify permits → 
4. Verify cooperating partners → 5. Approve MMP
```

### Stage 2: Pre-Dispatch Costing (NEW - BEFORE DISPATCH)
```
Location: DispatchSitesDialog.tsx (needs enhancement)
Table: site_visit_costs (not site_visit_cost_submissions!)

Process:
1. Admin selects sites to dispatch
2. ✅ Admin CALCULATES transportation costs for EACH site
3. ✅ Admin enters ESTIMATED costs:
   - Transportation cost (REQUIRED before dispatch)
   - Optional: Accommodation estimate
   - Optional: Meal allowance estimate
4. ✅ System CREATES site_visit_costs record with status='estimated'
5. ✅ These costs are NOW IN DATABASE (not just notifications)
6. Site dispatched with cost record attached
```

**Proposed UI Flow:**
```
┌─────────────────────────────────────────────┐
│ Dispatch Sites Dialog                       │
├─────────────────────────────────────────────┤
│                                             │
│ Selected Sites: 5 sites                     │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Site 1: Al-Fashir Health Center         │ │
│ │                                         │ │
│ │ Transportation Cost: [___] SDG          │ │
│ │ Distance: 45 km                         │ │
│ │ Suggested: 50 SDG                       │ │
│ │                                         │ │
│ │ Optional Estimates:                     │ │
│ │ └─ Accommodation: [___] SDG             │ │
│ │ └─ Meals: [___] SDG                     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ Site 2: Nyala Water Station             │ │
│ │ Transportation Cost: [___] SDG          │ │
│ │ ...                                     │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [Calculate All] [Dispatch Sites]            │
└─────────────────────────────────────────────┘
```

### Stage 3: Site Visit Completion (SAME)
```
1. Data collector completes site visit
2. Site visit status = 'completed'
3. ✅ Estimated costs already exist in site_visit_costs table
```

### Stage 4: Actual Cost Submission (AFTER Completion)
```
Location: CostSubmission.tsx (enhanced)
Table: site_visit_cost_submissions

Process:
1. Data collector navigates to Cost Submission page
2. Selects completed site visit
3. ✅ System SHOWS estimated costs from site_visit_costs
4. Data collector enters ACTUAL costs:
   - Actual transportation (compare with estimate)
   - Accommodation (if not estimated)
   - Meals (if not estimated)
   - ✅ NEW EXPENSE TYPES (see below)
5. System calculates variance: actual - estimated
6. Submits → status='pending'
```

**Enhanced Expense Types:**
```typescript
// CURRENT (4 types)
transportation_cost_cents
accommodation_cost_cents
meal_allowance_cents
other_costs_cents

// PROPOSED (Configurable expense types)
expense_items: [
  { category: 'transportation', amount_cents: 5000, description: 'Taxi to site' },
  { category: 'accommodation', amount_cents: 3000, description: '1 night hotel' },
  { category: 'meals', amount_cents: 1500, description: 'Lunch + dinner' },
  { category: 'communication', amount_cents: 500, description: 'Mobile data' },
  { category: 'supplies', amount_cents: 2000, description: 'Forms + pens' },
  { category: 'local_guide', amount_cents: 1000, description: 'Community guide' },
  { category: 'other', amount_cents: 800, description: 'Photocopies' }
]
```

### Stage 5: Admin Review & Costing (ENHANCED)
```
Location: Cost approval page (enhanced)

Process:
1. Admin reviews cost submission
2. ✅ Admin sees:
   - Estimated costs (from dispatch)
   - Actual costs (from submission)
   - Variance analysis
3. ✅ Admin can ADD MORE EXPENSE TYPES:
   - Click "Add Expense Type"
   - Select category: Transportation | Accommodation | Equipment | etc.
   - Enter amount and justification
   - These appear as "admin_added_expenses"
4. Admin approves/rejects
5. Final payment = approved expenses (including admin additions)
```

**Proposed Approval UI:**
```
┌─────────────────────────────────────────────────┐
│ Cost Submission Review                          │
├─────────────────────────────────────────────────┤
│                                                 │
│ Site: Al-Fashir Health Center                   │
│ Submitted by: Ahmed Mohammed                    │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ ESTIMATED (at dispatch) vs ACTUAL (submitted)│ │
│ ├─────────────────────────────────────────────┤ │
│ │ Transportation:   50 SDG  →  65 SDG (+15)   │ │
│ │ Accommodation:     0 SDG  →  30 SDG (+30)   │ │
│ │ Meals:             0 SDG  →  15 SDG (+15)   │ │
│ │ ─────────────────────────────────────────   │ │
│ │ Subtotal:         50 SDG  → 110 SDG (+60)   │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ ADMIN ADJUSTMENTS (during approval)         │ │
│ ├─────────────────────────────────────────────┤ │
│ │ [+ Add Expense Type]                        │ │
│ │                                             │ │
│ │ • Equipment rental: 20 SDG                  │ │
│ │   (GPS device for coordinates) [Remove]     │ │
│ │                                             │ │
│ │ • Local guide fee: 10 SDG                   │ │
│ │   (Security requirement) [Remove]           │ │
│ └─────────────────────────────────────────────┘ │
│                                                 │
│ FINAL APPROVED AMOUNT: 140 SDG                  │
│                                                 │
│ [Approve] [Request Revision] [Reject]           │
└─────────────────────────────────────────────────┘
```

---

## Database Schema Changes Required

### 1. site_visit_costs Table (ESTIMATED costs - at dispatch)
```sql
-- This table stores ESTIMATED costs calculated BEFORE dispatch
-- Currently exists but not used during dispatch

CREATE TABLE site_visit_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id UUID REFERENCES site_visits(id),
  
  -- Estimated costs (entered at dispatch time)
  transportation_cost NUMERIC(12,2) DEFAULT 0,
  accommodation_cost NUMERIC(12,2) DEFAULT 0,
  meal_allowance NUMERIC(12,2) DEFAULT 0,
  other_costs NUMERIC(12,2) DEFAULT 0,
  total_cost NUMERIC(12,2) DEFAULT 0,
  
  currency TEXT DEFAULT 'SDG',
  cost_status TEXT DEFAULT 'estimated', -- NEW: 'estimated' | 'finalized'
  
  assigned_by UUID REFERENCES profiles(id),
  adjusted_by UUID REFERENCES profiles(id),
  adjustment_reason TEXT,
  cost_notes TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. site_visit_cost_submissions Table (ACTUAL costs - after completion)
```sql
-- This table stores ACTUAL costs submitted by data collectors
-- ENHANCE to support flexible expense types

CREATE TABLE site_visit_cost_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_visit_id UUID REFERENCES site_visits(id),
  mmp_file_id UUID,
  project_id UUID,
  
  submitted_by UUID REFERENCES profiles(id),
  submitted_at TIMESTAMP DEFAULT NOW(),
  
  -- Core cost fields (backward compatible)
  transportation_cost_cents BIGINT DEFAULT 0,
  accommodation_cost_cents BIGINT DEFAULT 0,
  meal_allowance_cents BIGINT DEFAULT 0,
  other_costs_cents BIGINT DEFAULT 0,
  total_cost_cents BIGINT DEFAULT 0,
  
  -- NEW: Flexible expense items (JSON array)
  expense_items JSONB DEFAULT '[]', -- [{category, amount_cents, description, added_by}]
  
  -- NEW: Reference to estimated costs
  estimated_cost_id UUID REFERENCES site_visit_costs(id),
  variance_cents BIGINT, -- actual - estimated
  
  currency TEXT DEFAULT 'SDG',
  status TEXT DEFAULT 'pending',
  
  -- Details and documentation
  transportation_details TEXT,
  accommodation_details TEXT,
  meal_details TEXT,
  other_details TEXT,
  submission_notes TEXT,
  supporting_documents JSONB DEFAULT '[]',
  
  -- Review fields
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP,
  reviewer_notes TEXT,
  approval_notes TEXT,
  
  -- Payment fields
  paid_amount_cents BIGINT,
  payment_notes TEXT,
  wallet_transaction_id UUID,
  paid_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3. expense_type_categories Table (NEW - Configurable categories)
```sql
-- This table allows admins to configure available expense types
CREATE TABLE expense_type_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  category_code TEXT UNIQUE NOT NULL, -- 'transportation', 'accommodation', etc.
  display_name TEXT NOT NULL, -- 'Transportation', 'Accommodation'
  description TEXT,
  
  is_active BOOLEAN DEFAULT true,
  requires_documentation BOOLEAN DEFAULT false,
  max_amount_cents BIGINT, -- Optional limit
  
  display_order INTEGER DEFAULT 0,
  icon_name TEXT, -- For UI rendering
  
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed data
INSERT INTO expense_type_categories (category_code, display_name, description, requires_documentation) VALUES
('transportation', 'Transportation', 'Vehicle, fuel, taxi fees', true),
('accommodation', 'Accommodation', 'Hotel, lodging fees', true),
('meals', 'Meals', 'Food and beverage allowance', false),
('communication', 'Communication', 'Mobile data, calls', false),
('equipment', 'Equipment', 'GPS, cameras, tools rental', true),
('supplies', 'Supplies', 'Forms, stationery, materials', true),
('local_guide', 'Local Guide', 'Community guides, interpreters', true),
('security', 'Security', 'Security escort fees', true),
('other', 'Other', 'Miscellaneous expenses', true);
```

---

## Implementation Steps

### Step 1: Enhance DispatchSitesDialog (Pre-Dispatch Costing)
```typescript
// src/components/mmp/DispatchSitesDialog.tsx

interface SiteWithCosts extends SiteEntry {
  transportationCost: number;
  accommodationCost: number;
  mealAllowance: number;
  costNotes: string;
}

const [siteCosts, setSiteCosts] = useState<Map<string, SiteWithCosts>>(new Map());

// Add cost input fields for each site
const handleCostChange = (siteId: string, field: string, value: number) => {
  setSiteCosts(prev => {
    const updated = new Map(prev);
    const site = updated.get(siteId) || { ...filteredSiteEntries.find(s => s.id === siteId)! };
    site[field] = value;
    updated.set(siteId, site);
    return updated;
  });
};

// On dispatch, create site_visit_costs records
const handleDispatch = async () => {
  // ... existing validation ...
  
  for (const siteEntry of selectedSiteObjects) {
    const costs = siteCosts.get(siteEntry.id);
    
    if (!costs?.transportationCost || costs.transportationCost <= 0) {
      toast({
        title: 'Transportation cost required',
        description: `Please enter transportation cost for ${siteEntry.site_name}`,
        variant: 'destructive'
      });
      setLoading(false);
      return;
    }
    
    // Create site_visit_costs record (ESTIMATED)
    const { data: costRecord, error: costError } = await supabase
      .from('site_visit_costs')
      .insert({
        site_visit_id: siteEntry.id, // or create site_visit first
        transportation_cost: costs.transportationCost,
        accommodation_cost: costs.accommodationCost || 0,
        meal_allowance: costs.mealAllowance || 0,
        total_cost: (costs.transportationCost + (costs.accommodationCost || 0) + (costs.mealAllowance || 0)),
        currency: 'SDG',
        cost_status: 'estimated',
        assigned_by: currentUser.id,
        cost_notes: costs.costNotes || 'Estimated at dispatch time'
      })
      .select()
      .single();
    
    if (costError) {
      console.error('Failed to create cost record:', costError);
      // Handle error
    }
    
    // Update notification to include estimated costs
    notificationRows.push({
      user_id: collectorId,
      title: 'Site Visit Assigned',
      message: `Site "${siteEntry.site_name}" assigned. Estimated costs: Transport ${costs.transportationCost} SDG, Total ${costs.transportationCost + (costs.accommodationCost || 0) + (costs.mealAllowance || 0)} SDG`,
      type: 'info',
      link: `/site-visits/${siteEntry.id}`,
      metadata: { estimated_cost_id: costRecord.id }
    });
  }
  
  // ... rest of dispatch logic ...
};
```

### Step 2: Enhance CostSubmissionForm (Show Estimated vs Actual)
```typescript
// src/components/cost-submission/CostSubmissionForm.tsx

const CostSubmissionForm = ({ siteVisit }) => {
  const [estimatedCost, setEstimatedCost] = useState<SiteVisitCost | null>(null);
  
  useEffect(() => {
    // Fetch estimated cost from site_visit_costs
    const fetchEstimatedCost = async () => {
      const { data } = await supabase
        .from('site_visit_costs')
        .select('*')
        .eq('site_visit_id', siteVisit.id)
        .eq('cost_status', 'estimated')
        .single();
      
      if (data) {
        setEstimatedCost(data);
      }
    };
    
    fetchEstimatedCost();
  }, [siteVisit.id]);
  
  return (
    <Form>
      {estimatedCost && (
        <Card className="bg-blue-50 dark:bg-blue-950 mb-4">
          <CardHeader>
            <CardTitle className="text-sm">Estimated Costs (at Dispatch)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Transportation:</span>
              <span className="font-semibold">{estimatedCost.transportationCost} SDG</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Accommodation:</span>
              <span className="font-semibold">{estimatedCost.accommodationCost} SDG</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Meals:</span>
              <span className="font-semibold">{estimatedCost.mealAllowance} SDG</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total Estimated:</span>
              <span>{estimatedCost.totalCost} SDG</span>
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="space-y-4">
        <div>
          <Label>Actual Transportation Cost</Label>
          <Input type="number" {...register('transportationCost')} />
          {estimatedCost && (
            <p className="text-xs text-muted-foreground mt-1">
              Estimated: {estimatedCost.transportationCost} SDG
              {watchTransportation && (
                <span className={watchTransportation > estimatedCost.transportationCost ? 'text-red-600' : 'text-green-600'}>
                  {' '}({watchTransportation > estimatedCost.transportationCost ? '+' : ''}{watchTransportation - estimatedCost.transportationCost} SDG)
                </span>
              )}
            </p>
          )}
        </div>
        
        {/* Add dynamic expense items */}
        <ExpenseItemsEditor 
          estimatedCost={estimatedCost}
          onChange={handleExpenseItemsChange}
        />
      </div>
    </Form>
  );
};
```

### Step 3: Create Flexible Expense Items Component
```typescript
// src/components/cost-submission/ExpenseItemsEditor.tsx

interface ExpenseItem {
  category: string;
  amountCents: number;
  description: string;
  addedBy?: string;
}

const ExpenseItemsEditor = ({ estimatedCost, onChange }) => {
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [categories, setCategories] = useState([]);
  
  useEffect(() => {
    // Fetch available categories
    const fetchCategories = async () => {
      const { data } = await supabase
        .from('expense_type_categories')
        .select('*')
        .eq('is_active', true)
        .order('display_order');
      setCategories(data || []);
    };
    fetchCategories();
  }, []);
  
  const addExpenseItem = () => {
    const newItem = { category: '', amountCents: 0, description: '' };
    setItems([...items, newItem]);
  };
  
  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index][field] = value;
    setItems(updated);
    onChange(updated);
  };
  
  const removeItem = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    setItems(updated);
    onChange(updated);
  };
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Additional Expense Items</Label>
        <Button type="button" size="sm" onClick={addExpenseItem}>
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
      </div>
      
      {items.map((item, index) => (
        <Card key={index} className="p-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select 
                value={item.category}
                onValueChange={(val) => updateItem(index, 'category', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.category_code} value={cat.category_code}>
                      {cat.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label className="text-xs">Amount (SDG)</Label>
              <Input
                type="number"
                value={item.amountCents / 100}
                onChange={(e) => updateItem(index, 'amountCents', parseFloat(e.target.value) * 100)}
              />
            </div>
            
            <div className="flex items-end">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => removeItem(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="mt-2">
            <Label className="text-xs">Description</Label>
            <Input
              value={item.description}
              onChange={(e) => updateItem(index, 'description', e.target.value)}
              placeholder="Explain this expense..."
            />
          </div>
        </Card>
      ))}
    </div>
  );
};
```

### Step 4: Enhance Admin Cost Approval (Add Expenses During Review)
```typescript
// src/components/cost-approval/CostApprovalDialog.tsx

const CostApprovalDialog = ({ submission }) => {
  const [adminAddedExpenses, setAdminAddedExpenses] = useState<ExpenseItem[]>([]);
  const [estimatedCost, setEstimatedCost] = useState<SiteVisitCost | null>(null);
  
  useEffect(() => {
    // Fetch estimated cost
    if (submission.estimatedCostId) {
      const fetchEstimated = async () => {
        const { data } = await supabase
          .from('site_visit_costs')
          .select('*')
          .eq('id', submission.estimatedCostId)
          .single();
        setEstimatedCost(data);
      };
      fetchEstimated();
    }
  }, [submission]);
  
  const handleApprove = async () => {
    // Calculate final amount including admin-added expenses
    const submittedAmount = submission.totalCostCents;
    const adminAdditionsTotal = adminAddedExpenses.reduce((sum, exp) => sum + exp.amountCents, 0);
    const finalApprovedAmount = submittedAmount + adminAdditionsTotal;
    
    // Update expense_items to include admin additions
    const allExpenseItems = [
      ...(submission.expenseItems || []),
      ...adminAddedExpenses.map(exp => ({
        ...exp,
        addedBy: 'admin',
        addedAt: new Date().toISOString()
      }))
    ];
    
    await reviewCostSubmission({
      submissionId: submission.id,
      action: 'approve',
      adjustedAmountCents: finalApprovedAmount,
      reviewerNotes: `Approved with ${adminAddedExpenses.length} admin-added expense(s)`,
      approvalNotes: `Final amount includes ${adminAdditionsTotal / 100} SDG in admin adjustments`
    });
  };
  
  return (
    <Dialog>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Review Cost Submission</DialogTitle>
        </DialogHeader>
        
        {/* Variance Analysis */}
        {estimatedCost && (
          <Card className="bg-blue-50 dark:bg-blue-950">
            <CardHeader>
              <CardTitle className="text-sm">Estimated vs Actual</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Estimated</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Transportation</TableCell>
                    <TableCell>{estimatedCost.transportationCost} SDG</TableCell>
                    <TableCell>{submission.transportationCostCents / 100} SDG</TableCell>
                    <TableCell className={
                      (submission.transportationCostCents / 100) > estimatedCost.transportationCost 
                        ? 'text-red-600' : 'text-green-600'
                    }>
                      {(submission.transportationCostCents / 100) - estimatedCost.transportationCost > 0 ? '+' : ''}
                      {((submission.transportationCostCents / 100) - estimatedCost.transportationCost).toFixed(2)} SDG
                    </TableCell>
                  </TableRow>
                  {/* More rows... */}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        
        {/* Submitted Expenses */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Submitted Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Display submission.expenseItems */}
          </CardContent>
        </Card>
        
        {/* Admin Additions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Admin Adjustments</CardTitle>
            <Button size="sm" onClick={() => setAdminAddedExpenses([...adminAddedExpenses, { category: '', amountCents: 0, description: '' }])}>
              <Plus className="h-4 w-4 mr-2" />
              Add Expense
            </Button>
          </CardHeader>
          <CardContent>
            <ExpenseItemsEditor 
              items={adminAddedExpenses}
              onChange={setAdminAddedExpenses}
            />
          </CardContent>
        </Card>
        
        {/* Final Amount */}
        <div className="flex justify-between items-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
          <span className="font-bold text-lg">Final Approved Amount:</span>
          <span className="font-bold text-2xl text-green-700 dark:text-green-400">
            {((submission.totalCostCents + adminAddedExpenses.reduce((s, e) => s + e.amountCents, 0)) / 100).toFixed(2)} SDG
          </span>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={handleReject}>Reject</Button>
          <Button variant="secondary" onClick={handleRequestRevision}>Request Revision</Button>
          <Button onClick={handleApprove}>Approve</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## Summary of Changes

### Database
1. ✅ Add `cost_status` column to `site_visit_costs` ('estimated' | 'finalized')
2. ✅ Add `expense_items` JSONB column to `site_visit_cost_submissions`
3. ✅ Add `estimated_cost_id` reference to link submissions to estimates
4. ✅ Create `expense_type_categories` table for configurable categories

### UI Components
1. ✅ Enhance `DispatchSitesDialog` with cost input fields
2. ✅ Create `ExpenseItemsEditor` for flexible expense management
3. ✅ Enhance `CostSubmissionForm` to show estimated vs actual
4. ✅ Enhance `CostApprovalDialog` to add expenses during review

### Workflow Changes
1. ✅ **Before Dispatch**: Calculate and enter transportation costs
2. ✅ **After Completion**: Submit actual costs with variance analysis
3. ✅ **During Approval**: Add additional expense types as needed
4. ✅ **Payment**: Final amount includes all approved expenses

---

## Benefits

### 1. **Budget Control**
- Transportation costs known BEFORE dispatch
- Better project budget forecasting
- Early identification of high-cost sites

### 2. **Accountability**
- Data collectors know expected costs upfront
- Variance analysis highlights discrepancies
- Admins can justify additional expenses

### 3. **Flexibility**
- Configurable expense categories
- Admin can add expenses during approval
- Support for site-specific requirements

### 4. **Transparency**
- Full audit trail from estimate → actual → approved
- Clear justification for each expense
- Document support for all costs

---

## Next Steps

Would you like me to:
1. ✅ Implement database migrations for new tables/columns
2. ✅ Enhance DispatchSitesDialog with cost input UI
3. ✅ Create ExpenseItemsEditor component
4. ✅ Update CostSubmissionForm to show variance
5. ✅ Enhance cost approval to add expenses

Let me know which parts you'd like me to implement first!
