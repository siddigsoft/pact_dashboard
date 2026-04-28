// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'PACT Mobile';

  @override
  String get availableTasks => 'Available Tasks';

  @override
  String get fieldOperations => 'Field Operations';

  @override
  String tasksInArea(int count) {
    return '$count tasks in your area';
  }

  @override
  String get accept => 'Accept';

  @override
  String get decline => 'Decline';

  @override
  String get noTasksAvailable => 'No tasks available';

  @override
  String get checkBackLater => 'Check back later for new tasks in your area';

  @override
  String get login => 'Login';

  @override
  String get register => 'Register';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get confirmPassword => 'Confirm Password';

  @override
  String get fullName => 'Full Name';

  @override
  String get phoneNumber => 'Phone Number';

  @override
  String get welcome => 'Welcome';

  @override
  String get welcomeBack => 'Welcome Back';

  @override
  String get signInToContinue => 'Sign in to continue';

  @override
  String get createAccount => 'Create Account';

  @override
  String get showMap => 'Show Map';

  @override
  String get showTasks => 'Show Tasks';

  @override
  String get refresh => 'Refresh';

  @override
  String get menu => 'Menu';

  @override
  String get logout => 'Logout';

  @override
  String get settings => 'Settings';

  @override
  String get language => 'Language';

  @override
  String get english => 'English';

  @override
  String get arabic => 'العربية';

  @override
  String get high => 'HIGH';

  @override
  String get medium => 'MEDIUM';

  @override
  String get low => 'LOW';

  @override
  String get due => 'Due';

  @override
  String get kmAway => 'km away';

  @override
  String get home => 'Home';

  @override
  String get forms => 'Forms';

  @override
  String get equipment => 'Equipment';

  @override
  String get safety => 'Safety';

  @override
  String get chat => 'Chat';

  @override
  String get forgotPassword => 'Forgot Password?';

  @override
  String get dontHaveAccount => 'Don\'t have an account?';

  @override
  String get alreadyHaveAccount => 'Already have an account?';

  @override
  String get signIn => 'Sign In';

  @override
  String get signUp => 'Sign Up';

  @override
  String get signInToAccount => 'Sign in to your Pact Consultancy account';

  @override
  String get signInCaps => 'SIGN IN';

  @override
  String get createAccountCaps => 'CREATE ACCOUNT';

  @override
  String get mmpFiles => 'MMP Files';

  @override
  String get pleaseLogInToViewMMPFiles => 'Please log in to view MMP files';

  @override
  String get logIn => 'Log In';

  @override
  String get noMMPFilesAvailable => 'No MMP files available';

  @override
  String get noFileUrlAvailable => 'No file URL available';

  @override
  String get couldNotOpenFile => 'Could not open file';

  @override
  String get invalidFileUrlFormat => 'Invalid file URL format';

  @override
  String get errorAccessingFileUrl => 'Error accessing file URL';

  @override
  String get dismiss => 'Dismiss';

  @override
  String get addNewEquipment => 'Add New Equipment';

  @override
  String get equipmentName => 'Equipment Name';

  @override
  String get enterEquipmentName => 'Enter equipment name';

  @override
  String get status => 'Status';

  @override
  String get nextMaintenanceDate => 'Next Maintenance Date';

  @override
  String get yyyyMmDd => 'YYYY-MM-DD';

  @override
  String get cancel => 'Cancel';

  @override
  String get add => 'Add';

  @override
  String get inspectionForm => 'Inspection Form';

  @override
  String get condition => 'Condition';

  @override
  String get enterCurrentCondition => 'Enter current condition';

  @override
  String get concerns => 'Concerns';

  @override
  String get enterAnyConcerns => 'Enter any concerns';

  @override
  String get recommendations => 'Recommendations';

  @override
  String get enterRecommendations => 'Enter recommendations';

  @override
  String get submit => 'Submit';

  @override
  String get filterEquipment => 'Filter Equipment';

  @override
  String get searchEquipment => 'Search Equipment';

  @override
  String get enterEquipmentNameSearch => 'Enter equipment name';

  @override
  String get close => 'Close';

  @override
  String get all => 'All';

  @override
  String get available => 'Available';

  @override
  String get inUse => 'In Use';

  @override
  String get needsMaintenance => 'Needs Maintenance';

  @override
  String get noEquipmentFound => 'No equipment found';

  @override
  String get tapPlusButtonToAddEquipment => 'Tap the + button to add equipment';

  @override
  String get next => 'Next';

  @override
  String get checkedIn => 'Checked-in';

  @override
  String get checkedOut => 'Checked-out';

  @override
  String get nextMaintenance => 'Next Maintenance';

  @override
  String get safetyHub => 'Safety Hub';

  @override
  String get information => 'Information';

  @override
  String get quickAccess => 'Quick Access';

  @override
  String get safetyChecklist => 'Safety Checklist';

  @override
  String get incidentReport => 'Incident Report';

  @override
  String get reportIncident => 'Report Incident';

  @override
  String get regionalHelplines => 'Regional Helplines';

  @override
  String get safetyTipOfTheDay => 'Safety Tip of the Day';

  @override
  String get ladderInspectionTip =>
      'Always inspect your ladder before use. Check for damage, missing parts, and proper functioning of all components.';

  @override
  String get viewMoreTips => 'View More Tips';

  @override
  String get localPolice => 'Local Police:999';

  @override
  String get pactEmergency => 'PACT Emergency:+256700000000';

  @override
  String get medicalEmergency => 'Medical Emergency:911';

  @override
  String get hiHowCanIHelp => 'Hi there! How can I help you today?';

  @override
  String get pactSupport => 'PACT Support';

  @override
  String get needEquipmentInfo =>
      'I need information about equipment maintenance.';

  @override
  String get sureWhatEquipment =>
      'Sure! I can help with that. What specific equipment are you asking about?';

  @override
  String get excavatorSiteB => 'The excavator on site B.';

  @override
  String get maintenanceScheduleResponse =>
      'I\'ve pulled up the maintenance schedule for that excavator. Its next maintenance is due on September 20. Would you like me to send you the full maintenance details?';

  @override
  String get safetyAlert => 'Safety Alert';

  @override
  String get weatherWarningSiteA =>
      'Severe weather warning for Site A. All personnel should follow safety protocols and stay informed of updates.';

  @override
  String get typeAMessage => 'Type a message...';

  @override
  String get wallet => 'Wallet';

  @override
  String get helpAndSupport => 'Help & Support';

  @override
  String get sendFeedback => 'Send Feedback';

  @override
  String get aboutPact => 'About PACT';

  @override
  String get syncData => 'Sync Data';

  @override
  String get signOut => 'Sign Out';

  @override
  String get draft => 'Draft';

  @override
  String get complete => 'Complete';

  @override
  String get saveAsDraft => 'Save as Draft';

  @override
  String get submitNow => 'Submit Now';

  @override
  String get pendingSync => 'Pending Sync';

  @override
  String get synced => 'Synced';

  @override
  String get offline => 'Offline';

  @override
  String get online => 'Online';

  @override
  String get offlineMode => 'Offline Mode';

  @override
  String get siteVisit => 'Site Visit';

  @override
  String get siteVisitHub => 'Site Visit Hub';

  @override
  String get completedSites => 'Completed Sites';

  @override
  String get pendingPayments => 'Pending Payments';

  @override
  String get totalEarnings => 'Total Earnings';

  @override
  String get paymentMethods => 'Payment Methods';

  @override
  String get costSubmissions => 'Cost Submissions';

  @override
  String get transactions => 'Transactions';

  @override
  String get havingTroubleSigningIn => 'Having trouble signing in?';

  @override
  String get loginTroubleshooting => 'Login Troubleshooting';

  @override
  String get contactSupport => 'Contact Support';

  @override
  String get reportBug => 'Report a Bug';

  @override
  String get commonErrors => 'Common Errors';

  @override
  String get searchHelp => 'Search help articles...';

  @override
  String get noResultsFound => 'No results found';

  @override
  String get getHelpAndFindAnswers => 'Get help and find answers';

  @override
  String get shareYourThoughts => 'Share your thoughts';

  @override
  String get learnMoreAboutUs => 'Learn more about us';

  @override
  String get updateLocalData => 'Update local data';

  @override
  String get pactDashboard => 'PACT Dashboard';

  @override
  String get viewOnWeb => 'View on web';

  @override
  String get version => 'Version';

  @override
  String get build => 'Build';

  @override
  String get voiceCall => 'Voice Call';

  @override
  String get videoCall => 'Video Call';

  @override
  String get endCall => 'End Call';

  @override
  String get incomingCall => 'Incoming Call';

  @override
  String get calling => 'Calling...';

  @override
  String get ringing => 'Ringing...';

  @override
  String get connected => 'Connected';

  @override
  String get callEnded => 'Call ended';

  @override
  String get mute => 'Mute';

  @override
  String get unmute => 'Unmute';

  @override
  String get speaker => 'Speaker';

  @override
  String get camera => 'Camera';

  @override
  String get notifications => 'Notifications';

  @override
  String get markAllAsRead => 'Mark all as read';

  @override
  String get noNotifications => 'No notifications';

  @override
  String get today => 'Today';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get earlier => 'Earlier';

  @override
  String get reports => 'Reports';

  @override
  String get visitReports => 'Visit Reports';

  @override
  String get filterByDate => 'Filter by Date';

  @override
  String get filterByMonth => 'Filter by Month';

  @override
  String get filterByYear => 'Filter by Year';

  @override
  String get date => 'Date';

  @override
  String get month => 'Month';

  @override
  String get year => 'Year';

  @override
  String get noReportsFound => 'No reports found';

  @override
  String get downloadReport => 'Download Report';

  @override
  String get shareReport => 'Share Report';

  @override
  String get duration => 'Duration';

  @override
  String get minutes => 'minutes';

  @override
  String get finalLocation => 'Final Location';

  @override
  String get coordinates => 'Coordinates';

  @override
  String get accuracy => 'Accuracy';

  @override
  String get notes => 'Notes';

  @override
  String get noNotes => 'No notes';

  @override
  String get activities => 'Activities';

  @override
  String get photos => 'Photos';

  @override
  String get generatedByPact => 'Generated by PACT Mobile';

  @override
  String get errorLoadingVisits => 'Error loading visits';

  @override
  String get errorDownloadingReport => 'Error downloading report';

  @override
  String get visitsThisMonth => 'Visits this month';

  @override
  String get visitsThisYear => 'Visits this year';

  @override
  String get totalVisits => 'Total visits';

  @override
  String get viewDetails => 'View Details';

  @override
  String get completed => 'Completed';

  @override
  String get pending => 'Pending';

  @override
  String get approved => 'Approved';

  @override
  String get rejected => 'Rejected';

  @override
  String get cancelled => 'Cancelled';

  @override
  String get underReview => 'Under Review';

  @override
  String get paid => 'Paid';

  @override
  String get balance => 'Balance';

  @override
  String get earnings => 'Earnings';

  @override
  String get withdrawals => 'Withdrawals';

  @override
  String get withdrawFunds => 'Withdraw Funds';

  @override
  String get requestWithdrawal => 'Request Withdrawal';

  @override
  String get amount => 'Amount';

  @override
  String get enterAmount => 'Enter amount';

  @override
  String get reason => 'Reason';

  @override
  String get enterReason => 'Please enter a reason';

  @override
  String get selectPaymentMethod => 'Select payment method';

  @override
  String get addPaymentMethod => 'Add Payment Method';

  @override
  String get noPaymentMethods => 'No payment methods';

  @override
  String get bankAccount => 'Bank Account';

  @override
  String get mobileMoney => 'Mobile Money';

  @override
  String get debitCard => 'Debit/Credit Card';

  @override
  String get accountNumber => 'Account Number';

  @override
  String get bankName => 'Bank Name';

  @override
  String get phoneNumberForMoney => 'Phone Number';

  @override
  String get providerName => 'Provider Name';

  @override
  String get cardholderName => 'Cardholder Name';

  @override
  String get cardNumber => 'Card Number';

  @override
  String get setAsDefault => 'Set as Default';

  @override
  String get defaultPayment => 'Default';

  @override
  String get remove => 'Remove';

  @override
  String get unknown => 'Unknown';

  @override
  String get confirmDelete => 'Confirm Delete';

  @override
  String get areYouSure => 'Are you sure?';

  @override
  String get delete => 'Delete';

  @override
  String get save => 'Save';

  @override
  String get edit => 'Edit';

  @override
  String get search => 'Search';

  @override
  String get filter => 'Filter';

  @override
  String get sort => 'Sort';

  @override
  String get loading => 'Loading...';

  @override
  String get retry => 'Retry';

  @override
  String get error => 'Error';

  @override
  String get success => 'Success';

  @override
  String get warning => 'Warning';

  @override
  String get info => 'Info';

  @override
  String get ok => 'OK';

  @override
  String get yes => 'Yes';

  @override
  String get no => 'No';

  @override
  String get confirm => 'Confirm';

  @override
  String get back => 'Back';

  @override
  String get done => 'Done';

  @override
  String get continueText => 'Continue';

  @override
  String get skip => 'Skip';

  @override
  String get siteCode => 'Site Code';

  @override
  String get siteName => 'Site Name';

  @override
  String get village => 'Village';

  @override
  String get district => 'District';

  @override
  String get region => 'Region';

  @override
  String get household => 'Household';

  @override
  String get mmpCode => 'MMP Code';

  @override
  String get startVisit => 'Start Visit';

  @override
  String get continueVisit => 'Continue Visit';

  @override
  String get endVisit => 'End Visit';

  @override
  String get gpsAccuracy => 'GPS Accuracy';

  @override
  String get meters => 'meters';

  @override
  String get requiredField => 'This field is required';

  @override
  String get invalidEmail => 'Invalid email address';

  @override
  String get passwordTooShort => 'Password must be at least 8 characters';

  @override
  String get passwordsDoNotMatch => 'Passwords do not match';

  @override
  String get statePermit => 'State Permit';

  @override
  String get localityPermit => 'Locality Permit';

  @override
  String get federalPermit => 'Federal Permit';

  @override
  String get permitRequired => 'Permit Required';

  @override
  String get permitNotRequired => 'No, it\'s not a requirement';

  @override
  String get uploadStatePermit => 'Upload State Permit';

  @override
  String get uploadLocalityPermit => 'Upload Locality Permit';

  @override
  String get statePermitRequired => 'State Permit Required';

  @override
  String statePermitDescription(String state) {
    return 'Only the Federal permit has been uploaded. Upload the $state state permit to continue.';
  }

  @override
  String get localityPermitRequired => 'Locality Permit Required';

  @override
  String localityPermitDescription(String locality) {
    return 'Please upload the locality permit for $locality to continue.';
  }

  @override
  String get selectFile => 'Select File';

  @override
  String get permitFile => 'Permit File';

  @override
  String get issueDate => 'Issue Date';

  @override
  String get expiryDate => 'Expiry Date';

  @override
  String get comments => 'Comments';

  @override
  String get addCommentsOptional => 'Add comments (optional)';

  @override
  String get uploadPermit => 'Upload Permit';

  @override
  String get uploading => 'Uploading...';

  @override
  String get permitUploadSuccess => 'Permit uploaded successfully';

  @override
  String get permitUploadError => 'Failed to upload permit';

  @override
  String get invalidFileType => 'Invalid file type';

  @override
  String get fileTooLarge => 'File too large';

  @override
  String get selectPdfOrImage => 'Please select a PDF or image file (JPG, PNG)';

  @override
  String maxFileSize(int size) {
    return 'Maximum file size: $size MB';
  }

  @override
  String get datesRequired => 'Issue and expiry dates are required';

  @override
  String get expiryAfterIssue => 'Expiry date must be after issue date';

  @override
  String get showPreview => 'Show Preview';

  @override
  String get hidePreview => 'Hide Preview';

  @override
  String get clearFile => 'Clear File';

  @override
  String get permitVerification => 'Permit Verification';

  @override
  String get verifyPermits => 'Verify Permits';

  @override
  String get permitsAttached => 'Permits Attached';

  @override
  String get pendingVerification => 'Pending Verification';

  @override
  String get verified => 'Verified';

  @override
  String get statePermitAttached => 'State Permit Attached';

  @override
  String get localityPermitAttached => 'Locality Permit Attached';

  @override
  String doYouHaveStatePermit(String state) {
    return 'Do you have the state permit for $state?';
  }

  @override
  String doYouHaveLocalityPermit(String locality) {
    return 'Do you have the locality permit for $locality?';
  }

  @override
  String get yesHaveIt => 'Yes, I have the permit';

  @override
  String get noRequiredDontHave => 'Required but I don\'t have it';

  @override
  String get notRequiredInLocality => 'Not required in this locality';

  @override
  String get canProceedWithout => 'Can you proceed without the permit?';

  @override
  String get yesProceedWithout => 'Yes, I can proceed';

  @override
  String get noCannotProceed => 'No, I need the permit';

  @override
  String get sendBackToFom => 'Send Back to FOM';

  @override
  String get siteVerification => 'Site Verification';

  @override
  String get verifySite => 'Verify Site';

  @override
  String get returnToFom => 'Return to FOM';

  @override
  String get pendingSites => 'Pending Sites';

  @override
  String get cpVerification => 'CP Verification';

  @override
  String get verifiedSites => 'Verified Sites';

  @override
  String sitesNeedStatePermit(int count) {
    return '$count sites need state permit';
  }

  @override
  String sitesNeedLocalityPermit(int count) {
    return '$count sites need locality permit';
  }

  @override
  String get step1SelectFile => 'Step 1: Select File';

  @override
  String get step2EnterDates => 'Step 2: Enter Dates';

  @override
  String get step3AddComments => 'Step 3: Add Comments (Optional)';

  @override
  String get step4Upload => 'Step 4: Upload Permit';

  @override
  String get tapToSelectFile => 'Tap to select file';

  @override
  String get supportedFormats => 'Supported formats: PDF, JPG, PNG';

  @override
  String fileSelected(String fileName) {
    return 'File selected: $fileName';
  }

  @override
  String get gallery => 'Gallery';

  @override
  String get pdfDocument => 'PDF Document';

  @override
  String get willUploadPermit => 'I will upload the permit document';

  @override
  String get cannotProvideNow =>
      'The permit is required but I cannot provide it now';

  @override
  String get noPermitNeeded =>
      'No locality permit is needed for operations here';

  @override
  String get continueWithoutPermit => 'Continue without the locality permit';

  @override
  String get sendBackToManager => 'Send back to Field Operations Manager';

  @override
  String chooseHowToProceed(int count, String sitesLabel, String locality) {
    return 'Choose how to proceed for $count $sitesLabel in $locality:';
  }

  @override
  String get site => 'site';

  @override
  String get sites => 'sites';

  @override
  String get uploadFailed => 'Upload failed';

  @override
  String get databaseUpdateFailed =>
      'Database update failed. Please try again.';

  @override
  String get selectDate => 'Select date';

  @override
  String get bulkStatePermitUpload => 'Bulk State Permit Upload';

  @override
  String get bulkLocalityPermitUpload => 'Bulk Locality Permit Upload';

  @override
  String get statesSelected => 'states selected';

  @override
  String get localitiesSelected => 'localities selected';

  @override
  String get bulkUploadInstructions =>
      'Select files and dates for each state. Only states with complete information will be uploaded.';

  @override
  String get bulkLocalityUploadInstructions =>
      'Select files and dates for each locality. Only localities with complete information will be uploaded.';

  @override
  String get noPermitsReady => 'No permits ready for upload';

  @override
  String get ready => 'Ready';

  @override
  String get uploaded => 'Uploaded';

  @override
  String get failed => 'Failed';

  @override
  String get uploadAll => 'Upload All';

  @override
  String get notificationAppUpdateTitle => 'App Update Available';

  @override
  String notificationAppUpdateBody(String version) {
    return 'A new version ($version) is ready. Tap to update!';
  }

  @override
  String get notificationDownloadingTitle => 'Downloading Update';

  @override
  String get notificationDownloadingBody => 'Please wait...';

  @override
  String get notificationUpdateInstalledTitle => 'Update Installed';

  @override
  String get notificationUpdateInstalledBody =>
      'Your app is now up to date. Restart to apply.';

  @override
  String get notificationCostApprovedTitle => 'Cost Submission Approved';

  @override
  String notificationCostApprovedBody(
    String siteId,
    String amount,
    String currency,
  ) {
    return 'Approved for site visit $siteId. Amount: $amount $currency';
  }

  @override
  String get notificationCostRejectedTitle => 'Cost Submission Rejected';

  @override
  String notificationCostRejectedBody(String siteId, String reason) {
    return 'Rejected for site visit $siteId. Reason: $reason';
  }

  @override
  String get notificationRevisionTitle => 'Revision Requested';

  @override
  String notificationRevisionBody(String siteId, String notes) {
    return 'Site visit $siteId needs revision. Notes: $notes';
  }

  @override
  String get notificationSyncCompletedTitle => 'Offline Sync Completed';

  @override
  String notificationSyncCompletedBody(int count) {
    return '$count submission(s) synchronized successfully.';
  }

  @override
  String get notificationBudgetAlertTitle => 'Budget Alert';

  @override
  String notificationBudgetAlertBody(
    String siteId,
    String amount,
    String currency,
  ) {
    return 'Remaining budget for $siteId: $amount $currency';
  }

  @override
  String get notificationNewMessageTitle => 'New Message';

  @override
  String get notificationSignatureVerifiedTitle => 'Signature Verified';

  @override
  String get notificationSignatureVerifiedBody =>
      'Your signature has been verified by admin.';

  @override
  String get notificationSignatureRejectedTitle => 'Signature Rejected';

  @override
  String get notificationSignatureRejectedBody =>
      'Your signature was rejected. Please submit a new one.';

  @override
  String get notificationSiteAssignedTitle => 'Site Visit Assigned';

  @override
  String notificationSiteAssignedBody(String siteName) {
    return 'You have been assigned to visit: $siteName';
  }

  @override
  String get notificationPaymentReceivedTitle => 'Payment Received';

  @override
  String notificationPaymentReceivedBody(String amount, String currency) {
    return 'You received $amount $currency.';
  }

  @override
  String get notificationApprovalRequiredTitle => 'Approval Required';

  @override
  String notificationApprovalRequiredBody(String itemType) {
    return 'A $itemType requires your approval.';
  }

  @override
  String get notificationSupportTicketTitle => 'Support Ticket Updated';

  @override
  String notificationSupportTicketBody(String ticketId) {
    return 'Your support ticket #$ticketId has been updated.';
  }

  @override
  String get notificationIncomingCallTitle => 'Incoming Call';

  @override
  String notificationIncomingCallBody(String callerName) {
    return '$callerName is calling you.';
  }

  @override
  String get notificationMissedCallTitle => 'Missed Call';

  @override
  String notificationMissedCallBody(String callerName) {
    return 'You missed a call from $callerName.';
  }

  @override
  String get mmpManagement => 'MMP Management';

  @override
  String get accessDenied => 'Access Denied';

  @override
  String get noPermission => 'You don\'t have permission to access this page.';

  @override
  String get myAssignments => 'My Assignments';

  @override
  String get claimManageComplete => 'Claim, manage, and complete site visits';

  @override
  String get searchSites => 'Search sites...';

  @override
  String get claimable => 'Claimable';

  @override
  String get assigned => 'Assigned';

  @override
  String get mySites => 'My Sites';

  @override
  String get inProgress => 'In Progress';

  @override
  String get claimSite => 'Claim Site';

  @override
  String get reclaimSite => 'Reclaim';

  @override
  String get completeVisit => 'Complete';

  @override
  String get viewReport => 'View Report';

  @override
  String get requestAdvance => 'Request Advance';

  @override
  String get acknowledgeCost => 'Acknowledge Cost';

  @override
  String get siteClaimedSuccess => 'Site claimed successfully!';

  @override
  String get siteReclaimedSuccess => 'Site reclaimed successfully';

  @override
  String get visitStartedSuccess => 'Visit started successfully';

  @override
  String get visitCompletedSuccess =>
      'Visit completed and report submitted successfully';

  @override
  String get errorOccurred => 'Error occurred';

  @override
  String get call => 'Call';

  @override
  String get sms => 'SMS';

  @override
  String get whatsapp => 'WhatsApp';

  @override
  String get state => 'State';

  @override
  String get locality => 'Locality';

  @override
  String get transportFee => 'Transport Fee';

  @override
  String get enumeratorFee => 'Enumerator Fee';

  @override
  String get totalCost => 'Total Cost';

  @override
  String get noSitesAvailable => 'No sites available';

  @override
  String get pullToRefresh => 'Pull to refresh';

  @override
  String get willSyncWhenOnline => 'Will sync when online';

  @override
  String get dispatched => 'Dispatched';

  @override
  String get onlyAdminsCanReclaim => 'Only admins can reclaim sites';

  @override
  String get releaseSiteToPool =>
      'Release this site back to the dispatch pool?';

  @override
  String get siteDetails => 'Site Details';

  @override
  String get visitDetails => 'Visit Details';

  @override
  String get auditTrail => 'Audit Trail';

  @override
  String get assignedTo => 'Assigned To';

  @override
  String get visitDate => 'Visit Date';

  @override
  String get project => 'Project';

  @override
  String get activity => 'Activity';

  @override
  String get cpName => 'CP Name';

  @override
  String get openInMaps => 'Open in Maps';

  @override
  String get noData => 'No data available';

  @override
  String get view => 'View';

  @override
  String get overdue => 'Overdue';

  @override
  String get inbox => 'Inbox';

  @override
  String get drafts => 'Drafts';

  @override
  String get outbox => 'Outbox';

  @override
  String get sent => 'Sent';

  @override
  String get accepted => 'Accepted';

  @override
  String get ongoing => 'Ongoing';

  @override
  String get whatsNew => 'What\'s New';

  @override
  String get newFeatures => 'New Features';

  @override
  String get bugFixes => 'Bug Fixes';

  @override
  String get improvements => 'Improvements';

  @override
  String get gotIt => 'Got it!';

  @override
  String get whatsNewFeature1 =>
      '🌍 Complete Bilingual Support (English/Arabic)';

  @override
  String get whatsNewFeature2 =>
      '📋 Language Toggle Button - Switch instantly in AppBar';

  @override
  String get whatsNewFeature3 =>
      '🏭 MMP Details Section - Shows main activity & status';

  @override
  String get whatsNewFeature4 =>
      '⚠️ Enumerator Fee Note - Guidance with approval requirements';

  @override
  String get whatsNewFix1 =>
      'Fixed Complete Visit Screen - Missing activity inputs now appear';

  @override
  String get whatsNewFix2 => 'Fixed language detection in all screens';

  @override
  String get whatsNewFix3 => 'Fixed RTL text field support for Arabic input';

  @override
  String get whatsNewImprovement1 =>
      'Activity selection now context-aware (GFA/CBT/PDM/MDM/WHM)';

  @override
  String get whatsNewImprovement2 =>
      'Warehouse input visibility improved (appears after fee summary)';

  @override
  String get whatsNewImprovement3 =>
      'Fee note alert now includes WFP AO approval requirements';

  @override
  String get bulkLocalityPermitVerification =>
      'Bulk Locality Permit Verification';

  @override
  String verifyLocalityRequirements(String locality, String state) {
    return 'Verify locality permit requirements for $locality, $state';
  }

  @override
  String sitesWillBeAffected(int count) {
    return '$count sites will be affected';
  }

  @override
  String get localityPermitQuestion =>
      'Do you require a Locality permit in this locality?';

  @override
  String get requirePermitHaveIt => 'Yes, it\'s required and I will upload it';

  @override
  String get haveLocalityPermitWillUpload =>
      'I have the locality permit and will upload it now';

  @override
  String get requirePermitDontHave =>
      'Yes, it\'s required but I don\'t have it';

  @override
  String get permitRequiredNotAvailable =>
      'The locality permit is required but not available';

  @override
  String get permitNotRequiredInLocality =>
      'Locality permit is not required in this locality';
}
