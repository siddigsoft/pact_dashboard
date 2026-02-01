# PACT Mobile - Cost Submission Flutter Code

This folder contains the Flutter/Dart code for the Cost Submission feature of the PACT Mobile App.

## Files to Copy

Copy these files to your local Flutter project at `C:\Users\PC\PACT_mobile\lib\`:

### 1. Models
- `lib/models/cost_submission.dart` - Data models and enums for cost submissions

### 2. Services  
- `lib/services/cost_submission_service.dart` - Supabase service for CRUD operations
- `lib/services/document_upload_service.dart` - Document/image upload to Supabase Storage

### 3. Screens
- `lib/screens/cost_submission_screen.dart` - Main cost submission screen with 4 tabs
- `lib/screens/cost_approvals_screen.dart` - Approval screen for supervisors/admins

### 4. Widgets
- `lib/widgets/cost_approval_widgets.dart` - Reusable approval UI components
- `lib/widgets/document_upload_widget.dart` - Camera/gallery document upload widget
- `lib/widgets/cost_reconciliation_form.dart` - Reconciliation form for advances

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

### Document Upload Features
- Camera capture with image compression
- Gallery selection (single or multiple)
- Upload progress indicator
- Document type selection (Receipt, Invoice, Photo, Other)
- File size display
- Document deletion

### Approval Screen Features
- Tier 1 pending approvals queue
- Tier 2 pending approvals queue
- Processed submissions history
- Approve/Reject with notes
- Role-based access control

## Required Dependencies

Add these to your `pubspec.yaml`:

```yaml
dependencies:
  supabase_flutter: ^2.0.0
  intl: ^0.18.0
  image_picker: ^1.0.0
  path: ^1.8.0
```

## Usage Examples

### Cost Submission Screen
```dart
import 'package:supabase_flutter/supabase_flutter.dart';
import 'screens/cost_submission_screen.dart';
import 'services/cost_submission_service.dart';

final costService = CostSubmissionService(Supabase.instance.client);

Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => CostSubmissionScreen(
      costService: costService,
      userRole: 'Coordinator',
      hubId: currentUser.hubId,
      projectId: currentUser.projectId,
      isArabic: false, // Set to true for Arabic
    ),
  ),
);
```

### Cost Approvals Screen (for Supervisors/Admins)
```dart
import 'screens/cost_approvals_screen.dart';

Navigator.push(
  context,
  MaterialPageRoute(
    builder: (_) => CostApprovalsScreen(
      costService: costService,
      userRole: 'Admin',
      hubId: currentUser.hubId,
      isArabic: false,
    ),
  ),
);
```

### Document Upload Widget
```dart
import 'services/document_upload_service.dart';
import 'widgets/document_upload_widget.dart';

final uploadService = DocumentUploadService(Supabase.instance.client);
List<SupportingDocument> documents = [];

DocumentUploadWidget(
  uploadService: uploadService,
  documents: documents,
  onDocumentsChanged: (docs) => setState(() => documents = docs),
  isArabic: false,
  maxDocuments: 5,
)
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

## Supabase Storage Setup

Create a storage bucket named `documents` with these policies:

```sql
-- Allow authenticated users to upload to their folder
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[2]);

-- Allow users to read their own documents
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[2]);

-- Allow public read for cost documents (optional)
CREATE POLICY "Public can read cost documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');
```

## Integration Notes

1. **Realtime Updates**: The service includes `subscribeToUserSubmissions` for live updates.

2. **Offline Support**: Consider adding Hive for offline caching.

3. **Navigation**: Add screens to your app's routing system.

4. **Permissions**: Add camera and photo library permissions to `AndroidManifest.xml` and `Info.plist`.

## Android Permissions

Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA"/>
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"/>
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>
```

## iOS Permissions

Add to `ios/Runner/Info.plist`:
```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access to take photos of receipts</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>We need photo library access to upload receipts</string>
```
