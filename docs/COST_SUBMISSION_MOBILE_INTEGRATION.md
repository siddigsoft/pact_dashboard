# Cost Submission System - Mobile Integration Guide

## Overview

This document describes the enhanced two-phase cost submission workflow and the files needed for mobile app integration.

## Workflow Summary

### Two Types of Cost Requests

1. **Advance Payment**
   - Request funds before spending
   - Flow: Request → Approve → Disburse → [User Spends] → Upload Receipts → Reconcile → Close
   - Balance tracking required

2. **Reimbursement**
   - Already spent personal funds
   - Flow: Request + Receipts → Approve → Pay → Close
   - No balance tracking needed

## Web Files Created/Modified

### Type Definitions
- `src/types/cost-submission.ts` - Enhanced with new types:
  - `CostRequestType` ('advance' | 'reimbursement')
  - `BalanceStatus` ('not_applicable' | 'open' | 'settled' | 'underspent' | 'overspent')
  - `BudgetLineCategory` - Links to project budgets
  - `EnhancedCostRequest` - Full request model
  - `CreateEnhancedCostRequest` - Create DTO
  - `SubmitReconciliationRequest` - Reconciliation DTO
  - `CostReportData` - Export format

### New Components
- `src/components/cost-submission/CostRequestForm.tsx` - Phase 1 request form
- `src/components/cost-submission/CostReconciliationForm.tsx` - Phase 2 reconciliation form
- `src/components/cost-submission/OutstandingAdvances.tsx` - Open balance tracker

### New Pages
- `src/pages/CostSubmissionReports.tsx` - Reports with filters and Excel/PDF export

### Routes
- `/cost-submission` - Main cost submission page
- `/cost-submission/reports` - Reports page

## Mobile Files to Copy/Sync

### Dart Model (Already Created)
```
mobile_flutter/PACT_mobile-PACT-MAIN-shorebird/lib/models/cost_request.dart
```

This file contains:
- All enums matching web types
- `EnhancedCostRequest` model with JSON serialization
- `CreateCostRequestDto` for creating requests
- `SubmitReconciliationDto` for reconciliation
- Bilingual label extensions (English/Arabic)
- Helper getters for computed properties

### Mobile Screens to Create

1. **CostRequestScreen** (`lib/screens/cost_request_screen.dart`)
   - Tab view: Advance / Reimbursement
   - Project and budget line selection
   - Document upload
   - Form validation

2. **CostReconciliationScreen** (`lib/screens/cost_reconciliation_screen.dart`)
   - Shows disbursed amount
   - Actual spent input
   - Balance calculation display
   - Receipt upload
   - Variance explanation

3. **MyCostRequestsScreen** (`lib/screens/my_cost_requests_screen.dart`)
   - List of user's requests
   - Status badges
   - Filter by status/type
   - Action buttons (reconcile, view)

4. **OutstandingAdvancesScreen** (`lib/screens/outstanding_advances_screen.dart`)
   - Admin view of all open balances
   - Overdue alerts
   - By user/project breakdown

### Mobile Service to Create

```dart
// lib/services/cost_request_service.dart

class CostRequestService {
  Future<List<EnhancedCostRequest>> getMyRequests();
  Future<List<EnhancedCostRequest>> getAllRequests(); // Admin
  Future<List<EnhancedCostRequest>> getOutstandingAdvances();
  Future<EnhancedCostRequest> createRequest(CreateCostRequestDto dto);
  Future<EnhancedCostRequest> submitReconciliation(SubmitReconciliationDto dto);
  Future<String> uploadDocument(File file);
}
```

## Supabase Tables

The enhanced cost submission system uses these database tables:
- `cost_submissions` - Main cost submissions table (needs schema update)
- `supporting_documents` - Linked documents (JSONB column in cost_submissions)
- `cost_approval_history` - Audit trail

### Required Schema Updates

```sql
-- Add new columns to existing cost_submissions table
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS request_type VARCHAR(20) DEFAULT 'reimbursement';
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS budget_line_category VARCHAR(50);
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS disbursed_amount_cents INTEGER;
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS disbursed_at TIMESTAMP;
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS disbursed_by UUID REFERENCES profiles(id);
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS balance_status VARCHAR(20) DEFAULT 'not_applicable';
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS balance_cents INTEGER;
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS actual_spent_cents INTEGER;
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT;
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS reconciliation_submitted_at TIMESTAMP;
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS reconciled_by UUID REFERENCES profiles(id);
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMP;
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS justification TEXT;
ALTER TABLE cost_submissions ADD COLUMN IF NOT EXISTS title VARCHAR(255);
```

## API Endpoints Needed

```
POST   /api/cost-requests              - Create new request
GET    /api/cost-requests              - List requests (with filters)
GET    /api/cost-requests/:id          - Get single request
PATCH  /api/cost-requests/:id          - Update request (if pending)
POST   /api/cost-requests/:id/approve  - Tier 1/2 approval
POST   /api/cost-requests/:id/disburse - Mark as disbursed (finance)
POST   /api/cost-requests/:id/reconcile - Submit reconciliation
POST   /api/cost-requests/:id/verify   - Verify reconciliation (admin)
GET    /api/cost-requests/outstanding  - Get outstanding advances
GET    /api/cost-requests/reports      - Get report data
```

## Budget Line Categories

| Key | English | Arabic |
|-----|---------|--------|
| transportation_and_visit_fees | Transportation & Visit Fees | رسوم النقل والزيارة |
| permit_fee | Permit Fees | رسوم التصاريح |
| internet_and_communication_fees | Internet & Communications | الإنترنت والاتصالات |
| training_and_capacity_building | Training & Capacity Building | التدريب وبناء القدرات |
| equipment_and_supplies | Equipment & Supplies | المعدات واللوازم |
| office_and_admin | Office & Admin | المكتب والإدارة |
| personnel_allowances | Personnel Allowances | بدلات الموظفين |
| other | Other | أخرى |

## Status Flow Diagrams

### Advance Payment
```
PENDING → APPROVED → DISBURSED → RECONCILIATION_PENDING → RECONCILED/CLOSED
                          ↓
                    (Balance Open)
```

### Reimbursement
```
PENDING → APPROVED → PAID → CLOSED
```

## Testing Checklist

- [ ] Create advance payment request
- [ ] Create reimbursement request
- [ ] Upload justification documents
- [ ] Approve requests (Tier 1 & 2)
- [ ] Disburse funds (advance)
- [ ] Submit reconciliation with receipts
- [ ] Verify reconciliation
- [ ] Handle underspent/overspent cases
- [ ] Export reports to Excel
- [ ] Export reports to PDF
- [ ] Mobile: Create request
- [ ] Mobile: Upload documents
- [ ] Mobile: View outstanding advances
- [ ] Mobile: Submit reconciliation
