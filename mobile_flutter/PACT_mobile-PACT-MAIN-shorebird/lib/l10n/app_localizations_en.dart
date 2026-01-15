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
  String get ladderInspectionTip => 'Always inspect your ladder before use. Check for damage, missing parts, and proper functioning of all components.';

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
  String get needEquipmentInfo => 'I need information about equipment maintenance.';

  @override
  String get sureWhatEquipment => 'Sure! I can help with that. What specific equipment are you asking about?';

  @override
  String get excavatorSiteB => 'The excavator on site B.';

  @override
  String get maintenanceScheduleResponse => 'I\'ve pulled up the maintenance schedule for that excavator. Its next maintenance is due on September 20. Would you like me to send you the full maintenance details?';

  @override
  String get safetyAlert => 'Safety Alert';

  @override
  String get weatherWarningSiteA => 'Severe weather warning for Site A. All personnel should follow safety protocols and stay informed of updates.';

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
  String get enterReason => 'Enter reason';

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
}
