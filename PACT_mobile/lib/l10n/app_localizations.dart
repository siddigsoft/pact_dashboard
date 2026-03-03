import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en')
  ];

  /// The title of the application
  ///
  /// In en, this message translates to:
  /// **'PACT Mobile'**
  String get appTitle;

  /// Title for the available tasks screen
  ///
  /// In en, this message translates to:
  /// **'Available Tasks'**
  String get availableTasks;

  /// Title for the field operations screen
  ///
  /// In en, this message translates to:
  /// **'Field Operations'**
  String get fieldOperations;

  /// Subtitle showing number of tasks in area
  ///
  /// In en, this message translates to:
  /// **'{count} tasks in your area'**
  String tasksInArea(int count);

  /// Button text for accepting a task
  ///
  /// In en, this message translates to:
  /// **'Accept'**
  String get accept;

  /// Button text for declining a task
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get decline;

  /// Message when no tasks are available
  ///
  /// In en, this message translates to:
  /// **'No tasks available'**
  String get noTasksAvailable;

  /// Message encouraging user to check back later
  ///
  /// In en, this message translates to:
  /// **'Check back later for new tasks in your area'**
  String get checkBackLater;

  /// Login button text
  ///
  /// In en, this message translates to:
  /// **'Login'**
  String get login;

  /// Register button text
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get register;

  /// Email field label
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// Password field label
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// Confirm password field label
  ///
  /// In en, this message translates to:
  /// **'Confirm Password'**
  String get confirmPassword;

  /// Full name field label
  ///
  /// In en, this message translates to:
  /// **'Full Name'**
  String get fullName;

  /// Phone number field label
  ///
  /// In en, this message translates to:
  /// **'Phone Number'**
  String get phoneNumber;

  /// Welcome message
  ///
  /// In en, this message translates to:
  /// **'Welcome'**
  String get welcome;

  /// Welcome back message
  ///
  /// In en, this message translates to:
  /// **'Welcome Back'**
  String get welcomeBack;

  /// Sign in prompt
  ///
  /// In en, this message translates to:
  /// **'Sign in to continue'**
  String get signInToContinue;

  /// Create account prompt
  ///
  /// In en, this message translates to:
  /// **'Create Account'**
  String get createAccount;

  /// Button to show map view
  ///
  /// In en, this message translates to:
  /// **'Show Map'**
  String get showMap;

  /// Button to show tasks view
  ///
  /// In en, this message translates to:
  /// **'Show Tasks'**
  String get showTasks;

  /// Refresh button text
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refresh;

  /// Menu button text
  ///
  /// In en, this message translates to:
  /// **'Menu'**
  String get menu;

  /// Logout button text
  ///
  /// In en, this message translates to:
  /// **'Logout'**
  String get logout;

  /// Settings menu item
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settings;

  /// Language setting
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// English language name
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get english;

  /// Arabic language name
  ///
  /// In en, this message translates to:
  /// **'العربية'**
  String get arabic;

  /// High priority label
  ///
  /// In en, this message translates to:
  /// **'HIGH'**
  String get high;

  /// Medium priority label
  ///
  /// In en, this message translates to:
  /// **'MEDIUM'**
  String get medium;

  /// Low priority label
  ///
  /// In en, this message translates to:
  /// **'LOW'**
  String get low;

  /// Due date prefix
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get due;

  /// Distance suffix
  ///
  /// In en, this message translates to:
  /// **'km away'**
  String get kmAway;

  /// Home navigation tab
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get home;

  /// Forms navigation tab
  ///
  /// In en, this message translates to:
  /// **'Forms'**
  String get forms;

  /// Equipment navigation tab
  ///
  /// In en, this message translates to:
  /// **'Equipment'**
  String get equipment;

  /// Safety navigation tab
  ///
  /// In en, this message translates to:
  /// **'Safety'**
  String get safety;

  /// Chat navigation tab
  ///
  /// In en, this message translates to:
  /// **'Chat'**
  String get chat;

  /// Forgot password link text
  ///
  /// In en, this message translates to:
  /// **'Forgot Password?'**
  String get forgotPassword;

  /// Prompt to register
  ///
  /// In en, this message translates to:
  /// **'Don\'t have an account?'**
  String get dontHaveAccount;

  /// Prompt to login
  ///
  /// In en, this message translates to:
  /// **'Already have an account?'**
  String get alreadyHaveAccount;

  /// Sign in button text
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get signIn;

  /// Sign up button text
  ///
  /// In en, this message translates to:
  /// **'Sign Up'**
  String get signUp;

  /// Login screen subtitle
  ///
  /// In en, this message translates to:
  /// **'Sign in to your Pact Consultancy account'**
  String get signInToAccount;

  /// Sign in button text in caps
  ///
  /// In en, this message translates to:
  /// **'SIGN IN'**
  String get signInCaps;

  /// Create account button text in caps
  ///
  /// In en, this message translates to:
  /// **'CREATE ACCOUNT'**
  String get createAccountCaps;

  /// Section title for MMP files
  ///
  /// In en, this message translates to:
  /// **'MMP Files'**
  String get mmpFiles;

  /// Message when user needs to log in to view MMP files
  ///
  /// In en, this message translates to:
  /// **'Please log in to view MMP files'**
  String get pleaseLogInToViewMMPFiles;

  /// Log in button text
  ///
  /// In en, this message translates to:
  /// **'Log In'**
  String get logIn;

  /// Message when no MMP files are available
  ///
  /// In en, this message translates to:
  /// **'No MMP files available'**
  String get noMMPFilesAvailable;

  /// Error message when file URL is not available
  ///
  /// In en, this message translates to:
  /// **'No file URL available'**
  String get noFileUrlAvailable;

  /// Error message when file cannot be opened
  ///
  /// In en, this message translates to:
  /// **'Could not open file'**
  String get couldNotOpenFile;

  /// Error message for invalid URL format
  ///
  /// In en, this message translates to:
  /// **'Invalid file URL format'**
  String get invalidFileUrlFormat;

  /// Error message when accessing file URL fails
  ///
  /// In en, this message translates to:
  /// **'Error accessing file URL'**
  String get errorAccessingFileUrl;

  /// Dismiss button text for snackbar
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get dismiss;

  /// Dialog title for adding new equipment
  ///
  /// In en, this message translates to:
  /// **'Add New Equipment'**
  String get addNewEquipment;

  /// Equipment name field label
  ///
  /// In en, this message translates to:
  /// **'Equipment Name'**
  String get equipmentName;

  /// Equipment name field hint
  ///
  /// In en, this message translates to:
  /// **'Enter equipment name'**
  String get enterEquipmentName;

  /// Status field label
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get status;

  /// Next maintenance date field label
  ///
  /// In en, this message translates to:
  /// **'Next Maintenance Date'**
  String get nextMaintenanceDate;

  /// Date format hint
  ///
  /// In en, this message translates to:
  /// **'YYYY-MM-DD'**
  String get yyyyMmDd;

  /// Cancel button text
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// Add button text
  ///
  /// In en, this message translates to:
  /// **'Add'**
  String get add;

  /// Inspection form dialog title
  ///
  /// In en, this message translates to:
  /// **'Inspection Form'**
  String get inspectionForm;

  /// Condition field label
  ///
  /// In en, this message translates to:
  /// **'Condition'**
  String get condition;

  /// Condition field hint
  ///
  /// In en, this message translates to:
  /// **'Enter current condition'**
  String get enterCurrentCondition;

  /// Concerns field label
  ///
  /// In en, this message translates to:
  /// **'Concerns'**
  String get concerns;

  /// Concerns field hint
  ///
  /// In en, this message translates to:
  /// **'Enter any concerns'**
  String get enterAnyConcerns;

  /// Recommendations field label
  ///
  /// In en, this message translates to:
  /// **'Recommendations'**
  String get recommendations;

  /// Recommendations field hint
  ///
  /// In en, this message translates to:
  /// **'Enter recommendations'**
  String get enterRecommendations;

  /// Submit button text
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get submit;

  /// Filter equipment bottom sheet title
  ///
  /// In en, this message translates to:
  /// **'Filter Equipment'**
  String get filterEquipment;

  /// Search equipment dialog title
  ///
  /// In en, this message translates to:
  /// **'Search Equipment'**
  String get searchEquipment;

  /// Search equipment field hint
  ///
  /// In en, this message translates to:
  /// **'Enter equipment name'**
  String get enterEquipmentNameSearch;

  /// Close button text
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// All filter option
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get all;

  /// Available filter option
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get available;

  /// In Use filter option
  ///
  /// In en, this message translates to:
  /// **'In Use'**
  String get inUse;

  /// Needs Maintenance filter option
  ///
  /// In en, this message translates to:
  /// **'Needs Maintenance'**
  String get needsMaintenance;

  /// Empty state message for no equipment
  ///
  /// In en, this message translates to:
  /// **'No equipment found'**
  String get noEquipmentFound;

  /// Empty state instruction for adding equipment
  ///
  /// In en, this message translates to:
  /// **'Tap the + button to add equipment'**
  String get tapPlusButtonToAddEquipment;

  /// Next prefix for maintenance date
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get next;

  /// Checked-in status text
  ///
  /// In en, this message translates to:
  /// **'Checked-in'**
  String get checkedIn;

  /// Checked-out status text
  ///
  /// In en, this message translates to:
  /// **'Checked-out'**
  String get checkedOut;

  /// Next maintenance label
  ///
  /// In en, this message translates to:
  /// **'Next Maintenance'**
  String get nextMaintenance;

  /// Safety hub screen title
  ///
  /// In en, this message translates to:
  /// **'Safety Hub'**
  String get safetyHub;

  /// Information tooltip
  ///
  /// In en, this message translates to:
  /// **'Information'**
  String get information;

  /// Quick access section title
  ///
  /// In en, this message translates to:
  /// **'Quick Access'**
  String get quickAccess;

  /// Safety checklist item title
  ///
  /// In en, this message translates to:
  /// **'Safety Checklist'**
  String get safetyChecklist;

  /// Incident report item title
  ///
  /// In en, this message translates to:
  /// **'Incident Report'**
  String get incidentReport;

  /// Report incident screen title
  ///
  /// In en, this message translates to:
  /// **'Report Incident'**
  String get reportIncident;

  /// Regional helplines item title
  ///
  /// In en, this message translates to:
  /// **'Regional Helplines'**
  String get regionalHelplines;

  /// Safety tip of the day title
  ///
  /// In en, this message translates to:
  /// **'Safety Tip of the Day'**
  String get safetyTipOfTheDay;

  /// Safety tip content about ladder inspection
  ///
  /// In en, this message translates to:
  /// **'Always inspect your ladder before use. Check for damage, missing parts, and proper functioning of all components.'**
  String get ladderInspectionTip;

  /// View more tips button text
  ///
  /// In en, this message translates to:
  /// **'View More Tips'**
  String get viewMoreTips;

  /// Local police emergency contact
  ///
  /// In en, this message translates to:
  /// **'Local Police:999'**
  String get localPolice;

  /// PACT emergency contact
  ///
  /// In en, this message translates to:
  /// **'PACT Emergency:+256700000000'**
  String get pactEmergency;

  /// Medical emergency contact
  ///
  /// In en, this message translates to:
  /// **'Medical Emergency:911'**
  String get medicalEmergency;

  /// Chat greeting message
  ///
  /// In en, this message translates to:
  /// **'Hi there! How can I help you today?'**
  String get hiHowCanIHelp;

  /// Support sender name
  ///
  /// In en, this message translates to:
  /// **'PACT Support'**
  String get pactSupport;

  /// Sample chat message about equipment
  ///
  /// In en, this message translates to:
  /// **'I need information about equipment maintenance.'**
  String get needEquipmentInfo;

  /// Support response asking for equipment details
  ///
  /// In en, this message translates to:
  /// **'Sure! I can help with that. What specific equipment are you asking about?'**
  String get sureWhatEquipment;

  /// Sample message specifying equipment
  ///
  /// In en, this message translates to:
  /// **'The excavator on site B.'**
  String get excavatorSiteB;

  /// Support response with maintenance information
  ///
  /// In en, this message translates to:
  /// **'I\'ve pulled up the maintenance schedule for that excavator. Its next maintenance is due on September 20. Would you like me to send you the full maintenance details?'**
  String get maintenanceScheduleResponse;

  /// Safety alert title
  ///
  /// In en, this message translates to:
  /// **'Safety Alert'**
  String get safetyAlert;

  /// Weather warning alert content
  ///
  /// In en, this message translates to:
  /// **'Severe weather warning for Site A. All personnel should follow safety protocols and stay informed of updates.'**
  String get weatherWarningSiteA;

  /// Message input hint text
  ///
  /// In en, this message translates to:
  /// **'Type a message...'**
  String get typeAMessage;

  /// Wallet navigation tab
  ///
  /// In en, this message translates to:
  /// **'Wallet'**
  String get wallet;

  /// Help and support menu item
  ///
  /// In en, this message translates to:
  /// **'Help & Support'**
  String get helpAndSupport;

  /// Send feedback menu item
  ///
  /// In en, this message translates to:
  /// **'Send Feedback'**
  String get sendFeedback;

  /// About PACT menu item
  ///
  /// In en, this message translates to:
  /// **'About PACT'**
  String get aboutPact;

  /// Sync data menu item
  ///
  /// In en, this message translates to:
  /// **'Sync Data'**
  String get syncData;

  /// Sign out button text
  ///
  /// In en, this message translates to:
  /// **'Sign Out'**
  String get signOut;

  /// Draft status label
  ///
  /// In en, this message translates to:
  /// **'Draft'**
  String get draft;

  /// Complete button text
  ///
  /// In en, this message translates to:
  /// **'Complete'**
  String get complete;

  /// Save as draft button
  ///
  /// In en, this message translates to:
  /// **'Save as Draft'**
  String get saveAsDraft;

  /// Submit now button
  ///
  /// In en, this message translates to:
  /// **'Submit Now'**
  String get submitNow;

  /// Pending sync status
  ///
  /// In en, this message translates to:
  /// **'Pending Sync'**
  String get pendingSync;

  /// Synced status
  ///
  /// In en, this message translates to:
  /// **'Synced'**
  String get synced;

  /// Offline status
  ///
  /// In en, this message translates to:
  /// **'Offline'**
  String get offline;

  /// Online status
  ///
  /// In en, this message translates to:
  /// **'Online'**
  String get online;

  /// Offline mode label
  ///
  /// In en, this message translates to:
  /// **'Offline Mode'**
  String get offlineMode;

  /// Site visit label
  ///
  /// In en, this message translates to:
  /// **'Site Visit'**
  String get siteVisit;

  /// Site visit hub title
  ///
  /// In en, this message translates to:
  /// **'Site Visit Hub'**
  String get siteVisitHub;

  /// Completed sites counter label
  ///
  /// In en, this message translates to:
  /// **'Completed Sites'**
  String get completedSites;

  /// Pending payments label
  ///
  /// In en, this message translates to:
  /// **'Pending Payments'**
  String get pendingPayments;

  /// Total earnings label
  ///
  /// In en, this message translates to:
  /// **'Total Earnings'**
  String get totalEarnings;

  /// Payment methods section
  ///
  /// In en, this message translates to:
  /// **'Payment Methods'**
  String get paymentMethods;

  /// Cost submissions tab
  ///
  /// In en, this message translates to:
  /// **'Cost Submissions'**
  String get costSubmissions;

  /// Transactions tab
  ///
  /// In en, this message translates to:
  /// **'Transactions'**
  String get transactions;

  /// Login help link
  ///
  /// In en, this message translates to:
  /// **'Having trouble signing in?'**
  String get havingTroubleSigningIn;

  /// Login troubleshooting dialog title
  ///
  /// In en, this message translates to:
  /// **'Login Troubleshooting'**
  String get loginTroubleshooting;

  /// Contact support section
  ///
  /// In en, this message translates to:
  /// **'Contact Support'**
  String get contactSupport;

  /// Report bug option
  ///
  /// In en, this message translates to:
  /// **'Report a Bug'**
  String get reportBug;

  /// Common errors section
  ///
  /// In en, this message translates to:
  /// **'Common Errors'**
  String get commonErrors;

  /// Help search placeholder
  ///
  /// In en, this message translates to:
  /// **'Search help articles...'**
  String get searchHelp;

  /// No search results message
  ///
  /// In en, this message translates to:
  /// **'No results found'**
  String get noResultsFound;

  /// Help subtitle
  ///
  /// In en, this message translates to:
  /// **'Get help and find answers'**
  String get getHelpAndFindAnswers;

  /// Feedback subtitle
  ///
  /// In en, this message translates to:
  /// **'Share your thoughts'**
  String get shareYourThoughts;

  /// About PACT subtitle
  ///
  /// In en, this message translates to:
  /// **'Learn more about us'**
  String get learnMoreAboutUs;

  /// Sync data subtitle
  ///
  /// In en, this message translates to:
  /// **'Update local data'**
  String get updateLocalData;

  /// PACT Dashboard menu item
  ///
  /// In en, this message translates to:
  /// **'PACT Dashboard'**
  String get pactDashboard;

  /// PACT Dashboard subtitle
  ///
  /// In en, this message translates to:
  /// **'View on web'**
  String get viewOnWeb;

  /// Version label
  ///
  /// In en, this message translates to:
  /// **'Version'**
  String get version;

  /// Build label
  ///
  /// In en, this message translates to:
  /// **'Build'**
  String get build;

  /// Voice call button
  ///
  /// In en, this message translates to:
  /// **'Voice Call'**
  String get voiceCall;

  /// Video call button
  ///
  /// In en, this message translates to:
  /// **'Video Call'**
  String get videoCall;

  /// End call button
  ///
  /// In en, this message translates to:
  /// **'End Call'**
  String get endCall;

  /// Incoming call notification
  ///
  /// In en, this message translates to:
  /// **'Incoming Call'**
  String get incomingCall;

  /// Calling status
  ///
  /// In en, this message translates to:
  /// **'Calling...'**
  String get calling;

  /// Ringing status
  ///
  /// In en, this message translates to:
  /// **'Ringing...'**
  String get ringing;

  /// Call connected status
  ///
  /// In en, this message translates to:
  /// **'Connected'**
  String get connected;

  /// Call ended status
  ///
  /// In en, this message translates to:
  /// **'Call ended'**
  String get callEnded;

  /// Mute button
  ///
  /// In en, this message translates to:
  /// **'Mute'**
  String get mute;

  /// Unmute button
  ///
  /// In en, this message translates to:
  /// **'Unmute'**
  String get unmute;

  /// Speaker button
  ///
  /// In en, this message translates to:
  /// **'Speaker'**
  String get speaker;

  /// Camera option for file picker
  ///
  /// In en, this message translates to:
  /// **'Camera'**
  String get camera;

  /// Notifications screen title
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notifications;

  /// Mark all notifications as read
  ///
  /// In en, this message translates to:
  /// **'Mark all as read'**
  String get markAllAsRead;

  /// No notifications message
  ///
  /// In en, this message translates to:
  /// **'No notifications'**
  String get noNotifications;

  /// Today label
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get today;

  /// Yesterday label
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get yesterday;

  /// Earlier label
  ///
  /// In en, this message translates to:
  /// **'Earlier'**
  String get earlier;

  /// Reports screen title
  ///
  /// In en, this message translates to:
  /// **'Reports'**
  String get reports;

  /// Visit reports section
  ///
  /// In en, this message translates to:
  /// **'Visit Reports'**
  String get visitReports;

  /// Filter by date option
  ///
  /// In en, this message translates to:
  /// **'Filter by Date'**
  String get filterByDate;

  /// Filter by month option
  ///
  /// In en, this message translates to:
  /// **'Filter by Month'**
  String get filterByMonth;

  /// Filter by year option
  ///
  /// In en, this message translates to:
  /// **'Filter by Year'**
  String get filterByYear;

  /// Date label
  ///
  /// In en, this message translates to:
  /// **'Date'**
  String get date;

  /// Month label
  ///
  /// In en, this message translates to:
  /// **'Month'**
  String get month;

  /// Year label
  ///
  /// In en, this message translates to:
  /// **'Year'**
  String get year;

  /// No reports message
  ///
  /// In en, this message translates to:
  /// **'No reports found'**
  String get noReportsFound;

  /// Download report button
  ///
  /// In en, this message translates to:
  /// **'Download Report'**
  String get downloadReport;

  /// Share report button
  ///
  /// In en, this message translates to:
  /// **'Share Report'**
  String get shareReport;

  /// Duration label
  ///
  /// In en, this message translates to:
  /// **'Duration'**
  String get duration;

  /// Minutes unit
  ///
  /// In en, this message translates to:
  /// **'minutes'**
  String get minutes;

  /// Final location label
  ///
  /// In en, this message translates to:
  /// **'Final Location'**
  String get finalLocation;

  /// Coordinates label
  ///
  /// In en, this message translates to:
  /// **'Coordinates'**
  String get coordinates;

  /// Accuracy label
  ///
  /// In en, this message translates to:
  /// **'Accuracy'**
  String get accuracy;

  /// Notes label
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get notes;

  /// No notes message
  ///
  /// In en, this message translates to:
  /// **'No notes'**
  String get noNotes;

  /// Activities label
  ///
  /// In en, this message translates to:
  /// **'Activities'**
  String get activities;

  /// Photos label
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get photos;

  /// Report footer
  ///
  /// In en, this message translates to:
  /// **'Generated by PACT Mobile'**
  String get generatedByPact;

  /// Error loading visits message
  ///
  /// In en, this message translates to:
  /// **'Error loading visits'**
  String get errorLoadingVisits;

  /// Error downloading report message
  ///
  /// In en, this message translates to:
  /// **'Error downloading report'**
  String get errorDownloadingReport;

  /// Visits this month summary
  ///
  /// In en, this message translates to:
  /// **'Visits this month'**
  String get visitsThisMonth;

  /// Visits this year summary
  ///
  /// In en, this message translates to:
  /// **'Visits this year'**
  String get visitsThisYear;

  /// Total visits summary
  ///
  /// In en, this message translates to:
  /// **'Total visits'**
  String get totalVisits;

  /// View details button
  ///
  /// In en, this message translates to:
  /// **'View Details'**
  String get viewDetails;

  /// Completed status
  ///
  /// In en, this message translates to:
  /// **'Completed'**
  String get completed;

  /// Pending status
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get pending;

  /// Approved status
  ///
  /// In en, this message translates to:
  /// **'Approved'**
  String get approved;

  /// Rejected status
  ///
  /// In en, this message translates to:
  /// **'Rejected'**
  String get rejected;

  /// Cancelled status
  ///
  /// In en, this message translates to:
  /// **'Cancelled'**
  String get cancelled;

  /// Under review status
  ///
  /// In en, this message translates to:
  /// **'Under Review'**
  String get underReview;

  /// Paid status
  ///
  /// In en, this message translates to:
  /// **'Paid'**
  String get paid;

  /// Balance label
  ///
  /// In en, this message translates to:
  /// **'Balance'**
  String get balance;

  /// Earnings label
  ///
  /// In en, this message translates to:
  /// **'Earnings'**
  String get earnings;

  /// Withdrawals label
  ///
  /// In en, this message translates to:
  /// **'Withdrawals'**
  String get withdrawals;

  /// Withdraw funds button
  ///
  /// In en, this message translates to:
  /// **'Withdraw Funds'**
  String get withdrawFunds;

  /// Request withdrawal button
  ///
  /// In en, this message translates to:
  /// **'Request Withdrawal'**
  String get requestWithdrawal;

  /// Amount label
  ///
  /// In en, this message translates to:
  /// **'Amount'**
  String get amount;

  /// Enter amount hint
  ///
  /// In en, this message translates to:
  /// **'Enter amount'**
  String get enterAmount;

  /// Reason label
  ///
  /// In en, this message translates to:
  /// **'Reason'**
  String get reason;

  /// Enter reason hint
  ///
  /// In en, this message translates to:
  /// **'Please enter a reason'**
  String get enterReason;

  /// Select payment method prompt
  ///
  /// In en, this message translates to:
  /// **'Select payment method'**
  String get selectPaymentMethod;

  /// Add payment method button
  ///
  /// In en, this message translates to:
  /// **'Add Payment Method'**
  String get addPaymentMethod;

  /// No payment methods message
  ///
  /// In en, this message translates to:
  /// **'No payment methods'**
  String get noPaymentMethods;

  /// Bank account option
  ///
  /// In en, this message translates to:
  /// **'Bank Account'**
  String get bankAccount;

  /// Mobile money option
  ///
  /// In en, this message translates to:
  /// **'Mobile Money'**
  String get mobileMoney;

  /// Debit card option
  ///
  /// In en, this message translates to:
  /// **'Debit/Credit Card'**
  String get debitCard;

  /// Account number label
  ///
  /// In en, this message translates to:
  /// **'Account Number'**
  String get accountNumber;

  /// Bank name label
  ///
  /// In en, this message translates to:
  /// **'Bank Name'**
  String get bankName;

  /// Phone number for mobile money
  ///
  /// In en, this message translates to:
  /// **'Phone Number'**
  String get phoneNumberForMoney;

  /// Provider name label
  ///
  /// In en, this message translates to:
  /// **'Provider Name'**
  String get providerName;

  /// Cardholder name label
  ///
  /// In en, this message translates to:
  /// **'Cardholder Name'**
  String get cardholderName;

  /// Card number label
  ///
  /// In en, this message translates to:
  /// **'Card Number'**
  String get cardNumber;

  /// Set as default button
  ///
  /// In en, this message translates to:
  /// **'Set as Default'**
  String get setAsDefault;

  /// Default payment indicator
  ///
  /// In en, this message translates to:
  /// **'Default'**
  String get defaultPayment;

  /// Remove button
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get remove;

  /// Unknown label
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get unknown;

  /// Confirm delete dialog title
  ///
  /// In en, this message translates to:
  /// **'Confirm Delete'**
  String get confirmDelete;

  /// Are you sure prompt
  ///
  /// In en, this message translates to:
  /// **'Are you sure?'**
  String get areYouSure;

  /// Delete button
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get delete;

  /// Save button
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get save;

  /// Edit button
  ///
  /// In en, this message translates to:
  /// **'Edit'**
  String get edit;

  /// Search button/label
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get search;

  /// Filter button
  ///
  /// In en, this message translates to:
  /// **'Filter'**
  String get filter;

  /// Sort button
  ///
  /// In en, this message translates to:
  /// **'Sort'**
  String get sort;

  /// Loading message
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get loading;

  /// Retry button
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retry;

  /// Error label
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get error;

  /// Success label
  ///
  /// In en, this message translates to:
  /// **'Success'**
  String get success;

  /// Warning label
  ///
  /// In en, this message translates to:
  /// **'Warning'**
  String get warning;

  /// Info label
  ///
  /// In en, this message translates to:
  /// **'Info'**
  String get info;

  /// OK button
  ///
  /// In en, this message translates to:
  /// **'OK'**
  String get ok;

  /// Yes button
  ///
  /// In en, this message translates to:
  /// **'Yes'**
  String get yes;

  /// No button
  ///
  /// In en, this message translates to:
  /// **'No'**
  String get no;

  /// Confirm button
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// Back button
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get back;

  /// Done button
  ///
  /// In en, this message translates to:
  /// **'Done'**
  String get done;

  /// Continue button
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueText;

  /// Skip button
  ///
  /// In en, this message translates to:
  /// **'Skip'**
  String get skip;

  /// Site code label
  ///
  /// In en, this message translates to:
  /// **'Site Code'**
  String get siteCode;

  /// Site name label
  ///
  /// In en, this message translates to:
  /// **'Site Name'**
  String get siteName;

  /// Village label
  ///
  /// In en, this message translates to:
  /// **'Village'**
  String get village;

  /// District label
  ///
  /// In en, this message translates to:
  /// **'District'**
  String get district;

  /// Region label
  ///
  /// In en, this message translates to:
  /// **'Region'**
  String get region;

  /// Household label
  ///
  /// In en, this message translates to:
  /// **'Household'**
  String get household;

  /// MMP code label
  ///
  /// In en, this message translates to:
  /// **'MMP Code'**
  String get mmpCode;

  /// Start visit button
  ///
  /// In en, this message translates to:
  /// **'Start Visit'**
  String get startVisit;

  /// Continue visit button
  ///
  /// In en, this message translates to:
  /// **'Continue Visit'**
  String get continueVisit;

  /// End visit button
  ///
  /// In en, this message translates to:
  /// **'End Visit'**
  String get endVisit;

  /// GPS accuracy label
  ///
  /// In en, this message translates to:
  /// **'GPS Accuracy'**
  String get gpsAccuracy;

  /// Meters unit
  ///
  /// In en, this message translates to:
  /// **'meters'**
  String get meters;

  /// Required field validation message
  ///
  /// In en, this message translates to:
  /// **'This field is required'**
  String get requiredField;

  /// Invalid email validation message
  ///
  /// In en, this message translates to:
  /// **'Invalid email address'**
  String get invalidEmail;

  /// Password too short validation message
  ///
  /// In en, this message translates to:
  /// **'Password must be at least 8 characters'**
  String get passwordTooShort;

  /// Passwords do not match validation message
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match'**
  String get passwordsDoNotMatch;

  /// State permit label
  ///
  /// In en, this message translates to:
  /// **'State Permit'**
  String get statePermit;

  /// Locality permit label
  ///
  /// In en, this message translates to:
  /// **'Locality Permit'**
  String get localityPermit;

  /// Federal permit label
  ///
  /// In en, this message translates to:
  /// **'Federal Permit'**
  String get federalPermit;

  /// Permit required message
  ///
  /// In en, this message translates to:
  /// **'Permit Required'**
  String get permitRequired;

  /// Option: permit is not required
  ///
  /// In en, this message translates to:
  /// **'No, it\'s not a requirement'**
  String get permitNotRequired;

  /// Upload state permit button
  ///
  /// In en, this message translates to:
  /// **'Upload State Permit'**
  String get uploadStatePermit;

  /// Upload locality permit button
  ///
  /// In en, this message translates to:
  /// **'Upload Locality Permit'**
  String get uploadLocalityPermit;

  /// State permit required title
  ///
  /// In en, this message translates to:
  /// **'State Permit Required'**
  String get statePermitRequired;

  /// State permit required description
  ///
  /// In en, this message translates to:
  /// **'Only the Federal permit has been uploaded. Upload the {state} state permit to continue.'**
  String statePermitDescription(String state);

  /// Locality permit required title
  ///
  /// In en, this message translates to:
  /// **'Locality Permit Required'**
  String get localityPermitRequired;

  /// Locality permit required description
  ///
  /// In en, this message translates to:
  /// **'Please upload the locality permit for {locality} to continue.'**
  String localityPermitDescription(String locality);

  /// Button to select a file
  ///
  /// In en, this message translates to:
  /// **'Select File'**
  String get selectFile;

  /// Permit file label
  ///
  /// In en, this message translates to:
  /// **'Permit File'**
  String get permitFile;

  /// Issue date label
  ///
  /// In en, this message translates to:
  /// **'Issue Date'**
  String get issueDate;

  /// Expiry date label
  ///
  /// In en, this message translates to:
  /// **'Expiry Date'**
  String get expiryDate;

  /// Comments label
  ///
  /// In en, this message translates to:
  /// **'Comments'**
  String get comments;

  /// Add comments optional placeholder
  ///
  /// In en, this message translates to:
  /// **'Add comments (optional)'**
  String get addCommentsOptional;

  /// Upload permit button
  ///
  /// In en, this message translates to:
  /// **'Upload Permit'**
  String get uploadPermit;

  /// Uploading status
  ///
  /// In en, this message translates to:
  /// **'Uploading...'**
  String get uploading;

  /// Permit upload success message
  ///
  /// In en, this message translates to:
  /// **'Permit uploaded successfully'**
  String get permitUploadSuccess;

  /// Permit upload error message
  ///
  /// In en, this message translates to:
  /// **'Failed to upload permit'**
  String get permitUploadError;

  /// Invalid file type error
  ///
  /// In en, this message translates to:
  /// **'Invalid file type'**
  String get invalidFileType;

  /// File too large error
  ///
  /// In en, this message translates to:
  /// **'File too large'**
  String get fileTooLarge;

  /// Select PDF or image instruction
  ///
  /// In en, this message translates to:
  /// **'Please select a PDF or image file (JPG, PNG)'**
  String get selectPdfOrImage;

  /// Max file size message
  ///
  /// In en, this message translates to:
  /// **'Maximum file size: {size} MB'**
  String maxFileSize(int size);

  /// Dates required error
  ///
  /// In en, this message translates to:
  /// **'Issue and expiry dates are required'**
  String get datesRequired;

  /// Expiry after issue date error
  ///
  /// In en, this message translates to:
  /// **'Expiry date must be after issue date'**
  String get expiryAfterIssue;

  /// Show preview button
  ///
  /// In en, this message translates to:
  /// **'Show Preview'**
  String get showPreview;

  /// Hide preview button
  ///
  /// In en, this message translates to:
  /// **'Hide Preview'**
  String get hidePreview;

  /// Clear file button
  ///
  /// In en, this message translates to:
  /// **'Clear File'**
  String get clearFile;

  /// Permit verification title
  ///
  /// In en, this message translates to:
  /// **'Permit Verification'**
  String get permitVerification;

  /// Verify permits button
  ///
  /// In en, this message translates to:
  /// **'Verify Permits'**
  String get verifyPermits;

  /// Permits attached status
  ///
  /// In en, this message translates to:
  /// **'Permits Attached'**
  String get permitsAttached;

  /// Pending verification status
  ///
  /// In en, this message translates to:
  /// **'Pending Verification'**
  String get pendingVerification;

  /// Verified status
  ///
  /// In en, this message translates to:
  /// **'Verified'**
  String get verified;

  /// State permit attached status
  ///
  /// In en, this message translates to:
  /// **'State Permit Attached'**
  String get statePermitAttached;

  /// Locality permit attached status
  ///
  /// In en, this message translates to:
  /// **'Locality Permit Attached'**
  String get localityPermitAttached;

  /// Do you have state permit question
  ///
  /// In en, this message translates to:
  /// **'Do you have the state permit for {state}?'**
  String doYouHaveStatePermit(String state);

  /// Do you have locality permit question
  ///
  /// In en, this message translates to:
  /// **'Do you have the locality permit for {locality}?'**
  String doYouHaveLocalityPermit(String locality);

  /// Yes I have the permit option
  ///
  /// In en, this message translates to:
  /// **'Yes, I have the permit'**
  String get yesHaveIt;

  /// Required but don't have option
  ///
  /// In en, this message translates to:
  /// **'Required but I don\'t have it'**
  String get noRequiredDontHave;

  /// Not required in this locality option
  ///
  /// In en, this message translates to:
  /// **'Not required in this locality'**
  String get notRequiredInLocality;

  /// Can proceed without permit question
  ///
  /// In en, this message translates to:
  /// **'Can you proceed without the permit?'**
  String get canProceedWithout;

  /// Yes can proceed without option
  ///
  /// In en, this message translates to:
  /// **'Yes, I can proceed'**
  String get yesProceedWithout;

  /// No cannot proceed without option
  ///
  /// In en, this message translates to:
  /// **'No, I need the permit'**
  String get noCannotProceed;

  /// Send back to FOM button
  ///
  /// In en, this message translates to:
  /// **'Send Back to FOM'**
  String get sendBackToFom;

  /// Site verification title
  ///
  /// In en, this message translates to:
  /// **'Site Verification'**
  String get siteVerification;

  /// Verify site button
  ///
  /// In en, this message translates to:
  /// **'Verify Site'**
  String get verifySite;

  /// Return to FOM button
  ///
  /// In en, this message translates to:
  /// **'Return to FOM'**
  String get returnToFom;

  /// Pending sites tab
  ///
  /// In en, this message translates to:
  /// **'Pending Sites'**
  String get pendingSites;

  /// CP Verification tab
  ///
  /// In en, this message translates to:
  /// **'CP Verification'**
  String get cpVerification;

  /// Verified sites tab
  ///
  /// In en, this message translates to:
  /// **'Verified Sites'**
  String get verifiedSites;

  /// Sites needing state permit count
  ///
  /// In en, this message translates to:
  /// **'{count} sites need state permit'**
  String sitesNeedStatePermit(int count);

  /// Sites needing locality permit count
  ///
  /// In en, this message translates to:
  /// **'{count} sites need locality permit'**
  String sitesNeedLocalityPermit(int count);

  /// Step 1 select file
  ///
  /// In en, this message translates to:
  /// **'Step 1: Select File'**
  String get step1SelectFile;

  /// Step 2 enter dates
  ///
  /// In en, this message translates to:
  /// **'Step 2: Enter Dates'**
  String get step2EnterDates;

  /// Step 3 add comments
  ///
  /// In en, this message translates to:
  /// **'Step 3: Add Comments (Optional)'**
  String get step3AddComments;

  /// Step 4 upload
  ///
  /// In en, this message translates to:
  /// **'Step 4: Upload Permit'**
  String get step4Upload;

  /// Tap to select file instruction
  ///
  /// In en, this message translates to:
  /// **'Tap to select file'**
  String get tapToSelectFile;

  /// Supported formats list
  ///
  /// In en, this message translates to:
  /// **'Supported formats: PDF, JPG, PNG'**
  String get supportedFormats;

  /// File selected message
  ///
  /// In en, this message translates to:
  /// **'File selected: {fileName}'**
  String fileSelected(String fileName);

  /// Gallery option for file picker
  ///
  /// In en, this message translates to:
  /// **'Gallery'**
  String get gallery;

  /// PDF document option
  ///
  /// In en, this message translates to:
  /// **'PDF Document'**
  String get pdfDocument;

  /// Subtitle for yes have permit option
  ///
  /// In en, this message translates to:
  /// **'I will upload the permit document'**
  String get willUploadPermit;

  /// Subtitle for required but don't have option
  ///
  /// In en, this message translates to:
  /// **'The permit is required but I cannot provide it now'**
  String get cannotProvideNow;

  /// Subtitle for not required option
  ///
  /// In en, this message translates to:
  /// **'No locality permit is needed for operations here'**
  String get noPermitNeeded;

  /// Subtitle for yes proceed option
  ///
  /// In en, this message translates to:
  /// **'Continue without the locality permit'**
  String get continueWithoutPermit;

  /// Subtitle for no cannot proceed option
  ///
  /// In en, this message translates to:
  /// **'Send back to Field Operations Manager'**
  String get sendBackToManager;

  /// Follow up question description
  ///
  /// In en, this message translates to:
  /// **'Choose how to proceed for {count} {sitesLabel} in {locality}:'**
  String chooseHowToProceed(int count, String sitesLabel, String locality);

  /// Single site label
  ///
  /// In en, this message translates to:
  /// **'site'**
  String get site;

  /// Multiple sites label
  ///
  /// In en, this message translates to:
  /// **'sites'**
  String get sites;

  /// Upload failed message
  ///
  /// In en, this message translates to:
  /// **'Upload failed'**
  String get uploadFailed;

  /// Database update failed message
  ///
  /// In en, this message translates to:
  /// **'Database update failed. Please try again.'**
  String get databaseUpdateFailed;

  /// Select date placeholder
  ///
  /// In en, this message translates to:
  /// **'Select date'**
  String get selectDate;

  /// Title for bulk state permit upload dialog
  ///
  /// In en, this message translates to:
  /// **'Bulk State Permit Upload'**
  String get bulkStatePermitUpload;

  /// Title for bulk locality permit upload dialog
  ///
  /// In en, this message translates to:
  /// **'Bulk Locality Permit Upload'**
  String get bulkLocalityPermitUpload;

  /// Label for number of states selected
  ///
  /// In en, this message translates to:
  /// **'states selected'**
  String get statesSelected;

  /// Label for number of localities selected
  ///
  /// In en, this message translates to:
  /// **'localities selected'**
  String get localitiesSelected;

  /// Instructions for bulk upload
  ///
  /// In en, this message translates to:
  /// **'Select files and dates for each state. Only states with complete information will be uploaded.'**
  String get bulkUploadInstructions;

  /// Instructions for bulk locality upload
  ///
  /// In en, this message translates to:
  /// **'Select files and dates for each locality. Only localities with complete information will be uploaded.'**
  String get bulkLocalityUploadInstructions;

  /// Error message when no permits are ready
  ///
  /// In en, this message translates to:
  /// **'No permits ready for upload'**
  String get noPermitsReady;

  /// Status label for ready items
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get ready;

  /// Status label for uploaded items
  ///
  /// In en, this message translates to:
  /// **'Uploaded'**
  String get uploaded;

  /// Status label for failed items
  ///
  /// In en, this message translates to:
  /// **'Failed'**
  String get failed;

  /// Button to upload all ready permits
  ///
  /// In en, this message translates to:
  /// **'Upload All'**
  String get uploadAll;

  /// Notification title for app update
  ///
  /// In en, this message translates to:
  /// **'App Update Available'**
  String get notificationAppUpdateTitle;

  /// Notification body for app update
  ///
  /// In en, this message translates to:
  /// **'A new version ({version}) is ready. Tap to update!'**
  String notificationAppUpdateBody(String version);

  /// Notification title for downloading update
  ///
  /// In en, this message translates to:
  /// **'Downloading Update'**
  String get notificationDownloadingTitle;

  /// Notification body for downloading update
  ///
  /// In en, this message translates to:
  /// **'Please wait...'**
  String get notificationDownloadingBody;

  /// Notification title for update installed
  ///
  /// In en, this message translates to:
  /// **'Update Installed'**
  String get notificationUpdateInstalledTitle;

  /// Notification body for update installed
  ///
  /// In en, this message translates to:
  /// **'Your app is now up to date. Restart to apply.'**
  String get notificationUpdateInstalledBody;

  /// Notification title for cost approved
  ///
  /// In en, this message translates to:
  /// **'Cost Submission Approved'**
  String get notificationCostApprovedTitle;

  /// Notification body for cost approved
  ///
  /// In en, this message translates to:
  /// **'Approved for site visit {siteId}. Amount: {amount} {currency}'**
  String notificationCostApprovedBody(String siteId, String amount, String currency);

  /// Notification title for cost rejected
  ///
  /// In en, this message translates to:
  /// **'Cost Submission Rejected'**
  String get notificationCostRejectedTitle;

  /// Notification body for cost rejected
  ///
  /// In en, this message translates to:
  /// **'Rejected for site visit {siteId}. Reason: {reason}'**
  String notificationCostRejectedBody(String siteId, String reason);

  /// Notification title for revision requested
  ///
  /// In en, this message translates to:
  /// **'Revision Requested'**
  String get notificationRevisionTitle;

  /// Notification body for revision requested
  ///
  /// In en, this message translates to:
  /// **'Site visit {siteId} needs revision. Notes: {notes}'**
  String notificationRevisionBody(String siteId, String notes);

  /// Notification title for sync completed
  ///
  /// In en, this message translates to:
  /// **'Offline Sync Completed'**
  String get notificationSyncCompletedTitle;

  /// Notification body for sync completed
  ///
  /// In en, this message translates to:
  /// **'{count} submission(s) synchronized successfully.'**
  String notificationSyncCompletedBody(int count);

  /// Notification title for budget alert
  ///
  /// In en, this message translates to:
  /// **'Budget Alert'**
  String get notificationBudgetAlertTitle;

  /// Notification body for budget alert
  ///
  /// In en, this message translates to:
  /// **'Remaining budget for {siteId}: {amount} {currency}'**
  String notificationBudgetAlertBody(String siteId, String amount, String currency);

  /// Notification title for new message
  ///
  /// In en, this message translates to:
  /// **'New Message'**
  String get notificationNewMessageTitle;

  /// Notification title for signature verified
  ///
  /// In en, this message translates to:
  /// **'Signature Verified'**
  String get notificationSignatureVerifiedTitle;

  /// Notification body for signature verified
  ///
  /// In en, this message translates to:
  /// **'Your signature has been verified by admin.'**
  String get notificationSignatureVerifiedBody;

  /// Notification title for signature rejected
  ///
  /// In en, this message translates to:
  /// **'Signature Rejected'**
  String get notificationSignatureRejectedTitle;

  /// Notification body for signature rejected
  ///
  /// In en, this message translates to:
  /// **'Your signature was rejected. Please submit a new one.'**
  String get notificationSignatureRejectedBody;

  /// Notification title for site visit assigned
  ///
  /// In en, this message translates to:
  /// **'Site Visit Assigned'**
  String get notificationSiteAssignedTitle;

  /// Notification body for site visit assigned
  ///
  /// In en, this message translates to:
  /// **'You have been assigned to visit: {siteName}'**
  String notificationSiteAssignedBody(String siteName);

  /// Notification title for payment received
  ///
  /// In en, this message translates to:
  /// **'Payment Received'**
  String get notificationPaymentReceivedTitle;

  /// Notification body for payment received
  ///
  /// In en, this message translates to:
  /// **'You received {amount} {currency}.'**
  String notificationPaymentReceivedBody(String amount, String currency);

  /// Notification title for approval required
  ///
  /// In en, this message translates to:
  /// **'Approval Required'**
  String get notificationApprovalRequiredTitle;

  /// Notification body for approval required
  ///
  /// In en, this message translates to:
  /// **'A {itemType} requires your approval.'**
  String notificationApprovalRequiredBody(String itemType);

  /// Notification title for support ticket update
  ///
  /// In en, this message translates to:
  /// **'Support Ticket Updated'**
  String get notificationSupportTicketTitle;

  /// Notification body for support ticket update
  ///
  /// In en, this message translates to:
  /// **'Your support ticket #{ticketId} has been updated.'**
  String notificationSupportTicketBody(String ticketId);

  /// Notification title for incoming call
  ///
  /// In en, this message translates to:
  /// **'Incoming Call'**
  String get notificationIncomingCallTitle;

  /// Notification body for incoming call
  ///
  /// In en, this message translates to:
  /// **'{callerName} is calling you.'**
  String notificationIncomingCallBody(String callerName);

  /// Notification title for missed call
  ///
  /// In en, this message translates to:
  /// **'Missed Call'**
  String get notificationMissedCallTitle;

  /// Notification body for missed call
  ///
  /// In en, this message translates to:
  /// **'You missed a call from {callerName}.'**
  String notificationMissedCallBody(String callerName);

  /// No description provided for @mmpManagement.
  ///
  /// In en, this message translates to:
  /// **'MMP Management'**
  String get mmpManagement;

  /// No description provided for @accessDenied.
  ///
  /// In en, this message translates to:
  /// **'Access Denied'**
  String get accessDenied;

  /// No description provided for @noPermission.
  ///
  /// In en, this message translates to:
  /// **'You don\'t have permission to access this page.'**
  String get noPermission;

  /// No description provided for @myAssignments.
  ///
  /// In en, this message translates to:
  /// **'My Assignments'**
  String get myAssignments;

  /// No description provided for @claimManageComplete.
  ///
  /// In en, this message translates to:
  /// **'Claim, manage, and complete site visits'**
  String get claimManageComplete;

  /// No description provided for @searchSites.
  ///
  /// In en, this message translates to:
  /// **'Search sites...'**
  String get searchSites;

  /// No description provided for @claimable.
  ///
  /// In en, this message translates to:
  /// **'Claimable'**
  String get claimable;

  /// No description provided for @assigned.
  ///
  /// In en, this message translates to:
  /// **'Assigned'**
  String get assigned;

  /// No description provided for @mySites.
  ///
  /// In en, this message translates to:
  /// **'My Sites'**
  String get mySites;

  /// No description provided for @inProgress.
  ///
  /// In en, this message translates to:
  /// **'In Progress'**
  String get inProgress;

  /// No description provided for @claimSite.
  ///
  /// In en, this message translates to:
  /// **'Claim Site'**
  String get claimSite;

  /// No description provided for @reclaimSite.
  ///
  /// In en, this message translates to:
  /// **'Reclaim'**
  String get reclaimSite;

  /// No description provided for @completeVisit.
  ///
  /// In en, this message translates to:
  /// **'Complete'**
  String get completeVisit;

  /// No description provided for @viewReport.
  ///
  /// In en, this message translates to:
  /// **'View Report'**
  String get viewReport;

  /// No description provided for @requestAdvance.
  ///
  /// In en, this message translates to:
  /// **'Request Advance'**
  String get requestAdvance;

  /// No description provided for @acknowledgeCost.
  ///
  /// In en, this message translates to:
  /// **'Acknowledge Cost'**
  String get acknowledgeCost;

  /// No description provided for @siteClaimedSuccess.
  ///
  /// In en, this message translates to:
  /// **'Site claimed successfully!'**
  String get siteClaimedSuccess;

  /// No description provided for @siteReclaimedSuccess.
  ///
  /// In en, this message translates to:
  /// **'Site reclaimed successfully'**
  String get siteReclaimedSuccess;

  /// No description provided for @visitStartedSuccess.
  ///
  /// In en, this message translates to:
  /// **'Visit started successfully'**
  String get visitStartedSuccess;

  /// No description provided for @visitCompletedSuccess.
  ///
  /// In en, this message translates to:
  /// **'Visit completed and report submitted successfully'**
  String get visitCompletedSuccess;

  /// No description provided for @errorOccurred.
  ///
  /// In en, this message translates to:
  /// **'Error occurred'**
  String get errorOccurred;

  /// No description provided for @call.
  ///
  /// In en, this message translates to:
  /// **'Call'**
  String get call;

  /// No description provided for @sms.
  ///
  /// In en, this message translates to:
  /// **'SMS'**
  String get sms;

  /// No description provided for @whatsapp.
  ///
  /// In en, this message translates to:
  /// **'WhatsApp'**
  String get whatsapp;

  /// No description provided for @state.
  ///
  /// In en, this message translates to:
  /// **'State'**
  String get state;

  /// No description provided for @locality.
  ///
  /// In en, this message translates to:
  /// **'Locality'**
  String get locality;

  /// No description provided for @transportFee.
  ///
  /// In en, this message translates to:
  /// **'Transport Fee'**
  String get transportFee;

  /// No description provided for @enumeratorFee.
  ///
  /// In en, this message translates to:
  /// **'Enumerator Fee'**
  String get enumeratorFee;

  /// No description provided for @totalCost.
  ///
  /// In en, this message translates to:
  /// **'Total Cost'**
  String get totalCost;

  /// No description provided for @noSitesAvailable.
  ///
  /// In en, this message translates to:
  /// **'No sites available'**
  String get noSitesAvailable;

  /// No description provided for @pullToRefresh.
  ///
  /// In en, this message translates to:
  /// **'Pull to refresh'**
  String get pullToRefresh;

  /// No description provided for @willSyncWhenOnline.
  ///
  /// In en, this message translates to:
  /// **'Will sync when online'**
  String get willSyncWhenOnline;

  /// No description provided for @dispatched.
  ///
  /// In en, this message translates to:
  /// **'Dispatched'**
  String get dispatched;

  /// No description provided for @onlyAdminsCanReclaim.
  ///
  /// In en, this message translates to:
  /// **'Only admins can reclaim sites'**
  String get onlyAdminsCanReclaim;

  /// No description provided for @releaseSiteToPool.
  ///
  /// In en, this message translates to:
  /// **'Release this site back to the dispatch pool?'**
  String get releaseSiteToPool;

  /// No description provided for @siteDetails.
  ///
  /// In en, this message translates to:
  /// **'Site Details'**
  String get siteDetails;

  /// No description provided for @visitDetails.
  ///
  /// In en, this message translates to:
  /// **'Visit Details'**
  String get visitDetails;

  /// No description provided for @auditTrail.
  ///
  /// In en, this message translates to:
  /// **'Audit Trail'**
  String get auditTrail;

  /// No description provided for @assignedTo.
  ///
  /// In en, this message translates to:
  /// **'Assigned To'**
  String get assignedTo;

  /// No description provided for @visitDate.
  ///
  /// In en, this message translates to:
  /// **'Visit Date'**
  String get visitDate;

  /// No description provided for @project.
  ///
  /// In en, this message translates to:
  /// **'Project'**
  String get project;

  /// No description provided for @activity.
  ///
  /// In en, this message translates to:
  /// **'Activity'**
  String get activity;

  /// No description provided for @cpName.
  ///
  /// In en, this message translates to:
  /// **'CP Name'**
  String get cpName;

  /// No description provided for @openInMaps.
  ///
  /// In en, this message translates to:
  /// **'Open in Maps'**
  String get openInMaps;

  /// No description provided for @noData.
  ///
  /// In en, this message translates to:
  /// **'No data available'**
  String get noData;

  /// No description provided for @view.
  ///
  /// In en, this message translates to:
  /// **'View'**
  String get view;

  /// No description provided for @overdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get overdue;

  /// No description provided for @inbox.
  ///
  /// In en, this message translates to:
  /// **'Inbox'**
  String get inbox;

  /// No description provided for @drafts.
  ///
  /// In en, this message translates to:
  /// **'Drafts'**
  String get drafts;

  /// No description provided for @outbox.
  ///
  /// In en, this message translates to:
  /// **'Outbox'**
  String get outbox;

  /// No description provided for @sent.
  ///
  /// In en, this message translates to:
  /// **'Sent'**
  String get sent;

  /// No description provided for @accepted.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get accepted;

  /// No description provided for @ongoing.
  ///
  /// In en, this message translates to:
  /// **'Ongoing'**
  String get ongoing;

  /// Title for the What's New dialog
  ///
  /// In en, this message translates to:
  /// **'What\'s New'**
  String get whatsNew;

  /// Section header for new features
  ///
  /// In en, this message translates to:
  /// **'New Features'**
  String get newFeatures;

  /// Section header for bug fixes
  ///
  /// In en, this message translates to:
  /// **'Bug Fixes'**
  String get bugFixes;

  /// Section header for improvements
  ///
  /// In en, this message translates to:
  /// **'Improvements'**
  String get improvements;

  /// Button text to dismiss the What's New dialog
  ///
  /// In en, this message translates to:
  /// **'Got it!'**
  String get gotIt;

  /// What's New - Feature 1
  ///
  /// In en, this message translates to:
  /// **'🌍 Complete Bilingual Support (English/Arabic)'**
  String get whatsNewFeature1;

  /// What's New - Feature 2
  ///
  /// In en, this message translates to:
  /// **'📋 Language Toggle Button - Switch instantly in AppBar'**
  String get whatsNewFeature2;

  /// What's New - Feature 3
  ///
  /// In en, this message translates to:
  /// **'🏭 MMP Details Section - Shows main activity & status'**
  String get whatsNewFeature3;

  /// What's New - Feature 4
  ///
  /// In en, this message translates to:
  /// **'⚠️ Enumerator Fee Note - Guidance with approval requirements'**
  String get whatsNewFeature4;

  /// What's New - Bug Fix 1
  ///
  /// In en, this message translates to:
  /// **'Fixed Complete Visit Screen - Missing activity inputs now appear'**
  String get whatsNewFix1;

  /// What's New - Bug Fix 2
  ///
  /// In en, this message translates to:
  /// **'Fixed language detection in all screens'**
  String get whatsNewFix2;

  /// What's New - Bug Fix 3
  ///
  /// In en, this message translates to:
  /// **'Fixed RTL text field support for Arabic input'**
  String get whatsNewFix3;

  /// What's New - Improvement 1
  ///
  /// In en, this message translates to:
  /// **'Activity selection now context-aware (GFA/CBT/PDM/MDM/WHM)'**
  String get whatsNewImprovement1;

  /// What's New - Improvement 2
  ///
  /// In en, this message translates to:
  /// **'Warehouse input visibility improved (appears after fee summary)'**
  String get whatsNewImprovement2;

  /// What's New - Improvement 3
  ///
  /// In en, this message translates to:
  /// **'Fee note alert now includes WFP AO approval requirements'**
  String get whatsNewImprovement3;

  /// Dialog title for bulk locality permit verification
  ///
  /// In en, this message translates to:
  /// **'Bulk Locality Permit Verification'**
  String get bulkLocalityPermitVerification;

  /// Description in locality permit dialog
  ///
  /// In en, this message translates to:
  /// **'Verify locality permit requirements for {locality}, {state}'**
  String verifyLocalityRequirements(String locality, String state);

  /// Number of sites affected by locality permit
  ///
  /// In en, this message translates to:
  /// **'{count} sites will be affected'**
  String sitesWillBeAffected(int count);

  /// Question about locality permit requirement
  ///
  /// In en, this message translates to:
  /// **'Do you require a Locality permit in this locality?'**
  String get localityPermitQuestion;

  /// Option: permit is required and user has it
  ///
  /// In en, this message translates to:
  /// **'Yes, it\'s required and I will upload it'**
  String get requirePermitHaveIt;

  /// Description: user has permit and will upload
  ///
  /// In en, this message translates to:
  /// **'I have the locality permit and will upload it now'**
  String get haveLocalityPermitWillUpload;

  /// Option: permit is required but user doesn't have it
  ///
  /// In en, this message translates to:
  /// **'Yes, it\'s required but I don\'t have it'**
  String get requirePermitDontHave;

  /// Description: permit is required but not available
  ///
  /// In en, this message translates to:
  /// **'The locality permit is required but not available'**
  String get permitRequiredNotAvailable;

  /// Description: permit is not required
  ///
  /// In en, this message translates to:
  /// **'Locality permit is not required in this locality'**
  String get permitNotRequiredInLocality;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {


  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar': return AppLocalizationsAr();
    case 'en': return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.'
  );
}
