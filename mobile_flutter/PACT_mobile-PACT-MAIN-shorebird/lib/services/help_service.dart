import '../models/help_models.dart';

class HelpService {
  /// Common error messages with solutions
  static final Map<String, ErrorMessage> commonErrors = {
    'session_expired': ErrorMessage(
      error: 'Session Expired',
      meaning: 'Your login session has timed out for security reasons',
      solution: 'Please log in again to continue using the app',
    ),
    'permission_denied': ErrorMessage(
      error: 'Permission Denied',
      meaning: 'You do not have permission to access this resource',
      solution: 'Contact your administrator to request the necessary permissions',
    ),
    'network_error': ErrorMessage(
      error: 'Network Error',
      meaning: 'Cannot connect to the server',
      solution: 'Check your internet connection and try again. If offline, your data will sync when connection is restored',
    ),
    'validation_failed': ErrorMessage(
      error: 'Validation Failed',
      meaning: 'The data you entered does not meet the required format',
      solution: 'Review the error messages on each field and correct the invalid data',
    ),
    'server_error': ErrorMessage(
      error: 'Server Error',
      meaning: 'An error occurred on the server while processing your request',
      solution: 'Try again in a few moments. If the problem persists, contact support',
    ),
    'duplicate_site': ErrorMessage(
      error: 'Duplicate Site',
      meaning: 'A site with this location or name already exists',
      solution: 'Check existing sites or choose a different location/name',
    ),
    'location_disabled': ErrorMessage(
      error: 'Location Services Disabled',
      meaning: 'GPS location services are turned off on your device',
      solution: 'Enable location services in your device settings to continue',
    ),
    'low_gps_accuracy': ErrorMessage(
      error: 'Low GPS Accuracy',
      meaning: 'Your current GPS accuracy is below the required 5 meters',
      solution: 'Move to an area with clear sky view. Avoid indoor locations and tall buildings',
    ),
    'storage_full': ErrorMessage(
      error: 'Storage Full',
      meaning: 'Your device storage is full',
      solution: 'Free up space by deleting unused apps or files, then try again',
    ),
    'file_too_large': ErrorMessage(
      error: 'File Too Large',
      meaning: 'The file you are trying to upload exceeds the size limit',
      solution: 'Compress the file or choose a smaller file (max 5MB per file)',
    ),
    'unsupported_file': ErrorMessage(
      error: 'Unsupported File Type',
      meaning: 'The file format is not supported',
      solution: 'Use PDF, JPG, or PNG files only',
    ),
    'sync_failed': ErrorMessage(
      error: 'Sync Failed',
      meaning: 'Unable to synchronize your local data with the server',
      solution: 'Check your internet connection. Your data is saved locally and will sync automatically when connection is restored',
    ),
    'draft_not_found': ErrorMessage(
      error: 'Draft Not Found',
      meaning: 'The saved draft could not be loaded',
      solution: 'The draft may have been corrupted. Check your offline queue or create a new entry',
    ),
    'submission_queued': ErrorMessage(
      error: 'Submission Queued',
      meaning: 'Your submission is waiting to be sent (offline mode)',
      solution: 'This is not an error. Your data will be submitted automatically when internet is available',
    ),
    'biometric_failed': ErrorMessage(
      error: 'Biometric Authentication Failed',
      meaning: 'Fingerprint or face recognition was not recognized',
      solution: 'Try again or use your password. Ensure finger is clean and properly placed. You may need to re-register biometrics in device settings',
    ),
    'call_failed': ErrorMessage(
      error: 'Call Failed',
      meaning: 'Unable to connect the voice or video call',
      solution: 'Check your internet connection. Ensure microphone/camera permissions are granted. Try calling again',
    ),
    'chat_message_failed': ErrorMessage(
      error: 'Message Not Sent',
      meaning: 'Your chat message could not be delivered',
      solution: 'Check your internet connection and try sending again. Messages require an active connection',
    ),
  };

  /// Help categories with articles
  static final List<HelpCategory> helpCategories = [
    HelpCategory(
      id: 'getting_started',
      title: 'Getting Started',
      description: 'Learn the basics of using PACT Mobile',
      articles: [
        HelpArticle(
          id: 'login',
          title: 'How to Login',
          content: '''
1. Open the PACT Mobile app
2. Enter your email address
3. Enter your password
4. Tap "Login"
5. If you have biometric authentication enabled, you can use fingerprint or face recognition

For first-time users, check your email for login credentials from your administrator.
''',
          tags: ['login', 'authentication', 'getting started'],
        ),
        HelpArticle(
          id: 'first_setup',
          title: 'First-Time Setup',
          content: '''
After your first login:

1. Update Your Profile
   - Go to Settings > Profile
   - Add your phone number
   - Upload a profile photo (optional)

2. Enable Location Services
   - Allow the app to access your location
   - Required for site visits and mapping

3. Enable Notifications
   - Stay informed about assignments and updates
   - Configure notification preferences in Settings

4. Enable Biometric Login (Optional)
   - Go to Settings > Security
   - Enable fingerprint or face recognition
   - Provides quick and secure access
''',
          tags: ['setup', 'profile', 'getting started'],
        ),
        HelpArticle(
          id: 'navigation',
          title: 'Navigating the App',
          content: '''
The app has 5 main sections:

1. Home - Dashboard with quick stats and recent activity
2. Field Operations - Site visits, surveys, and data collection
3. Wallet - Financial management and cost submissions
4. Reports - View and generate reports
5. Profile - Settings and account management

Use the bottom navigation bar to switch between sections.
Pull down on most screens to refresh data.
''',
          tags: ['navigation', 'getting started'],
        ),
      ],
    ),
    HelpCategory(
      id: 'troubleshooting',
      title: 'Troubleshooting',
      description: 'Common issues and solutions',
      articles: [
        HelpArticle(
          id: 'cannot_login',
          title: 'Cannot Login',
          content: '''
If you cannot log in, try these steps:

1. Check Your Credentials
   - Verify email address spelling
   - Ensure password is correct (case-sensitive)
   - Check for extra spaces

2. Reset Password
   - Tap "Forgot Password?" on login screen
   - Enter your email
   - Check your email for reset link
   - Follow instructions to create new password

3. Check Internet Connection
   - Ensure you have active internet
   - Try switching between Wi-Fi and mobile data

4. Clear App Cache
   - Go to device Settings > Apps > PACT Mobile
   - Tap "Clear Cache" (not "Clear Data")
   - Restart app
''',
          solution: 'If still unable to login, contact your administrator',
          tags: ['login', 'troubleshooting', 'password'],
        ),
        HelpArticle(
          id: 'location_not_working',
          title: 'Location Not Working',
          content: '''
If GPS location is not working:

1. Enable Location Services
   - Android: Settings > Location > Turn on
   - iOS: Settings > Privacy > Location Services > PACT Mobile > While Using

2. Improve GPS Accuracy
   - Move to an open area with clear sky view
   - Avoid indoor locations
   - Stay away from tall buildings
   - Wait 30 seconds for GPS to stabilize

3. Check GPS Accuracy
   - The app requires 5 meters accuracy
   - Current accuracy is shown when creating sites
   - Red text means accuracy is insufficient

4. Restart Location Services
   - Turn off location in device settings
   - Wait 10 seconds
   - Turn location back on
   - Restart the app
''',
          solution: 'If GPS continues to have issues, your device may have hardware problems. Contact support.',
          tags: ['gps', 'location', 'troubleshooting'],
        ),
        HelpArticle(
          id: 'data_not_syncing',
          title: 'Data Not Syncing',
          content: '''
If your data is not syncing with the server:

1. Check Internet Connection
   - Ensure you have active internet
   - Try opening a web browser to verify

2. Manual Sync
   - Go to Settings > Data Sync
   - Tap "Sync Now"
   - Wait for sync to complete

3. Check Sync Status
   - Look for sync icon in the app bar
   - Green checkmark = synced
   - Orange arrow = syncing
   - Red X = sync failed

4. Review Pending Changes
   - Settings > Data Sync > View Pending
   - Shows items waiting to sync

Don't worry - your data is saved locally and will automatically sync when connection is restored.
''',
          tags: ['sync', 'offline', 'troubleshooting'],
        ),
        HelpArticle(
          id: 'app_crashing',
          title: 'App Keeps Crashing',
          content: '''
If the app crashes frequently:

1. Update the App
   - Check for updates in Play Store/App Store
   - Install latest version

2. Clear Cache
   - Device Settings > Apps > PACT Mobile
   - Clear Cache (NOT Clear Data)

3. Free Up Storage
   - Ensure device has at least 500MB free
   - Delete unused apps or files

4. Restart Device
   - Power off completely
   - Wait 30 seconds
   - Power back on

5. Reinstall App (Last Resort)
   - Ensure data is synced first
   - Uninstall app
   - Download from store
   - Login again
''',
          solution: 'If crashes persist, report the issue with crash details',
          tags: ['crash', 'troubleshooting', 'performance'],
        ),
      ],
    ),
    HelpCategory(
      id: 'field_operations',
      title: 'Field Operations',
      description: 'Working with sites, surveys, and assignments',
      articles: [
        HelpArticle(
          id: 'create_site',
          title: 'How to Create a Site',
          content: '''
Creating a new site:

1. Go to Field Operations > Sites
2. Tap the "+" button
3. Select assignment from dropdown
4. Enter site details:
   - Site name (required)
   - Site code (auto-generated or custom)
   - Village/community name
   - GPS coordinates (auto-captured)
5. Upload site photos (optional)
6. Tap "Create Site"

Requirements:
- GPS accuracy must be under 5 meters
- Must have an active assignment
- Site name must be unique within assignment
''',
          tags: ['site', 'field operations', 'gps'],
        ),
        HelpArticle(
          id: 'submit_survey',
          title: 'How to Submit a Survey',
          content: '''
Completing and submitting surveys:

1. Go to Field Operations > Surveys
2. Select a survey from your assignments
3. Navigate through survey sections
4. Answer all required questions (marked with *)
5. Add photos where requested
6. Review your answers
7. Tap "Submit Survey"

Tips:
- Save as draft to continue later
- Can work offline - submits when online
- Cannot edit after submission
- Review carefully before submitting
''',
          tags: ['survey', 'field operations', 'data collection'],
        ),
        HelpArticle(
          id: 'offline_work',
          title: 'Working Offline',
          content: '''
The app supports offline data collection:

What Works Offline:
- Create sites
- Complete surveys
- Take photos
- Record GPS coordinates
- View existing data
- Save work as draft

What Syncs Later:
- All offline data syncs automatically when connection restored
- Check Settings > Data Sync to see pending items
- Orange cloud icon shows items waiting to sync

Best Practices:
- Sync before going to field
- Keep app open while syncing
- Don't uninstall app with pending data
- Ensure sufficient device storage
''',
          tags: ['offline', 'sync', 'field operations'],
        ),
        HelpArticle(
          id: 'draft_vs_complete',
          title: 'Draft vs Complete Submission',
          content: '''
Understanding draft and complete modes:

DRAFT MODE (Save as Draft):
- Saves your work locally
- Shows orange "Draft" badge on site tile
- Can continue editing anytime
- Does NOT submit to server
- Use when: No internet, need more info, taking break

COMPLETE MODE (Submit Now):
- Submits directly to server when online
- If offline, queues for submission
- Shows pending sync indicator
- Cannot edit after successful submission
- Use when: All data is ready and verified

OFFLINE QUEUE:
- If you tap "Complete" while offline
- Entry is queued for submission
- Auto-submits when online
- Check sync status in site details
''',
          tags: ['draft', 'complete', 'offline', 'submission'],
        ),
        HelpArticle(
          id: 'site_visits',
          title: 'Recording Site Visits',
          content: '''
How to record a site visit:

1. Go to Field Operations > Site Visit Hub
2. Select a site from your assignments
3. Tap "Start Visit" or "Continue Visit"
4. Fill in required information:
   - MMP Code
   - Household details
   - Equipment readings
   - Safety assessment
   - Photos/evidence
5. Choose action:
   - "Save as Draft" - Save locally for later
   - "Complete" - Submit for processing

Tips:
- GPS is captured automatically
- Take clear photos of equipment
- Answer all required fields (marked with *)
- Review before completing
''',
          tags: ['site visit', 'mmp', 'field operations'],
        ),
      ],
    ),
    HelpCategory(
      id: 'payment_methods',
      title: 'Payment Methods',
      description: 'Managing how you receive payments',
      articles: [
        HelpArticle(
          id: 'add_payment_method',
          title: 'How to Add a Payment Method',
          content: '''
Adding a payment method for receiving funds:

1. Go to Wallet > Payment Methods
2. Tap "Add Payment Method"
3. Select payment type:
   - Bank Account
   - Mobile Money
   - Debit/Credit Card
4. Enter required details:
   - Bank: Bank name, account number
   - Mobile: Provider name, phone number
   - Card: Cardholder name, card number
5. Tap "Save"

Your payment details are encrypted and secure.
''',
          tags: ['payment', 'wallet', 'bank'],
        ),
        HelpArticle(
          id: 'default_payment',
          title: 'Set Default Payment Method',
          content: '''
Setting your preferred payment method:

1. Go to Wallet > Payment Methods
2. Find the payment method you want as default
3. Tap "Set as Default"

Your default payment method will be used for:
- Salary payments
- Cost reimbursements
- Bonuses and incentives

You can change the default at any time.
''',
          solution: 'Only one payment method can be default at a time',
          tags: ['payment', 'wallet', 'default'],
        ),
        HelpArticle(
          id: 'remove_payment',
          title: 'Remove a Payment Method',
          content: '''
Deleting a payment method:

1. Go to Wallet > Payment Methods
2. Find the payment method to remove
3. Tap the delete icon
4. Confirm deletion

Note: If this was your default payment method, you'll need to set a new default before receiving payments.
''',
          tags: ['payment', 'wallet', 'delete'],
        ),
      ],
    ),
    HelpCategory(
      id: 'cost_submissions',
      title: 'Cost Submissions',
      description: 'Submit and track expense reimbursements',
      articles: [
        HelpArticle(
          id: 'submit_costs',
          title: 'How to Submit Costs',
          content: '''
Submitting expense reimbursements:

1. Go to Wallet > Cost Submissions
2. Tap "Submit New Costs"
3. Enter cost details:
   - Transportation costs
   - Accommodation costs
   - Meals and per diem
   - Other expenses
4. Add descriptions for each category
5. Upload supporting documents (receipts, invoices)
6. Review total amount
7. Tap "Submit"

Requirements:
- Must have supporting documents
- All amounts in correct currency
- Detailed descriptions required
- Max 10 documents (5MB each)
''',
          tags: ['costs', 'expenses', 'reimbursement', 'wallet'],
        ),
        HelpArticle(
          id: 'track_costs',
          title: 'Track Your Submissions',
          content: '''
Monitoring your cost submissions:

Status meanings:
- Pending: Submitted, awaiting review
- Under Review: Being reviewed by finance team
- Approved: Approved, payment being processed
- Paid: Payment completed
- Rejected: Not approved (see comments)
- Cancelled: Cancelled by you

View details:
- Tap any submission to see full details
- View cost breakdown
- Download supporting documents
- See reviewer comments
''',
          tags: ['costs', 'status', 'wallet'],
        ),
      ],
    ),
    HelpCategory(
      id: 'settings',
      title: 'Settings & Account',
      description: 'Manage your account and preferences',
      articles: [
        HelpArticle(
          id: 'change_password',
          title: 'Change Your Password',
          content: '''
Updating your password:

1. Go to Profile > Settings > Security
2. Tap "Change Password"
3. Enter current password
4. Enter new password (must meet requirements)
5. Confirm new password
6. Tap "Update Password"

Password Requirements:
- At least 8 characters
- Mix of uppercase and lowercase
- At least one number
- At least one special character
''',
          tags: ['password', 'security', 'settings'],
        ),
        HelpArticle(
          id: 'enable_biometric',
          title: 'Enable Biometric Authentication',
          content: '''
Setting up fingerprint or face recognition:

1. Go to Profile > Settings > Security
2. Tap "Biometric Authentication"
3. Follow device prompts to scan fingerprint/face
4. Create backup PIN (required)
5. Confirm setup

Benefits:
- Quick login without typing password
- More secure than password alone
- Works offline

Note: Device must support biometric authentication
''',
          tags: ['biometric', 'security', 'settings'],
        ),
        HelpArticle(
          id: 'notification_settings',
          title: 'Manage Notifications',
          content: '''
Customize notification preferences:

1. Go to Profile > Settings > Notifications
2. Toggle notification types:
   - New assignments
   - Survey reminders
   - Payment notifications
   - System updates
3. Set quiet hours (optional)
4. Choose notification sound

Notification Types:
- Push: Real-time alerts
- In-app: Within app only
- Email: Email notifications
''',
          tags: ['notifications', 'settings'],
        ),
      ],
    ),
    HelpCategory(
      id: 'communication',
      title: 'Communication',
      description: 'Chat, calls, and messaging features',
      articles: [
        HelpArticle(
          id: 'using_chat',
          title: 'Using the Chat Feature',
          content: '''
Communicating with team members:

1. Go to Chat from the bottom navigation
2. View your conversations
3. Tap a conversation to open it
4. Type your message and tap send

Features:
- Real-time messaging
- Messages appear in chronological order
- New messages appear at bottom
- Unread message indicators
- Group and individual chats

Tips:
- Pull down to refresh messages
- Messages sync automatically
- Works when online only
''',
          tags: ['chat', 'messaging', 'communication'],
        ),
        HelpArticle(
          id: 'voice_calls',
          title: 'Making Voice/Video Calls',
          content: '''
Calling team members within the app:

1. Open a chat conversation
2. Tap the phone or video icon in the header
3. Wait for the other person to answer
4. Tap end call button when finished

Call Features:
- Voice calls
- Video calls
- Mute/unmute
- Speaker mode
- Camera on/off

Requirements:
- Stable internet connection
- Microphone permission
- Camera permission (for video)
''',
          tags: ['calls', 'video', 'voice', 'communication'],
        ),
      ],
    ),
  ];

  /// Get error message by key
  static ErrorMessage? getErrorMessage(String errorKey) {
    return commonErrors[errorKey];
  }

  /// Search articles by query
  static List<HelpArticle> searchArticles(String query) {
    final lowercaseQuery = query.toLowerCase();
    final results = <HelpArticle>[];

    for (final category in helpCategories) {
      for (final article in category.articles) {
        if (article.title.toLowerCase().contains(lowercaseQuery) ||
            article.content.toLowerCase().contains(lowercaseQuery) ||
            article.tags.any((tag) => tag.toLowerCase().contains(lowercaseQuery))) {
          results.add(article);
        }
      }
    }

    return results;
  }

  /// Get all articles for a category
  static List<HelpArticle> getArticlesByCategory(String categoryId) {
    final category = helpCategories.firstWhere(
      (cat) => cat.id == categoryId,
      orElse: () => HelpCategory(
        id: '',
        title: '',
        description: '',
        articles: [],
      ),
    );
    return category.articles;
  }

  /// Get article by ID
  static HelpArticle? getArticleById(String articleId) {
    for (final category in helpCategories) {
      for (final article in category.articles) {
        if (article.id == articleId) {
          return article;
        }
      }
    }
    return null;
  }
}
