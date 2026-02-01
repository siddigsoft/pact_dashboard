# PACT Mobile - Cost Submission Flutter Code

This folder contains the Flutter/Dart code for the Cost Submission feature of the PACT Mobile App.

## Files to Copy

Copy these files to your local Flutter project at `C:\Users\PC\PACT_mobile\lib\`:

### 1. Models
- `lib/models/cost_submission.dart` - Data models and enums for cost submissions

### 2. Services  
- `lib/services/cost_submission_service.dart` - Supabase service for CRUD operations

### 3. Screens
- `lib/screens/cost_submission_screen.dart` - Main cost submission screen with 4 tabs

### 4. Widgets
- `lib/widgets/cost_approval_widgets.dart` - Reusable approval UI components

## Features Included

### Cost Submission Types
- **Operational Costs** - For FOM/Coordinators (permits, training, communications, etc.)
- **Site Visit Costs** - For Data Collectors (transportation, accommodation, meals)

### 9 Expense Categories
1. Permits (التصاريح)
2. Incentives (الحوافز)
3. Communications (الاتصالات)
4. Training (التدريب)
5. General Transportation (النقل العام)
6. Equipment & Supplies (المعدات واللوازم)
7. Printing & Materials (الطباعة والمواد)
8. Meetings & Events (الاجتماعات والفعاليات)
9. Other (أخرى)

### Two-Tier Approval Workflow
- **Tier 1**: Supervisor/FOM approval
- **Tier 2**: Admin approval

### 4-Tab Interface
1. **Submit** - New expense submission form
2. **Reconciliation** - For advances needing reconciliation
3. **Outstanding** - Open balances awaiting payment
4. **History** - Full submission history

### Status Tracking
- Pending
- Under Review
- Approved
- Rejected
- Disbursed
- Reconciliation Pending
- Reconciled
- Paid
- Closed
- Cancelled

### Bilingual Support
- Full English/Arabic support for all labels and messages

## Required Dependencies

Add these to your `pubspec.yaml`:

```yaml
dependencies:
  supabase_flutter: ^2.0.0
  intl: ^0.18.0
  image_picker: ^1.0.0  # For document upload
  file_picker: ^6.0.0   # Alternative for document upload
```

## Usage Example

```dart
import 'package:supabase_flutter/supabase_flutter.dart';
import 'screens/cost_submission_screen.dart';
import 'services/cost_submission_service.dart';

// Initialize service
final costService = CostSubmissionService(Supabase.instance.client);

// Navigate to screen
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => CostSubmissionScreen(
      costService: costService,
      userRole: 'Coordinator',
      hubId: currentUser.hubId,
      projectId: currentUser.projectId,
      isArabic: false,
    ),
  ),
);
```

## Database Table Required

Make sure you have the `operational_cost_submissions` table in Supabase:

```sql
CREATE TABLE operational_cost_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_category TEXT NOT NULL,
  hub_id UUID REFERENCES hubs(id),
  project_id UUID REFERENCES projects(id),
  mmp_file_id UUID REFERENCES mmp_files(id),
  submitted_by UUID NOT NULL REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  submitter_role TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'SDG',
  description TEXT NOT NULL,
  expense_date DATE NOT NULL,
  vendor TEXT,
  reference_number TEXT,
  supporting_documents JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  tier1_status TEXT DEFAULT 'pending',
  tier1_reviewed_by UUID REFERENCES profiles(id),
  tier1_reviewed_at TIMESTAMPTZ,
  tier1_notes TEXT,
  tier2_status TEXT DEFAULT 'pending',
  tier2_reviewed_by UUID REFERENCES profiles(id),
  tier2_reviewed_at TIMESTAMPTZ,
  tier2_notes TEXT,
  wallet_transaction_id UUID,
  paid_at TIMESTAMPTZ,
  paid_amount_cents INTEGER,
  payment_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Notes

1. **Document Upload**: The document upload functionality needs to be implemented using `image_picker` or `file_picker` packages based on your preference.

2. **Realtime Updates**: The service includes a `subscribeToUserSubmissions` method for realtime updates using Supabase Realtime.

3. **Offline Support**: Consider adding offline support using Hive or similar for caching submissions when offline.

4. **Navigation Integration**: Add this screen to your navigation/routing system.
