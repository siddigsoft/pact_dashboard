import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, convertInchesToTwip } from 'docx';
import { saveAs } from 'file-saver';
import { format } from 'date-fns';

interface Section {
  title: string;
  content: string[];
  subsections?: Section[];
}

const mobileDocumentationSections: Section[] = [
  {
    title: "1. Introduction",
    content: [
      "The PACT Mobile App is a dedicated field operations companion designed for data collectors, supervisors, coordinators, and field operation managers. Built with Flutter and powered by Supabase, the app provides full offline capability for remote field operations where internet connectivity is unreliable or unavailable."
    ],
    subsections: [
      {
        title: "1.1 About the Mobile App",
        content: [
          "Native Android application built with Flutter framework",
          "Full offline-first data collection with automatic sync",
          "GPS tracking with geofencing for site visit verification",
          "Camera integration for photo documentation at field sites",
          "Real-time push notifications for assignments and updates",
          "Bilingual interface supporting English and Arabic",
          "Shorebird OTA (Over-The-Air) updates for seamless app updates",
          "Secure authentication with Supabase Auth integration"
        ]
      },
      {
        title: "1.2 Who Should Use the Mobile App",
        content: [
          "Data Collectors: Primary users for site visits, data collection, and site claiming",
          "Supervisors: Field team oversight, location monitoring, and approval workflows",
          "Field Operation Managers (FOM): Dispatch management, team coordination, and field monitoring",
          "Coordinators: State-level activity coordination and reporting",
          "Administrators: Mobile dashboard for system monitoring on the go"
        ]
      },
      {
        title: "1.3 System Requirements",
        content: [
          "Android 8.0 (API level 26) or later",
          "iOS 13.0 or later (if applicable)",
          "Minimum 2GB RAM recommended",
          "GPS/Location services must be enabled",
          "Camera access for photo documentation",
          "Storage permission for offline data",
          "At least 100MB free storage space"
        ]
      }
    ]
  },
  {
    title: "2. Installation & Setup",
    content: [
      "Follow these steps to install and set up the PACT Mobile App on your device."
    ],
    subsections: [
      {
        title: "2.1 Downloading the App",
        content: [
          "Download the APK file from the authorized source provided by your organization",
          "The APK will be shared via your admin or IT team",
          "Ensure you download the latest version for the best experience",
          "File size is approximately 50-80MB depending on the version"
        ]
      },
      {
        title: "2.2 Installation Steps",
        content: [
          "Step 1: Open your device Settings",
          "Step 2: Go to Security or Privacy settings",
          "Step 3: Enable 'Install from Unknown Sources' or 'Allow installation from this source'",
          "Step 4: Open the downloaded APK file",
          "Step 5: Tap 'Install' when prompted",
          "Step 6: Wait for installation to complete",
          "Step 7: Tap 'Open' to launch the app"
        ]
      },
      {
        title: "2.3 First-Time Setup",
        content: [
          "The app shows a bilingual welcome screen (English/Arabic) on first launch",
          "Choose your preferred language",
          "Grant the required permissions when prompted (Location, Camera, Storage, Notifications)",
          "The permission onboarding guide explains why each permission is needed",
          "Log in with your PACT credentials (same as web platform)",
          "The app will sync initial data from the server",
          "Your dashboard will appear once setup is complete"
        ]
      },
      {
        title: "2.4 Required Permissions",
        content: [
          "Location (GPS): Required for site visit tracking, proximity-based site claiming, and geofencing",
          "Camera: Required for capturing photos at field sites during data collection",
          "Storage: Required for saving offline data, photos, and cached information",
          "Notifications: Required for receiving push alerts about assignments, approvals, and updates",
          "Microphone: Required for voice notes and audio recording during site visits",
          "All permissions can be managed in your device Settings > Apps > PACT"
        ]
      }
    ]
  },
  {
    title: "3. Login & Authentication",
    content: [
      "The mobile app uses the same secure authentication as the web platform."
    ],
    subsections: [
      {
        title: "3.1 Logging In",
        content: [
          "Open the PACT app on your device",
          "Enter your email address",
          "Enter your password",
          "Tap 'Sign In'",
          "If 2FA is enabled on your account, enter the verification code",
          "The app remembers your session so you don't need to log in every time"
        ]
      },
      {
        title: "3.2 Password Management",
        content: [
          "Use the 'Forgot Password' link on the login screen if you need to reset your password",
          "Password reset link will be sent to your registered email",
          "The password strength indicator shows how strong your new password is",
          "Passwords must meet minimum security requirements set by your organization"
        ]
      },
      {
        title: "3.3 Session Management",
        content: [
          "Your session stays active while the app is installed",
          "Sessions sync with the web platform",
          "You can sign out from the Settings screen",
          "If your session expires, you will be prompted to log in again",
          "For security, sessions may expire after extended inactivity"
        ]
      }
    ]
  },
  {
    title: "4. Home Screen & Navigation",
    content: [
      "The mobile app provides an intuitive home screen with quick access to all key features."
    ],
    subsections: [
      {
        title: "4.1 Home Dashboard",
        content: [
          "Summary statistics cards showing your assignments, completed visits, and pending tasks",
          "Quick action buttons for common tasks (Start Visit, Claim Site, Submit Cost)",
          "Recent activity feed showing latest updates and notifications",
          "Status indicators showing online/offline connectivity",
          "Battery status indicator for field awareness"
        ]
      },
      {
        title: "4.2 Bottom Navigation Bar",
        content: [
          "Home: Main dashboard with stats and quick actions",
          "Sites: View available and assigned site visits",
          "Map: Interactive map showing nearby sites and team locations",
          "Wallet: View your wallet balance and transaction history",
          "More: Access settings, help, support, and additional features"
        ]
      },
      {
        title: "4.3 Quick Actions Menu",
        content: [
          "Floating action button provides one-tap access to common tasks",
          "Start a new site visit",
          "Claim an available site",
          "Submit a cost request",
          "Record a voice note",
          "Take a quick photo",
          "Access emergency SOS"
        ]
      },
      {
        title: "4.4 Search",
        content: [
          "Global search bar at the top of the home screen",
          "Search for sites by name, code, state, or locality",
          "Search for team members",
          "Search for recent transactions",
          "Search results include filters for type and status"
        ]
      }
    ]
  },
  {
    title: "5. MMP Workflow & Site Visits - Complete Mobile Guide",
    content: [
      "This section covers the complete Monthly Monitoring Plan (MMP) workflow from the mobile perspective, including how to claim sites, manage your visits across tabs, collect data, and receive payment in your wallet."
    ],
    subsections: [
      {
        title: "5.1 Understanding the MMP Workflow on Mobile",
        content: [
          "Monthly Monitoring Plans (MMPs) are uploaded by admin/operations staff on the web platform",
          "Once approved and dispatched, sites become available for field collectors on mobile",
          "The mobile app is your primary tool for: Claiming sites, Starting visits, Collecting data, Completing visits, and Receiving wallet payments",
          "The complete workflow: Admin uploads MMP → Admin approves → Sites dispatched → You claim → You visit → You get paid"
        ]
      },
      {
        title: "5.2 Claiming Sites (Uber/Lyft Style)",
        content: [
          "Open the MMP/Sites page from the navigation",
          "The CLAIMABLE tab shows all dispatched sites available in your area",
          "Sites are grouped by State-Locality for easy browsing",
          "Each site card shows: Site Name, Code, Activity Type, CP Name, Planned Date, and Fee information",
          "Tap 'Claim Site' to reserve a site for yourself",
          "The system uses atomic database transactions to prevent double-claiming",
          "Only ONE collector can successfully claim each site (first-come, first-served)",
          "Your classification level determines the fees: Enumerator Fee + Transport Fee",
          "Fees are calculated and locked in at claim time - they cannot change after",
          "GPS proximity matching helps you find the nearest available sites"
        ]
      },
      {
        title: "5.3 The ASSIGNED Tab",
        content: [
          "The ASSIGNED tab shows sites that were directly assigned to you by admin/FOM or by the Smart Dispatch system",
          "These are mandatory visits that you must complete",
          "Tap 'Accept' to acknowledge the assignment",
          "Tap 'Acknowledge Cost' to confirm the fee amount",
          "After accepting, sites move to your My Sites > Inbox tab"
        ]
      },
      {
        title: "5.4 My Sites - Four Sub-Tabs Explained",
        content: [
          "After claiming or being assigned sites, they appear in 'My Sites' with FOUR sub-tabs:",
          "",
          "INBOX TAB (Green badge):",
          "  Shows sites READY TO START - status: Accepted, Claimed, Assigned, Dispatched, Verified, or Approved",
          "  These are sites waiting for you to begin the visit",
          "  Each card shows: Name, Code, Location, Activity Type, Status, Total Fee",
          "  Actions: 'Start Visit' button (black, play icon), 'Request Advance' for transport money",
          "",
          "DRAFTS TAB (Blue badge):",
          "  Shows visits IN PROGRESS - status: 'In Progress' or 'Ongoing'",
          "  These are visits you STARTED but have NOT COMPLETED yet",
          "  Continue collecting data on these sites",
          "  Actions: 'Complete Site Visit' button (green) to finish and submit",
          "  GPS tracking is active, data saves locally and syncs when connected",
          "",
          "OUTBOX TAB (Yellow badge):",
          "  Shows COMPLETED visits stored OFFLINE waiting to sync",
          "  Visits completed without internet connection are queued here",
          "  Data stored safely on your device",
          "  When internet becomes available, data syncs automatically",
          "  After sync, visits move to the Sent tab",
          "  IMPORTANT: Never delete the app while visits are in Outbox!",
          "",
          "SENT TAB (Green badge):",
          "  Shows FULLY COMPLETED and SYNCED visits",
          "  These have been submitted to the server successfully",
          "  Payment has been calculated and credited to your wallet",
          "  View visit details: date, location, photos, fees",
          "  No further actions needed on these sites"
        ]
      },
      {
        title: "5.5 Starting a Site Visit",
        content: [
          "From the Inbox tab, find the site you want to visit",
          "Review the site details: Name, Code, Location, Activity Type, Fees",
          "Travel to the site location (GPS will verify your position)",
          "Tap the 'Start Visit' button (black button with play icon)",
          "The system captures your GPS coordinates automatically",
          "If geofencing is enabled, you must be within the radius of the site",
          "Visit status changes to 'In Progress'",
          "The site card moves from Inbox to the Drafts tab",
          "A visit timer starts tracking the duration",
          "You can now begin collecting data"
        ]
      },
      {
        title: "5.6 Data Collection During Visit",
        content: [
          "GPS location is continuously tracked during the visit",
          "Take photos using the integrated camera (tap the camera button)",
          "Photos are geotagged with GPS coordinates and timestamps",
          "Fill in the required survey/data collection forms",
          "Record voice notes for additional observations",
          "All data is saved locally first (offline-safe)",
          "Progress is preserved even if the app closes unexpectedly",
          "You can pause and resume - data will not be lost"
        ]
      },
      {
        title: "5.7 Completing a Site Visit",
        content: [
          "Navigate to the Drafts tab to find your in-progress visit",
          "Review all collected data before completing",
          "Ensure all required fields are filled and photos are taken",
          "Tap the 'Complete Site Visit' button (green button)",
          "Final GPS coordinates are recorded for verification",
          "If ONLINE: Data syncs immediately, payment calculated, wallet credited",
          "If OFFLINE: Visit moves to Outbox tab, data stored locally until internet available",
          "Once synced, the visit moves to the Sent tab",
          "A notification confirms completion and payment amount"
        ]
      },
      {
        title: "5.8 Transportation Advance (Optional)",
        content: [
          "Before starting a visit, you can request a transportation advance for travel costs",
          "Available for sites with transport budget allocated (Transport Fee > 0)",
          "From Inbox, tap 'Request Advance' on an accepted/claimed site",
          "Enter the requested amount (up to the allocated Transport Fee)",
          "Request goes through two-tier approval: Supervisor first, then Admin/Finance",
          "Approved advances are credited to your wallet immediately",
          "When the visit is completed, the advance is automatically deducted from your payment",
          "Digital signature confirmation is required to acknowledge advance receipt"
        ]
      },
      {
        title: "5.9 Payment & Wallet Credit After Completion",
        content: [
          "When your visit is marked 'Completed' and synced to the server:",
          "1. The system calculates total payment: Enumerator Fee + Transport Fee",
          "2. If you took a transportation advance, it is deducted from the total",
          "3. Net amount is credited to your digital wallet",
          "4. A wallet transaction is created with: Site Name, MMP reference, Fee breakdown, Date",
          "5. Your wallet balance updates immediately",
          "6. You receive a notification confirming the payment",
          "",
          "View your earnings in the Wallet tab:",
          "  Current Balance: Available funds in SDG",
          "  Total Earned: Lifetime earnings from all completed visits",
          "  This Month: Current month's earnings",
          "  Transaction History: All credits, debits, advances, and withdrawals"
        ]
      },
      {
        title: "5.10 Complete Status Flow Reference",
        content: [
          "The complete site lifecycle from MMP upload to wallet payment:",
          "",
          "1. DISPATCHED → Site made available by admin (shows in Claimable tab)",
          "2. CLAIMED → You claimed the site (locked to you)",
          "3. ACCEPTED → Claim confirmed, fees locked (shows in Inbox tab)",
          "4. IN PROGRESS → You started the visit, GPS tracking active (shows in Drafts tab)",
          "5. COMPLETED → Data collection finished (shows in Outbox if offline, Sent if online)",
          "6. WALLET CREDITED → Payment automatically calculated and added to your wallet",
          "",
          "Other statuses you may see:",
          "  ASSIGNED: Site directly assigned to you (skips claiming) → shows in Inbox",
          "  ONGOING: Alternative status for in-progress visits → shows in Drafts",
          "  VERIFIED: Site verified by admin for accuracy",
          "  REJECTED: Visit rejected by supervisor",
          "  CANCELLED: Visit cancelled by admin"
        ]
      },
      {
        title: "5.11 Digital Signatures for Site Visits",
        content: [
          "Some site visits require a digital signature upon completion",
          "Use the full-screen signature pad to sign with your finger",
          "Signatures are hashed using SHA-256 for security",
          "The signature is attached to the visit record",
          "Both handwriting and UUID-based signature methods are supported"
        ]
      }
    ]
  },
  {
    title: "6. Offline Mode",
    content: [
      "The PACT Mobile App is designed to work fully offline in remote field locations."
    ],
    subsections: [
      {
        title: "6.1 How Offline Mode Works",
        content: [
          "All data is saved locally first using IndexedDB storage",
          "The app works completely without internet connection",
          "Site visit forms, photos, and GPS data are stored on device",
          "An offline status indicator shows your current connectivity",
          "The network quality indicator shows signal strength",
          "Data is queued for automatic sync when you reconnect"
        ]
      },
      {
        title: "6.2 What Works Offline",
        content: [
          "Starting and completing site visits",
          "GPS tracking and location capture",
          "Taking photos and recording voice notes",
          "Viewing cached site lists and MMP data",
          "Filling in data collection forms",
          "Viewing your wallet balance (last synced)",
          "Submitting cost requests (queued for sync)",
          "Viewing cached maps (if downloaded previously)"
        ]
      },
      {
        title: "6.3 Sync Process",
        content: [
          "Sync starts automatically when internet becomes available",
          "The sync progress ring shows upload/download progress",
          "A sync status bar at the top shows pending items count",
          "Pull down on any screen to manually trigger sync",
          "Automatic conflict resolution handles data conflicts",
          "Sync toast notifications inform you of sync results",
          "The Offline Data Dashboard shows all locally stored data"
        ]
      },
      {
        title: "6.4 Offline Map Downloads",
        content: [
          "Download map tiles for your area before going to the field",
          "Open the Map screen and tap 'Download for Offline'",
          "Select the area/region you want to cache",
          "Downloaded maps are available without internet",
          "Saved maps show site locations and team positions"
        ]
      },
      {
        title: "6.5 Draft Recovery",
        content: [
          "If the app closes unexpectedly, your work is saved automatically",
          "On next launch, a draft recovery prompt appears if unsaved work exists",
          "Choose to continue where you left off or start fresh",
          "Drafts include partially completed visits and forms"
        ]
      }
    ]
  },
  {
    title: "7. Maps & Location",
    content: [
      "The mobile app provides powerful mapping and location features for field navigation."
    ],
    subsections: [
      {
        title: "7.1 Interactive Map View",
        content: [
          "View all site locations on an interactive map",
          "Your current location is shown with a blue marker",
          "Site markers are color-coded by status (Available, Claimed, Completed)",
          "Tap a site marker to see site details and distance",
          "Pinch to zoom in/out on the map",
          "Double-tap for quick zoom"
        ]
      },
      {
        title: "7.2 GPS Tracking",
        content: [
          "GPS coordinates are captured when starting a visit",
          "Continuous tracking during active site visits",
          "Location accuracy is displayed in the interface",
          "High-accuracy mode recommended for best results",
          "GPS data is attached to all field reports"
        ]
      },
      {
        title: "7.3 Geofencing",
        content: [
          "The geofence monitor ensures you are at the correct site",
          "A virtual boundary is set around each site location",
          "The app alerts you if you are outside the geofence",
          "Geofencing prevents data collection from incorrect locations",
          "The location blocker stops visit actions if GPS is unavailable"
        ]
      },
      {
        title: "7.4 Field Team Map (Admin Only)",
        content: [
          "Administrators can view all field team members on the map in real-time",
          "Shows collector locations, movements, and current status",
          "Helps with team coordination and resource allocation",
          "Available only to FOM, Admin, and Super Admin roles"
        ]
      }
    ]
  },
  {
    title: "8. Wallet & Payments",
    content: [
      "Manage your wallet and track payments directly from the mobile app."
    ],
    subsections: [
      {
        title: "8.1 Wallet Dashboard",
        content: [
          "View your current wallet balance in SDG (Sudanese Pounds)",
          "The wallet card shows total balance, pending amounts, and recent changes",
          "Quick stats show earnings this month and total earned",
          "Tap the wallet card for detailed transaction history"
        ]
      },
      {
        title: "8.2 Transaction History",
        content: [
          "View all wallet transactions in chronological order",
          "Each transaction shows: type, amount, date, and description",
          "Transaction types: Site visit earnings, Advances, Deductions, Retainer payments",
          "Filter transactions by type and date range",
          "Pull down to refresh transaction data"
        ]
      },
      {
        title: "8.3 Advance Requests",
        content: [
          "View your advance (down payment) requests and their status",
          "Track pending, approved, and paid advances",
          "View the advance requests report for a summary",
          "Advances are automatically reconciled with site visit fees"
        ]
      },
      {
        title: "8.4 Retainer Payments",
        content: [
          "If you are classified as retainer-eligible, view your retainer payment history",
          "Monthly retainer payments appear as wallet transactions",
          "The retainer list shows all your retainer records",
          "Retainer cards display payment status and amounts"
        ]
      }
    ]
  },
  {
    title: "9. Cost Submissions",
    content: [
      "Submit operational cost requests directly from the mobile app."
    ],
    subsections: [
      {
        title: "9.1 Submitting a Cost Request",
        content: [
          "Navigate to More > Cost Submission from the menu",
          "Select the project for the cost request",
          "Enter the request date and title",
          "Add expense items with category, description, quantity, and unit cost",
          "The total is automatically calculated (Quantity x Unit Cost)",
          "Add multiple items to a single request",
          "Attach photos of receipts using the camera",
          "Upload supporting documents",
          "Submit for approval"
        ]
      },
      {
        title: "9.2 Cost Categories",
        content: [
          "Permits: Local access permits, government licenses",
          "Incentives: Team bonuses, field allowances",
          "Communication: Phone credit, SIM cards, internet packages",
          "Training: Workshops, materials, venue hire",
          "General Transportation: Office travel, hub visits",
          "Equipment & Supplies: Field equipment, stationery, tools",
          "Printing & Materials: Forms, reports, manuals",
          "Meetings & Events: Venue hire, refreshments",
          "Other: Any operational cost not covered above (requires specification)"
        ]
      },
      {
        title: "9.3 Digital Signatures for Cost Approval",
        content: [
          "When reviewing cost submissions, approvers can sign digitally on mobile",
          "The full-screen signature pad is optimized for touch devices",
          "Sign with your finger on the signature area",
          "Signatures are encrypted and attached to the approval record",
          "Both handwriting and UUID verification methods available"
        ]
      },
      {
        title: "9.4 Tracking Your Submissions",
        content: [
          "View all your submitted cost requests and their status",
          "Status progression: Pending > Tier 1 Approved > Tier 2 Approved > Processed",
          "Receive push notifications when your submission is approved or rejected",
          "Rejected submissions show the reason and can be edited and resubmitted"
        ]
      }
    ]
  },
  {
    title: "10. Communication & Team Coordination",
    content: [
      "The app includes built-in communication tools for team coordination."
    ],
    subsections: [
      {
        title: "10.1 Chat & Messaging",
        content: [
          "Send and receive messages with team members",
          "Quick message templates for common field communications",
          "Messages are delivered via push notifications",
          "Chat history is synced across devices",
          "Share photos and location within chat"
        ]
      },
      {
        title: "10.2 Voice & Video Calls",
        content: [
          "WebRTC audio calling for voice communication",
          "WebRTC video calling for video conferencing",
          "Call overlay shows during active calls",
          "Enhanced call features include mute, speaker, and hold",
          "Call scheduling for planned team meetings"
        ]
      },
      {
        title: "10.3 Voice Notes",
        content: [
          "Record voice notes during site visits",
          "Voice recorder with playback capability",
          "Voice notes are attached to the current site visit",
          "Useful for capturing observations that are hard to type",
          "Voice notes sync with the server when online"
        ]
      },
      {
        title: "10.4 Notifications",
        content: [
          "Push notifications for new site assignments",
          "Approval/rejection notifications for cost submissions",
          "Team announcements from administrators",
          "Sync completion notifications",
          "Bilingual notifications in English and Arabic",
          "Notification center for viewing all past notifications",
          "Notification overlay shows priority alerts"
        ]
      }
    ]
  },
  {
    title: "11. Settings & Preferences",
    content: [
      "Customize the app to your preferences."
    ],
    subsections: [
      {
        title: "11.1 Language Settings",
        content: [
          "Switch between English and Arabic at any time",
          "Use the language switcher in the Settings screen",
          "The entire interface updates to the selected language",
          "Language preference is saved and remembered"
        ]
      },
      {
        title: "11.2 Dark Mode",
        content: [
          "Toggle dark mode for comfortable viewing in low light",
          "Use the dark mode toggle in Settings or the header",
          "Dark mode reduces eye strain during evening field work",
          "Theme preference is saved across sessions"
        ]
      },
      {
        title: "11.3 Low Bandwidth Mode",
        content: [
          "Enable low bandwidth mode when on slow connections",
          "Reduces data usage by compressing images and limiting sync frequency",
          "Useful in remote areas with limited mobile data",
          "Toggle from Settings > Performance"
        ]
      },
      {
        title: "11.4 Device Information",
        content: [
          "View your device details and app version in Settings",
          "Shows available storage space",
          "Displays current GPS accuracy",
          "Battery status and optimization tips",
          "App version and build number for support reference"
        ]
      },
      {
        title: "11.5 Profile & Avatar",
        content: [
          "Edit your profile picture using the avatar editor",
          "Take a new photo or choose from gallery",
          "Crop and adjust your profile picture",
          "Profile updates sync to the web platform"
        ]
      }
    ]
  },
  {
    title: "12. Help & Support",
    content: [
      "Get help and support directly from the mobile app."
    ],
    subsections: [
      {
        title: "12.1 Help Articles",
        content: [
          "Access help articles from the More menu",
          "Articles cover common questions and how-to guides",
          "Articles are managed by admins and updated regularly",
          "Available in both English and Arabic"
        ]
      },
      {
        title: "12.2 Support Tickets",
        content: [
          "Submit a support ticket for technical issues",
          "Describe your problem with text and screenshots",
          "Track the status of your submitted tickets",
          "Receive notifications when your ticket is responded to",
          "Admins manage tickets from the web dashboard"
        ]
      },
      {
        title: "12.3 Support Contacts",
        content: [
          "View admin-managed support contact numbers",
          "Quick-dial support contacts directly from the app",
          "Contacts are organized by region and role",
          "Emergency contacts are highlighted at the top"
        ]
      },
      {
        title: "12.4 Emergency SOS",
        content: [
          "Emergency SOS button available for critical situations",
          "Sends your GPS location to designated emergency contacts",
          "Accessible from the quick actions menu",
          "Use in genuine emergencies only"
        ]
      }
    ]
  },
  {
    title: "13. App Updates",
    content: [
      "The PACT Mobile App receives updates through Shorebird OTA (Over-The-Air) technology."
    ],
    subsections: [
      {
        title: "13.1 How Updates Work",
        content: [
          "App updates are delivered directly to your device without visiting an app store",
          "Shorebird OTA enables instant code updates",
          "Updates install silently in the background",
          "You will be notified when a new update is available",
          "Some major updates may require downloading a new APK"
        ]
      },
      {
        title: "13.2 Checking for Updates",
        content: [
          "Open Settings > About to check your current version",
          "The app automatically checks for updates when connected to the internet",
          "Manual update check is available in Settings",
          "Always keep the app updated for the best experience and security"
        ]
      }
    ]
  },
  {
    title: "14. Troubleshooting",
    content: [
      "Common problems and their solutions for the mobile app."
    ],
    subsections: [
      {
        title: "14.1 Login Issues",
        content: [
          "Verify your email and password are correct",
          "Check your internet connection",
          "Try closing and reopening the app",
          "Use 'Forgot Password' to reset your password",
          "Contact your admin if your account is locked",
          "Clear the app cache in device Settings > Apps > PACT > Clear Cache"
        ]
      },
      {
        title: "14.2 GPS Problems",
        content: [
          "Enable High Accuracy mode in device Location Settings",
          "Grant location permissions to the PACT app",
          "Make sure you are outdoors with clear sky view for better GPS signal",
          "Restart the app if location is not updating",
          "Check that battery saver is not restricting GPS access",
          "Restart your device if GPS issues persist"
        ]
      },
      {
        title: "14.3 Sync Issues",
        content: [
          "Verify you have a stable internet connection",
          "Pull down to manually trigger sync",
          "Check the sync status indicator for pending items",
          "Force close and reopen the app",
          "If sync fails repeatedly, check for app updates",
          "Contact support if data appears missing after sync"
        ]
      },
      {
        title: "14.4 Camera Issues",
        content: [
          "Ensure camera permission is granted to the PACT app",
          "Close other apps that may be using the camera",
          "Check available storage space on your device",
          "Restart the app if the camera is not responding",
          "Photos are saved locally before uploading"
        ]
      },
      {
        title: "14.5 App Crashes",
        content: [
          "Make sure you have the latest version of the app",
          "Clear app cache: Settings > Apps > PACT > Clear Cache",
          "Ensure sufficient free storage space (at least 100MB)",
          "Restart your device",
          "If crashes persist, reinstall the app (your data is synced to the server)",
          "Report persistent crashes via a support ticket"
        ]
      },
      {
        title: "14.6 Battery Optimization",
        content: [
          "The app uses GPS which can drain battery",
          "Enable battery optimization for background tasks",
          "Use low bandwidth mode to reduce data processing",
          "The battery status indicator warns when battery is low",
          "Carry a portable charger for extended field work",
          "Close unused apps to conserve battery"
        ]
      }
    ]
  },
  {
    title: "15. Gestures & Shortcuts",
    content: [
      "Learn the gestures and shortcuts to navigate the app efficiently."
    ],
    subsections: [
      {
        title: "15.1 Touch Gestures",
        content: [
          "Swipe left/right: Navigate between items or tabs",
          "Pull down: Refresh data on any screen",
          "Long press: Access context menu or additional options",
          "Pinch: Zoom in/out on maps and images",
          "Double tap: Quick zoom on maps",
          "Swipe from edge: Go back to previous screen"
        ]
      },
      {
        title: "15.2 Quick Tips",
        content: [
          "Download maps before going to areas with no internet",
          "Enable high-accuracy GPS before starting site visits",
          "Check sync status before ending your work session",
          "Use voice notes for quick field observations",
          "Keep the app updated for the latest features and fixes",
          "Use dark mode in the evening to reduce eye strain"
        ]
      }
    ]
  }
];

const arabicMobileDocumentationSections: Section[] = [
  {
    title: "1. المقدمة",
    content: [
      "تطبيق PACT للهاتف المحمول هو رفيق مخصص للعمليات الميدانية مصمم لجامعي البيانات والمشرفين والمنسقين ومديري العمليات الميدانية. مبني بإطار Flutter ومدعوم بـ Supabase، يوفر التطبيق إمكانية كاملة للعمل بدون اتصال في المناطق الميدانية البعيدة حيث يكون الاتصال بالإنترنت غير موثوق أو غير متاح."
    ],
    subsections: [
      {
        title: "1.1 حول تطبيق الهاتف المحمول",
        content: [
          "تطبيق Android أصلي مبني بإطار Flutter",
          "جمع بيانات بدون اتصال أولاً مع مزامنة تلقائية",
          "تتبع GPS مع سياج جغرافي للتحقق من زيارات المواقع",
          "تكامل الكاميرا لتوثيق المواقع الميدانية بالصور",
          "إشعارات فورية للتعيينات والتحديثات في الوقت الحقيقي",
          "واجهة ثنائية اللغة تدعم الإنجليزية والعربية",
          "تحديثات Shorebird OTA (عبر الهواء) لتحديثات سلسة للتطبيق",
          "مصادقة آمنة مع تكامل Supabase Auth"
        ]
      },
      {
        title: "1.2 من يجب أن يستخدم تطبيق الهاتف",
        content: [
          "جامعو البيانات: المستخدمون الأساسيون لزيارات المواقع وجمع البيانات والمطالبة بالمواقع",
          "المشرفون: الإشراف على الفريق الميداني ومراقبة المواقع وسير عمل الموافقات",
          "مديرو العمليات الميدانية (FOM): إدارة الإرسال وتنسيق الفريق والمراقبة الميدانية",
          "المنسقون: تنسيق الأنشطة على مستوى الولاية وإعداد التقارير",
          "المسؤولون: لوحة تحكم متنقلة لمراقبة النظام أثناء التنقل"
        ]
      },
      {
        title: "1.3 متطلبات النظام",
        content: [
          "نظام Android 8.0 (مستوى API 26) أو أحدث",
          "iOS 13.0 أو أحدث (إن وجد)",
          "يوصى بحد أدنى 2 جيجابايت من الذاكرة العشوائية",
          "يجب تفعيل خدمات GPS/الموقع",
          "الوصول إلى الكاميرا لتوثيق الصور",
          "إذن التخزين للبيانات بدون اتصال",
          "مساحة تخزين فارغة لا تقل عن 100 ميجابايت"
        ]
      }
    ]
  },
  {
    title: "2. التثبيت والإعداد",
    content: [
      "اتبع هذه الخطوات لتثبيت وإعداد تطبيق PACT للهاتف المحمول على جهازك."
    ],
    subsections: [
      {
        title: "2.1 تنزيل التطبيق",
        content: [
          "قم بتنزيل ملف APK من المصدر المعتمد الذي توفره منظمتك",
          "سيتم مشاركة ملف APK عبر المسؤول أو فريق تكنولوجيا المعلومات",
          "تأكد من تنزيل أحدث إصدار للحصول على أفضل تجربة",
          "حجم الملف حوالي 50-80 ميجابايت حسب الإصدار"
        ]
      },
      {
        title: "2.2 خطوات التثبيت",
        content: [
          "الخطوة 1: افتح إعدادات جهازك",
          "الخطوة 2: اذهب إلى إعدادات الأمان أو الخصوصية",
          "الخطوة 3: فعّل 'التثبيت من مصادر غير معروفة'",
          "الخطوة 4: افتح ملف APK الذي تم تنزيله",
          "الخطوة 5: اضغط 'تثبيت' عند المطالبة",
          "الخطوة 6: انتظر اكتمال التثبيت",
          "الخطوة 7: اضغط 'فتح' لتشغيل التطبيق"
        ]
      },
      {
        title: "2.3 الإعداد الأول",
        content: [
          "يعرض التطبيق شاشة ترحيب ثنائية اللغة (إنجليزي/عربي) عند التشغيل الأول",
          "اختر لغتك المفضلة",
          "امنح الأذونات المطلوبة عند المطالبة (الموقع، الكاميرا، التخزين، الإشعارات)",
          "يشرح دليل الأذونات سبب الحاجة لكل إذن",
          "سجل دخولك ببيانات PACT الخاصة بك (نفس بيانات المنصة الإلكترونية)",
          "سيقوم التطبيق بمزامنة البيانات الأولية من الخادم",
          "ستظهر لوحة التحكم بمجرد اكتمال الإعداد"
        ]
      },
      {
        title: "2.4 الأذونات المطلوبة",
        content: [
          "الموقع (GPS): مطلوب لتتبع زيارات المواقع والمطالبة بالمواقع القريبة والسياج الجغرافي",
          "الكاميرا: مطلوب لالتقاط الصور في المواقع الميدانية أثناء جمع البيانات",
          "التخزين: مطلوب لحفظ البيانات بدون اتصال والصور والمعلومات المخزنة مؤقتاً",
          "الإشعارات: مطلوب لتلقي تنبيهات فورية حول التعيينات والموافقات والتحديثات",
          "الميكروفون: مطلوب للملاحظات الصوتية والتسجيل الصوتي أثناء زيارات المواقع",
          "يمكن إدارة جميع الأذونات في إعدادات جهازك > التطبيقات > PACT"
        ]
      }
    ]
  },
  {
    title: "3. تسجيل الدخول والمصادقة",
    content: [
      "يستخدم تطبيق الهاتف نفس المصادقة الآمنة للمنصة الإلكترونية."
    ],
    subsections: [
      {
        title: "3.1 تسجيل الدخول",
        content: [
          "افتح تطبيق PACT على جهازك",
          "أدخل عنوان بريدك الإلكتروني",
          "أدخل كلمة المرور",
          "اضغط 'تسجيل الدخول'",
          "إذا كان التحقق بخطوتين مفعلاً، أدخل رمز التحقق",
          "يتذكر التطبيق جلستك فلا تحتاج لتسجيل الدخول في كل مرة"
        ]
      },
      {
        title: "3.2 إدارة كلمة المرور",
        content: [
          "استخدم رابط 'نسيت كلمة المرور' في شاشة تسجيل الدخول لإعادة تعيين كلمة المرور",
          "سيتم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني المسجل",
          "يعرض مؤشر قوة كلمة المرور مدى قوة كلمة المرور الجديدة",
          "يجب أن تستوفي كلمات المرور الحد الأدنى من متطلبات الأمان"
        ]
      },
      {
        title: "3.3 إدارة الجلسة",
        content: [
          "تبقى جلستك نشطة طالما التطبيق مثبت",
          "الجلسات متزامنة مع المنصة الإلكترونية",
          "يمكنك تسجيل الخروج من شاشة الإعدادات",
          "إذا انتهت صلاحية جلستك، سيُطلب منك تسجيل الدخول مرة أخرى",
          "لأسباب أمنية، قد تنتهي الجلسات بعد فترة طويلة من عدم النشاط"
        ]
      }
    ]
  },
  {
    title: "4. الشاشة الرئيسية والتنقل",
    content: [
      "يوفر التطبيق شاشة رئيسية بديهية مع وصول سريع لجميع الميزات الأساسية."
    ],
    subsections: [
      {
        title: "4.1 لوحة التحكم الرئيسية",
        content: [
          "بطاقات إحصائيات ملخصة تعرض تعييناتك والزيارات المكتملة والمهام المعلقة",
          "أزرار إجراءات سريعة للمهام الشائعة (بدء زيارة، المطالبة بموقع، تقديم تكلفة)",
          "خلاصة النشاط الأخير تعرض آخر التحديثات والإشعارات",
          "مؤشرات الحالة تعرض الاتصال بالإنترنت/بدون اتصال",
          "مؤشر حالة البطارية للتوعية الميدانية"
        ]
      },
      {
        title: "4.2 شريط التنقل السفلي",
        content: [
          "الرئيسية: لوحة التحكم الرئيسية مع الإحصائيات والإجراءات السريعة",
          "المواقع: عرض زيارات المواقع المتاحة والمعينة",
          "الخريطة: خريطة تفاعلية تعرض المواقع القريبة ومواقع الفريق",
          "المحفظة: عرض رصيد محفظتك وسجل المعاملات",
          "المزيد: الوصول إلى الإعدادات والمساعدة والدعم وميزات إضافية"
        ]
      },
      {
        title: "4.3 قائمة الإجراءات السريعة",
        content: [
          "زر الإجراء العائم يوفر وصولاً بضغطة واحدة للمهام الشائعة",
          "بدء زيارة موقع جديدة",
          "المطالبة بموقع متاح",
          "تقديم طلب تكلفة",
          "تسجيل ملاحظة صوتية",
          "التقاط صورة سريعة",
          "الوصول إلى زر الطوارئ SOS"
        ]
      },
      {
        title: "4.4 البحث",
        content: [
          "شريط البحث الشامل في أعلى الشاشة الرئيسية",
          "البحث عن المواقع بالاسم أو الرمز أو الولاية أو المحلية",
          "البحث عن أعضاء الفريق",
          "البحث عن المعاملات الأخيرة",
          "تتضمن نتائج البحث فلاتر حسب النوع والحالة"
        ]
      }
    ]
  },
  {
    title: "5. سير عمل MMP وزيارات المواقع - دليل الهاتف الشامل",
    content: [
      "يغطي هذا القسم سير عمل خطة المراقبة الشهرية (MMP) الكامل من منظور الهاتف المحمول، بما في ذلك كيفية المطالبة بالمواقع وإدارة زياراتك عبر التبويبات وجمع البيانات واستلام المدفوعات في محفظتك."
    ],
    subsections: [
      {
        title: "5.1 فهم سير عمل MMP على الهاتف",
        content: [
          "يتم رفع خطط المراقبة الشهرية (MMPs) من قبل المسؤولين/فريق العمليات على المنصة الإلكترونية",
          "بمجرد الموافقة والإرسال، تصبح المواقع متاحة لجامعي البيانات على الهاتف",
          "تطبيق الهاتف هو أداتك الأساسية لـ: المطالبة بالمواقع، بدء الزيارات، جمع البيانات، إكمال الزيارات، واستلام مدفوعات المحفظة",
          "سير العمل الكامل: المسؤول يرفع MMP ← المسؤول يوافق ← المواقع تُرسل ← أنت تطالب ← أنت تزور ← تحصل على الدفع"
        ]
      },
      {
        title: "5.2 المطالبة بالمواقع (بأسلوب أوبر/ليفت)",
        content: [
          "افتح صفحة MMP/المواقع من التنقل",
          "تبويب المتاحة يعرض جميع المواقع المُرسلة المتاحة في منطقتك",
          "المواقع مجمعة حسب الولاية-المحلية لسهولة التصفح",
          "كل بطاقة موقع تعرض: اسم الموقع، الرمز، نوع النشاط، اسم الشريك، التاريخ المخطط، ومعلومات الرسوم",
          "اضغط 'مطالبة بالموقع' لحجز الموقع لنفسك",
          "يستخدم النظام معاملات قاعدة بيانات ذرية لمنع المطالبة المزدوجة",
          "جامع واحد فقط يمكنه المطالبة بنجاح بكل موقع (الأول يحصل عليه)",
          "مستوى تصنيفك يحدد الرسوم: رسوم الجامع + رسوم النقل",
          "الرسوم تُحسب وتُثبت عند وقت المطالبة - لا يمكن تغييرها بعد ذلك",
          "مطابقة القرب GPS تساعدك في إيجاد أقرب المواقع المتاحة"
        ]
      },
      {
        title: "5.3 تبويب المعينة",
        content: [
          "تبويب المعينة يعرض المواقع المعينة لك مباشرة من المسؤول/مدير العمليات أو نظام الإرسال الذكي",
          "هذه زيارات إلزامية يجب عليك إتمامها",
          "اضغط 'قبول' للإقرار بالتعيين",
          "اضغط 'إقرار بالتكلفة' لتأكيد مبلغ الرسوم",
          "بعد القبول، تنتقل المواقع إلى مواقعي > تبويب البريد الوارد"
        ]
      },
      {
        title: "5.4 مواقعي - شرح التبويبات الفرعية الأربعة",
        content: [
          "بعد المطالبة بالمواقع أو تعيينها، تظهر في 'مواقعي' مع أربعة تبويبات فرعية:",
          "",
          "تبويب البريد الوارد (شارة خضراء):",
          "  يعرض المواقع الجاهزة للبدء - الحالة: مقبول، مطالب به، معين، مرسل، متحقق، أو معتمد",
          "  هذه مواقع تنتظرك لبدء الزيارة",
          "  كل بطاقة تعرض: الاسم، الرمز، الموقع، نوع النشاط، الحالة، إجمالي الرسوم",
          "  الإجراءات: زر 'بدء الزيارة' (أسود، أيقونة تشغيل)، 'طلب سلفة' لمصاريف النقل",
          "",
          "تبويب المسودات (شارة زرقاء):",
          "  يعرض الزيارات قيد التنفيذ - الحالة: 'قيد التنفيذ' أو 'جاري'",
          "  هذه زيارات بدأتها ولم تكملها بعد",
          "  تابع جمع البيانات في هذه المواقع",
          "  الإجراءات: زر 'إكمال زيارة الموقع' (أخضر) لإنهاء وإرسال البيانات",
          "  تتبع GPS نشط، البيانات تُحفظ محلياً وتُزامن عند الاتصال",
          "",
          "تبويب صندوق الصادر (شارة صفراء):",
          "  يعرض الزيارات المكتملة المخزنة بدون اتصال بانتظار المزامنة",
          "  الزيارات المكتملة بدون اتصال بالإنترنت تُوضع في قائمة الانتظار هنا",
          "  البيانات مخزنة بأمان على جهازك",
          "  عند توفر الإنترنت، تُزامن البيانات تلقائياً",
          "  بعد المزامنة، تنتقل الزيارات إلى تبويب المُرسَل",
          "  مهم: لا تحذف التطبيق أبداً بينما هناك زيارات في صندوق الصادر!",
          "",
          "تبويب المُرسَل (شارة خضراء):",
          "  يعرض الزيارات المكتملة والمُزامنة بالكامل",
          "  تم إرسالها للخادم بنجاح",
          "  تم حساب الدفع وإيداعه في محفظتك",
          "  اعرض تفاصيل الزيارة: التاريخ، الموقع، الصور، الرسوم",
          "  لا حاجة لإجراءات إضافية على هذه المواقع"
        ]
      },
      {
        title: "5.5 بدء زيارة الموقع",
        content: [
          "من تبويب البريد الوارد، جد الموقع الذي تريد زيارته",
          "راجع تفاصيل الموقع: الاسم، الرمز، الموقع، نوع النشاط، الرسوم",
          "سافر إلى موقع الموقع (سيتحقق GPS من موقعك)",
          "اضغط زر 'بدء الزيارة' (زر أسود بأيقونة تشغيل)",
          "يلتقط النظام إحداثيات GPS تلقائياً",
          "إذا كان السياج الجغرافي مفعلاً، يجب أن تكون ضمن نطاق الموقع",
          "تتغير حالة الزيارة إلى 'قيد التنفيذ'",
          "تنتقل بطاقة الموقع من البريد الوارد إلى تبويب المسودات",
          "يبدأ مؤقت الزيارة بتتبع المدة",
          "يمكنك الآن بدء جمع البيانات"
        ]
      },
      {
        title: "5.6 جمع البيانات أثناء الزيارة",
        content: [
          "يتم تتبع موقع GPS باستمرار أثناء الزيارة",
          "التقط صوراً باستخدام الكاميرا المدمجة (اضغط زر الكاميرا)",
          "الصور موسومة جغرافياً بإحداثيات GPS والطوابع الزمنية",
          "أكمل نماذج الاستبيان/جمع البيانات المطلوبة",
          "سجل ملاحظات صوتية للملاحظات الإضافية",
          "جميع البيانات تُحفظ محلياً أولاً (آمنة بدون اتصال)",
          "يُحفظ التقدم حتى لو أُغلق التطبيق بشكل غير متوقع",
          "يمكنك الإيقاف والاستئناف - لن تُفقد البيانات"
        ]
      },
      {
        title: "5.7 إكمال زيارة الموقع",
        content: [
          "انتقل إلى تبويب المسودات لإيجاد زيارتك قيد التنفيذ",
          "راجع جميع البيانات المجمعة قبل الإكمال",
          "تأكد من ملء جميع الحقول المطلوبة والتقاط الصور",
          "اضغط زر 'إكمال زيارة الموقع' (زر أخضر)",
          "يتم تسجيل إحداثيات GPS النهائية للتحقق",
          "إذا متصل: تُزامن البيانات فوراً، يُحسب الدفع، يُضاف للمحفظة",
          "إذا غير متصل: تنتقل الزيارة لصندوق الصادر، تُخزن البيانات محلياً حتى يتوفر الإنترنت",
          "بمجرد المزامنة، تنتقل الزيارة لتبويب المُرسَل",
          "إشعار يؤكد الإكمال ومبلغ الدفع"
        ]
      },
      {
        title: "5.8 سلفة النقل (اختياري)",
        content: [
          "قبل بدء الزيارة، يمكنك طلب سلفة نقل لتكاليف السفر",
          "متاحة للمواقع التي لديها ميزانية نقل مخصصة (رسوم النقل > 0)",
          "من البريد الوارد، اضغط 'طلب سلفة' على موقع مقبول/مطالب به",
          "أدخل المبلغ المطلوب (حتى رسوم النقل المخصصة)",
          "الطلب يمر بموافقة من مرحلتين: المشرف أولاً، ثم المسؤول/المالية",
          "السلف المعتمدة تُضاف لمحفظتك فوراً",
          "عند إكمال الزيارة، تُخصم السلفة تلقائياً من مدفوعاتك",
          "يتطلب تأكيد التوقيع الرقمي لإقرار استلام السلفة"
        ]
      },
      {
        title: "5.9 الدفع وإيداع المحفظة بعد الإكمال",
        content: [
          "عندما تُعلَّم زيارتك بحالة 'مكتملة' وتُزامن مع الخادم:",
          "1. يحسب النظام إجمالي الدفع: رسوم الجامع + رسوم النقل",
          "2. إذا أخذت سلفة نقل، تُخصم من الإجمالي",
          "3. يُضاف المبلغ الصافي لمحفظتك الرقمية",
          "4. تُنشأ معاملة محفظة بالتفاصيل: اسم الموقع، مرجع MMP، تفصيل الرسوم، التاريخ",
          "5. يُحدَّث رصيد محفظتك فوراً",
          "6. تتلقى إشعاراً يؤكد الدفع",
          "",
          "اعرض أرباحك في تبويب المحفظة:",
          "  الرصيد الحالي: الأموال المتاحة بالجنيه السوداني",
          "  إجمالي الأرباح: الأرباح مدى الحياة من جميع الزيارات المكتملة",
          "  هذا الشهر: أرباح الشهر الحالي",
          "  سجل المعاملات: جميع الإضافات والخصومات والسلف والسحوبات"
        ]
      },
      {
        title: "5.10 مرجع مسار الحالات الكامل",
        content: [
          "دورة حياة الموقع الكاملة من رفع MMP إلى دفع المحفظة:",
          "",
          "1. مُرسَل ← الموقع متاح من المسؤول (يظهر في تبويب المتاحة)",
          "2. مُطالب به ← أنت طالبت بالموقع (مقفل لك)",
          "3. مقبول ← المطالبة مُؤكدة، الرسوم مُثبتة (يظهر في تبويب البريد الوارد)",
          "4. قيد التنفيذ ← بدأت الزيارة، تتبع GPS نشط (يظهر في تبويب المسودات)",
          "5. مكتمل ← جمع البيانات انتهى (يظهر في صندوق الصادر إذا غير متصل، المُرسَل إذا متصل)",
          "6. إيداع المحفظة ← الدفع يُحسب تلقائياً ويُضاف لمحفظتك",
          "",
          "حالات أخرى قد تراها:",
          "  معين: الموقع معين لك مباشرة (يتخطى المطالبة) ← يظهر في البريد الوارد",
          "  جاري: حالة بديلة للزيارات قيد التنفيذ ← يظهر في المسودات",
          "  متحقق: الموقع تم التحقق منه من المسؤول للدقة",
          "  مرفوض: الزيارة رُفضت من المشرف",
          "  ملغى: الزيارة أُلغيت من المسؤول"
        ]
      },
      {
        title: "5.11 التوقيعات الرقمية لزيارات المواقع",
        content: [
          "بعض زيارات المواقع تتطلب توقيعاً رقمياً عند الإكمال",
          "استخدم لوحة التوقيع بملء الشاشة للتوقيع بإصبعك",
          "يتم تشفير التوقيعات باستخدام SHA-256 للأمان",
          "يُرفق التوقيع بسجل الزيارة",
          "طريقتان مدعومتان: التوقيع بخط اليد والتحقق بالمعرف الفريد"
        ]
      }
    ]
  },
  {
    title: "6. وضع بدون اتصال",
    content: [
      "تطبيق PACT للهاتف مصمم للعمل بالكامل بدون اتصال في المواقع الميدانية البعيدة."
    ],
    subsections: [
      {
        title: "6.1 كيف يعمل وضع بدون اتصال",
        content: [
          "جميع البيانات تُحفظ محلياً أولاً باستخدام تخزين IndexedDB",
          "يعمل التطبيق بالكامل بدون اتصال بالإنترنت",
          "نماذج زيارات المواقع والصور وبيانات GPS تُخزن على الجهاز",
          "مؤشر الحالة بدون اتصال يعرض اتصالك الحالي",
          "مؤشر جودة الشبكة يعرض قوة الإشارة",
          "البيانات تُوضع في قائمة انتظار للمزامنة التلقائية عند إعادة الاتصال"
        ]
      },
      {
        title: "6.2 ما يعمل بدون اتصال",
        content: [
          "بدء وإكمال زيارات المواقع",
          "تتبع GPS والتقاط الموقع",
          "التقاط الصور وتسجيل الملاحظات الصوتية",
          "عرض قوائم المواقع وبيانات MMP المخزنة مؤقتاً",
          "ملء نماذج جمع البيانات",
          "عرض رصيد محفظتك (آخر مزامنة)",
          "تقديم طلبات التكلفة (في قائمة انتظار للمزامنة)",
          "عرض الخرائط المخزنة مؤقتاً (إذا تم تنزيلها مسبقاً)"
        ]
      },
      {
        title: "6.3 عملية المزامنة",
        content: [
          "تبدأ المزامنة تلقائياً عند توفر الإنترنت",
          "حلقة تقدم المزامنة تعرض تقدم الرفع/التنزيل",
          "شريط حالة المزامنة في الأعلى يعرض عدد العناصر المعلقة",
          "اسحب لأسفل على أي شاشة لبدء المزامنة يدوياً",
          "حل النزاعات التلقائي يتعامل مع تعارض البيانات",
          "إشعارات المزامنة تُعلمك بنتائج المزامنة",
          "لوحة بيانات وضع بدون اتصال تعرض جميع البيانات المخزنة محلياً"
        ]
      },
      {
        title: "6.4 تنزيل الخرائط بدون اتصال",
        content: [
          "قم بتنزيل مربعات الخريطة لمنطقتك قبل الذهاب إلى الميدان",
          "افتح شاشة الخريطة واضغط 'تنزيل للاستخدام بدون اتصال'",
          "حدد المنطقة/الإقليم الذي تريد تخزينه مؤقتاً",
          "الخرائط المنزلة متاحة بدون إنترنت",
          "الخرائط المحفوظة تعرض مواقع المواقع ومواقع الفريق"
        ]
      },
      {
        title: "6.5 استعادة المسودات",
        content: [
          "إذا أُغلق التطبيق بشكل غير متوقع، يتم حفظ عملك تلقائياً",
          "عند التشغيل التالي، يظهر موجه استعادة المسودة إذا كان هناك عمل غير محفوظ",
          "اختر المتابعة من حيث توقفت أو البدء من جديد",
          "المسودات تشمل الزيارات والنماذج المكتملة جزئياً"
        ]
      }
    ]
  },
  {
    title: "7. الخرائط والموقع",
    content: [
      "يوفر التطبيق ميزات قوية للخرائط والموقع للتنقل الميداني."
    ],
    subsections: [
      {
        title: "7.1 عرض الخريطة التفاعلية",
        content: [
          "عرض جميع مواقع المواقع على خريطة تفاعلية",
          "يُعرض موقعك الحالي بعلامة زرقاء",
          "علامات المواقع ملونة حسب الحالة (متاح، مطالب به، مكتمل)",
          "اضغط على علامة موقع لعرض التفاصيل والمسافة",
          "اقرص للتكبير/التصغير على الخريطة",
          "اضغط مرتين للتكبير السريع"
        ]
      },
      {
        title: "7.2 تتبع GPS",
        content: [
          "يتم التقاط إحداثيات GPS عند بدء الزيارة",
          "تتبع مستمر أثناء زيارات المواقع النشطة",
          "يتم عرض دقة الموقع في الواجهة",
          "يُوصى بوضع الدقة العالية للحصول على أفضل النتائج",
          "بيانات GPS مرفقة بجميع التقارير الميدانية"
        ]
      },
      {
        title: "7.3 السياج الجغرافي",
        content: [
          "مراقب السياج الجغرافي يتأكد من وجودك في الموقع الصحيح",
          "يتم تعيين حدود افتراضية حول كل موقع",
          "ينبهك التطبيق إذا كنت خارج السياج الجغرافي",
          "يمنع السياج الجغرافي جمع البيانات من مواقع غير صحيحة",
          "حاجب الموقع يوقف إجراءات الزيارة إذا كان GPS غير متاح"
        ]
      },
      {
        title: "7.4 خريطة الفريق الميداني (للمسؤولين فقط)",
        content: [
          "يمكن للمسؤولين عرض جميع أعضاء الفريق الميداني على الخريطة في الوقت الحقيقي",
          "تعرض مواقع الجامعين وتحركاتهم وحالتهم الحالية",
          "تساعد في تنسيق الفريق وتخصيص الموارد",
          "متاحة فقط لأدوار مدير العمليات الميدانية والمسؤول والمسؤول الأعلى"
        ]
      }
    ]
  },
  {
    title: "8. المحفظة والمدفوعات",
    content: [
      "إدارة محفظتك وتتبع المدفوعات مباشرة من التطبيق."
    ],
    subsections: [
      {
        title: "8.1 لوحة تحكم المحفظة",
        content: [
          "عرض رصيد محفظتك الحالي بالجنيه السوداني",
          "بطاقة المحفظة تعرض الرصيد الإجمالي والمبالغ المعلقة والتغييرات الأخيرة",
          "إحصائيات سريعة تعرض أرباح هذا الشهر وإجمالي الأرباح",
          "اضغط على بطاقة المحفظة لعرض سجل المعاملات المفصل"
        ]
      },
      {
        title: "8.2 سجل المعاملات",
        content: [
          "عرض جميع معاملات المحفظة بترتيب زمني",
          "كل معاملة تعرض: النوع، المبلغ، التاريخ، والوصف",
          "أنواع المعاملات: أرباح زيارات المواقع، السلف، الخصومات، مدفوعات المكافآت",
          "تصفية المعاملات حسب النوع ونطاق التاريخ",
          "اسحب لأسفل لتحديث بيانات المعاملات"
        ]
      },
      {
        title: "8.3 طلبات السلف",
        content: [
          "عرض طلبات السلف (الدفعات المقدمة) وحالتها",
          "تتبع السلف المعلقة والموافق عليها والمدفوعة",
          "عرض تقرير طلبات السلف للحصول على ملخص",
          "يتم تسوية السلف تلقائياً مع رسوم زيارات المواقع"
        ]
      },
      {
        title: "8.4 مدفوعات المكافآت",
        content: [
          "إذا كنت مصنفاً كمؤهل للمكافأات، عرض سجل مدفوعات المكافآت",
          "مدفوعات المكافآت الشهرية تظهر كمعاملات محفظة",
          "قائمة المكافآت تعرض جميع سجلات مكافآتك",
          "بطاقات المكافآت تعرض حالة الدفع والمبالغ"
        ]
      }
    ]
  },
  {
    title: "9. تقديم التكاليف",
    content: [
      "تقديم طلبات التكاليف التشغيلية مباشرة من التطبيق."
    ],
    subsections: [
      {
        title: "9.1 تقديم طلب تكلفة",
        content: [
          "انتقل إلى المزيد > تقديم التكاليف من القائمة",
          "حدد المشروع لطلب التكلفة",
          "أدخل تاريخ الطلب والعنوان",
          "أضف عناصر المصاريف مع الفئة والوصف والكمية وتكلفة الوحدة",
          "يتم حساب الإجمالي تلقائياً (الكمية × تكلفة الوحدة)",
          "أضف عناصر متعددة لطلب واحد",
          "أرفق صور الإيصالات باستخدام الكاميرا",
          "ارفع المستندات الداعمة",
          "أرسل للموافقة"
        ]
      },
      {
        title: "9.2 فئات التكاليف",
        content: [
          "التصاريح: تصاريح الوصول المحلية، التراخيص الحكومية",
          "الحوافز: مكافآت الفريق، البدلات الميدانية",
          "الاتصالات: رصيد الهاتف، بطاقات SIM، باقات الإنترنت",
          "التدريب: ورش العمل، المواد التدريبية، استئجار القاعات",
          "النقل العام: سفر المكتب، زيارات المحاور",
          "المعدات واللوازم: معدات ميدانية، قرطاسية، أدوات",
          "الطباعة والمواد: نماذج، تقارير، أدلة",
          "الاجتماعات والفعاليات: استئجار القاعة، المرطبات",
          "أخرى: أي تكلفة تشغيلية غير مشمولة أعلاه (تتطلب توضيحاً)"
        ]
      },
      {
        title: "9.3 التوقيعات الرقمية لموافقة التكاليف",
        content: [
          "عند مراجعة طلبات التكاليف، يمكن للموافقين التوقيع رقمياً على الهاتف",
          "لوحة التوقيع بملء الشاشة محسّنة للأجهزة اللمسية",
          "وقّع بإصبعك على منطقة التوقيع",
          "يتم تشفير التوقيعات وإرفاقها بسجل الموافقة",
          "طريقتان متاحتان: التوقيع بخط اليد والتحقق بالمعرف الفريد"
        ]
      },
      {
        title: "9.4 تتبع طلباتك",
        content: [
          "عرض جميع طلبات التكاليف المقدمة وحالتها",
          "تقدم الحالة: معلق > موافق المرحلة 1 > موافق المرحلة 2 > تمت المعالجة",
          "تلقي إشعارات فورية عند الموافقة على طلبك أو رفضه",
          "الطلبات المرفوضة تعرض السبب ويمكن تعديلها وإعادة تقديمها"
        ]
      }
    ]
  },
  {
    title: "10. الاتصالات وتنسيق الفريق",
    content: [
      "يتضمن التطبيق أدوات اتصال مدمجة لتنسيق الفريق."
    ],
    subsections: [
      {
        title: "10.1 المحادثة والرسائل",
        content: [
          "إرسال واستقبال الرسائل مع أعضاء الفريق",
          "قوالب رسائل سريعة للاتصالات الميدانية الشائعة",
          "يتم تسليم الرسائل عبر الإشعارات الفورية",
          "سجل المحادثات متزامن عبر الأجهزة",
          "مشاركة الصور والموقع داخل المحادثة"
        ]
      },
      {
        title: "10.2 المكالمات الصوتية والمرئية",
        content: [
          "مكالمات صوتية WebRTC للاتصال الصوتي",
          "مكالمات فيديو WebRTC لمؤتمرات الفيديو",
          "واجهة المكالمة تظهر أثناء المكالمات النشطة",
          "ميزات مكالمات محسّنة تشمل كتم الصوت ومكبر الصوت والانتظار",
          "جدولة المكالمات للاجتماعات المخططة مع الفريق"
        ]
      },
      {
        title: "10.3 الملاحظات الصوتية",
        content: [
          "تسجيل ملاحظات صوتية أثناء زيارات المواقع",
          "مسجل صوتي مع إمكانية التشغيل",
          "الملاحظات الصوتية مرفقة بزيارة الموقع الحالية",
          "مفيدة لتسجيل الملاحظات التي يصعب كتابتها",
          "تتم مزامنة الملاحظات الصوتية مع الخادم عند الاتصال"
        ]
      },
      {
        title: "10.4 الإشعارات",
        content: [
          "إشعارات فورية لتعيينات المواقع الجديدة",
          "إشعارات الموافقة/الرفض لطلبات التكاليف",
          "إعلانات الفريق من المسؤولين",
          "إشعارات اكتمال المزامنة",
          "إشعارات ثنائية اللغة بالإنجليزية والعربية",
          "مركز الإشعارات لعرض جميع الإشعارات السابقة",
          "واجهة الإشعارات تعرض التنبيهات ذات الأولوية"
        ]
      }
    ]
  },
  {
    title: "11. الإعدادات والتفضيلات",
    content: [
      "خصص التطبيق حسب تفضيلاتك."
    ],
    subsections: [
      {
        title: "11.1 إعدادات اللغة",
        content: [
          "التبديل بين الإنجليزية والعربية في أي وقت",
          "استخدم مبدل اللغة في شاشة الإعدادات",
          "تتحدث الواجهة بالكامل إلى اللغة المحددة",
          "يتم حفظ تفضيل اللغة وتذكره"
        ]
      },
      {
        title: "11.2 الوضع الداكن",
        content: [
          "تبديل الوضع الداكن للعرض المريح في الإضاءة المنخفضة",
          "استخدم مفتاح الوضع الداكن في الإعدادات أو الرأس",
          "الوضع الداكن يقلل إجهاد العين أثناء العمل الميداني المسائي",
          "يتم حفظ تفضيل المظهر عبر الجلسات"
        ]
      },
      {
        title: "11.3 وضع النطاق الترددي المنخفض",
        content: [
          "فعّل وضع النطاق الترددي المنخفض عند الاتصال البطيء",
          "يقلل استخدام البيانات بضغط الصور وتقليل تكرار المزامنة",
          "مفيد في المناطق النائية ذات بيانات الهاتف المحدودة",
          "التبديل من الإعدادات > الأداء"
        ]
      },
      {
        title: "11.4 معلومات الجهاز",
        content: [
          "عرض تفاصيل جهازك وإصدار التطبيق في الإعدادات",
          "تعرض مساحة التخزين المتاحة",
          "تعرض دقة GPS الحالية",
          "حالة البطارية ونصائح التحسين",
          "إصدار التطبيق ورقم البناء للرجوع إليها عند الدعم"
        ]
      },
      {
        title: "11.5 الملف الشخصي والصورة الرمزية",
        content: [
          "تعديل صورة ملفك الشخصي باستخدام محرر الصورة الرمزية",
          "التقط صورة جديدة أو اختر من المعرض",
          "اقتصاص وتعديل صورة ملفك الشخصي",
          "تحديثات الملف الشخصي تتزامن مع المنصة الإلكترونية"
        ]
      }
    ]
  },
  {
    title: "12. المساعدة والدعم",
    content: [
      "احصل على المساعدة والدعم مباشرة من التطبيق."
    ],
    subsections: [
      {
        title: "12.1 مقالات المساعدة",
        content: [
          "الوصول إلى مقالات المساعدة من قائمة المزيد",
          "تغطي المقالات الأسئلة الشائعة وأدلة الاستخدام",
          "تُدار المقالات بواسطة المسؤولين وتُحدث بانتظام",
          "متاحة بالإنجليزية والعربية"
        ]
      },
      {
        title: "12.2 تذاكر الدعم",
        content: [
          "تقديم تذكرة دعم للمشاكل التقنية",
          "صف مشكلتك بالنص ولقطات الشاشة",
          "تتبع حالة تذاكرك المقدمة",
          "تلقي إشعارات عند الرد على تذكرتك",
          "المسؤولون يديرون التذاكر من لوحة التحكم الإلكترونية"
        ]
      },
      {
        title: "12.3 جهات اتصال الدعم",
        content: [
          "عرض أرقام جهات اتصال الدعم المُدارة من المسؤولين",
          "اتصال سريع بجهات الدعم مباشرة من التطبيق",
          "الجهات مُنظمة حسب المنطقة والدور",
          "جهات اتصال الطوارئ مُبرزة في الأعلى"
        ]
      },
      {
        title: "12.4 طوارئ SOS",
        content: [
          "زر طوارئ SOS متاح للمواقف الحرجة",
          "يُرسل موقعك GPS لجهات اتصال الطوارئ المحددة",
          "يمكن الوصول إليه من قائمة الإجراءات السريعة",
          "استخدم في حالات الطوارئ الحقيقية فقط"
        ]
      }
    ]
  },
  {
    title: "13. تحديثات التطبيق",
    content: [
      "يتلقى تطبيق PACT تحديثات عبر تقنية Shorebird OTA (عبر الهواء)."
    ],
    subsections: [
      {
        title: "13.1 كيف تعمل التحديثات",
        content: [
          "يتم توصيل تحديثات التطبيق مباشرة إلى جهازك دون الحاجة لمتجر التطبيقات",
          "تتيح تقنية Shorebird OTA تحديثات فورية للكود",
          "تُثبت التحديثات بصمت في الخلفية",
          "سيتم إعلامك عند توفر تحديث جديد",
          "بعض التحديثات الكبرى قد تتطلب تنزيل ملف APK جديد"
        ]
      },
      {
        title: "13.2 التحقق من التحديثات",
        content: [
          "افتح الإعدادات > حول للتحقق من إصدارك الحالي",
          "يتحقق التطبيق تلقائياً من التحديثات عند الاتصال بالإنترنت",
          "التحقق اليدوي من التحديثات متاح في الإعدادات",
          "حافظ دائماً على تحديث التطبيق لأفضل تجربة وأمان"
        ]
      }
    ]
  },
  {
    title: "14. استكشاف الأخطاء وإصلاحها",
    content: [
      "المشاكل الشائعة وحلولها لتطبيق الهاتف."
    ],
    subsections: [
      {
        title: "14.1 مشاكل تسجيل الدخول",
        content: [
          "تحقق من صحة البريد الإلكتروني وكلمة المرور",
          "تحقق من اتصال الإنترنت",
          "جرب إغلاق التطبيق وإعادة فتحه",
          "استخدم 'نسيت كلمة المرور' لإعادة تعيين كلمة المرور",
          "اتصل بالمسؤول إذا كان حسابك مقفلاً",
          "امسح ذاكرة التخزين المؤقت في إعدادات الجهاز > التطبيقات > PACT > مسح ذاكرة التخزين المؤقت"
        ]
      },
      {
        title: "14.2 مشاكل GPS",
        content: [
          "فعّل وضع الدقة العالية في إعدادات الموقع بالجهاز",
          "امنح أذونات الموقع لتطبيق PACT",
          "تأكد من وجودك في الخارج مع رؤية واضحة للسماء",
          "أعد تشغيل التطبيق إذا لم يتم تحديث الموقع",
          "تحقق أن وضع توفير البطارية لا يقيد وصول GPS",
          "أعد تشغيل جهازك إذا استمرت مشاكل GPS"
        ]
      },
      {
        title: "14.3 مشاكل المزامنة",
        content: [
          "تحقق من وجود اتصال إنترنت مستقر",
          "اسحب لأسفل لبدء المزامنة يدوياً",
          "تحقق من مؤشر حالة المزامنة للعناصر المعلقة",
          "أغلق التطبيق بالقوة وأعد فتحه",
          "إذا فشلت المزامنة بشكل متكرر، تحقق من تحديثات التطبيق",
          "اتصل بالدعم إذا بدت البيانات مفقودة بعد المزامنة"
        ]
      },
      {
        title: "14.4 مشاكل الكاميرا",
        content: [
          "تأكد من منح إذن الكاميرا لتطبيق PACT",
          "أغلق التطبيقات الأخرى التي قد تستخدم الكاميرا",
          "تحقق من مساحة التخزين المتاحة على جهازك",
          "أعد تشغيل التطبيق إذا لم تستجب الكاميرا",
          "الصور تُحفظ محلياً قبل الرفع"
        ]
      },
      {
        title: "14.5 تعطل التطبيق",
        content: [
          "تأكد من وجود أحدث إصدار من التطبيق",
          "امسح ذاكرة التخزين المؤقت: الإعدادات > التطبيقات > PACT > مسح ذاكرة التخزين المؤقت",
          "تأكد من وجود مساحة تخزين فارغة كافية (100 ميجابايت على الأقل)",
          "أعد تشغيل جهازك",
          "إذا استمر التعطل، أعد تثبيت التطبيق (بياناتك متزامنة مع الخادم)",
          "أبلغ عن التعطلات المستمرة عبر تذكرة دعم"
        ]
      },
      {
        title: "14.6 تحسين البطارية",
        content: [
          "يستخدم التطبيق GPS مما قد يستنزف البطارية",
          "فعّل تحسين البطارية للمهام الخلفية",
          "استخدم وضع النطاق الترددي المنخفض لتقليل معالجة البيانات",
          "مؤشر حالة البطارية ينبهك عند انخفاض البطارية",
          "احمل شاحناً متنقلاً للعمل الميداني الممتد",
          "أغلق التطبيقات غير المستخدمة لتوفير البطارية"
        ]
      }
    ]
  },
  {
    title: "15. الإيماءات والاختصارات",
    content: [
      "تعلم الإيماءات والاختصارات للتنقل في التطبيق بكفاءة."
    ],
    subsections: [
      {
        title: "15.1 إيماءات اللمس",
        content: [
          "التمرير يمين/يسار: التنقل بين العناصر أو التبويبات",
          "السحب لأسفل: تحديث البيانات على أي شاشة",
          "الضغط المطول: الوصول إلى قائمة السياق أو الخيارات الإضافية",
          "القرص: التكبير/التصغير على الخرائط والصور",
          "الضغط المزدوج: التكبير السريع على الخرائط",
          "التمرير من الحافة: العودة إلى الشاشة السابقة"
        ]
      },
      {
        title: "15.2 نصائح سريعة",
        content: [
          "قم بتنزيل الخرائط قبل الذهاب إلى مناطق بدون إنترنت",
          "فعّل GPS عالي الدقة قبل بدء زيارات المواقع",
          "تحقق من حالة المزامنة قبل إنهاء جلسة عملك",
          "استخدم الملاحظات الصوتية للملاحظات الميدانية السريعة",
          "حافظ على تحديث التطبيق للحصول على أحدث الميزات والإصلاحات",
          "استخدم الوضع الداكن في المساء لتقليل إجهاد العين"
        ]
      }
    ]
  }
];

export const getMobileDocumentationSections = () => mobileDocumentationSections;
export const getArabicMobileDocumentationSections = () => arabicMobileDocumentationSections;

export const generateMobileUserManualPDF = () => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;
  const margin = 14;
  const maxWidth = pageWidth - (margin * 2);
  const lineHeight = 5;

  const checkPageBreak = (neededSpace: number) => {
    if (yPos + neededSpace > pageHeight - 20) {
      doc.addPage();
      yPos = 20;
      return true;
    }
    return false;
  };

  doc.setFontSize(24);
  doc.setTextColor(59, 130, 246);
  doc.text('PACT Mobile App', pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text('Mobile User Manual', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;
  doc.text('Version 3.0 | February 2026', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 10;

  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246);
  doc.text('Table of Contents', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);

  mobileDocumentationSections.forEach((section) => {
    checkPageBreak(6);
    doc.text(section.title, margin + 5, yPos);
    yPos += 5;
  });

  doc.addPage();
  yPos = 20;

  mobileDocumentationSections.forEach((section) => {
    checkPageBreak(20);

    doc.setFontSize(14);
    doc.setTextColor(59, 130, 246);
    doc.text(section.title, margin, yPos);
    yPos += 8;

    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);

    section.content.forEach((line) => {
      const splitText = doc.splitTextToSize(line, maxWidth);
      splitText.forEach((textLine: string) => {
        checkPageBreak(lineHeight);
        doc.text(textLine, margin, yPos);
        yPos += lineHeight;
      });
    });
    yPos += 3;

    if (section.subsections) {
      section.subsections.forEach((sub) => {
        checkPageBreak(15);

        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text(sub.title, margin + 5, yPos);
        yPos += 6;

        doc.setFontSize(9);
        doc.setTextColor(0, 0, 0);
        sub.content.forEach((line) => {
          const bulletLine = line.startsWith('-') ? line : `- ${line}`;
          const splitText = doc.splitTextToSize(bulletLine, maxWidth - 15);
          splitText.forEach((textLine: string) => {
            checkPageBreak(lineHeight);
            doc.text(textLine, margin + 10, yPos);
            yPos += lineHeight;
          });
        });
        yPos += 3;
      });
    }
    yPos += 5;
  });

  const filename = `PACT_Mobile_User_Manual_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(filename);
};

export const generateMobileUserManualDOCX = async () => {
  const children: any[] = [];

  children.push(
    new Paragraph({
      text: "PACT Mobile App",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: "Mobile User Manual",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Generated: ${format(new Date(), 'PPpp')}`, size: 20 })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Version 3.0 | February 2026", size: 20 })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    }),
    new Paragraph({
      text: "Table of Contents",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 200 }
    })
  );

  mobileDocumentationSections.forEach((section) => {
    children.push(
      new Paragraph({
        text: section.title,
        spacing: { after: 100 }
      })
    );
  });

  children.push(
    new Paragraph({
      text: "",
      pageBreakBefore: true
    })
  );

  mobileDocumentationSections.forEach((section) => {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 }
      })
    );

    section.content.forEach((line) => {
      children.push(
        new Paragraph({
          text: line,
          spacing: { after: 100 }
        })
      );
    });

    if (section.subsections) {
      section.subsections.forEach((sub) => {
        children.push(
          new Paragraph({
            text: sub.title,
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 200, after: 100 }
          })
        );

        sub.content.forEach((line) => {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `\u2022 ${line}` })
              ],
              spacing: { after: 50 },
              indent: { left: convertInchesToTwip(0.25) }
            })
          );
        });
      });
    }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `PACT_Mobile_User_Manual_${format(new Date(), 'yyyy-MM-dd')}.docx`;
  saveAs(blob, filename);
};

export const generateArabicMobileUserManualDOCX = async () => {
  const children: any[] = [];

  children.push(
    new Paragraph({
      text: "تطبيق PACT للهاتف المحمول",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: "دليل المستخدم للهاتف المحمول",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Generated: ${format(new Date(), 'PPpp')}`, size: 20 })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "الإصدار 3.0 | فبراير 2026", size: 20 })
      ],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 400 }
    }),
    new Paragraph({
      text: "جدول المحتويات",
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.RIGHT,
      bidirectional: true,
      spacing: { after: 200 }
    })
  );

  arabicMobileDocumentationSections.forEach((section) => {
    children.push(
      new Paragraph({
        text: section.title,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { after: 100 }
      })
    );
  });

  children.push(
    new Paragraph({
      text: "",
      pageBreakBefore: true
    })
  );

  arabicMobileDocumentationSections.forEach((section) => {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.RIGHT,
        bidirectional: true,
        spacing: { before: 400, after: 200 }
      })
    );

    section.content.forEach((line) => {
      children.push(
        new Paragraph({
          text: line,
          alignment: AlignmentType.RIGHT,
          bidirectional: true,
          spacing: { after: 100 }
        })
      );
    });

    if (section.subsections) {
      section.subsections.forEach((sub) => {
        children.push(
          new Paragraph({
            text: sub.title,
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.RIGHT,
            bidirectional: true,
            spacing: { before: 200, after: 100 }
          })
        );

        sub.content.forEach((line) => {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `\u2022 ${line}` })
              ],
              alignment: AlignmentType.RIGHT,
              bidirectional: true,
              spacing: { after: 50 },
              indent: { right: convertInchesToTwip(0.25) }
            })
          );
        });
      });
    }
  });

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `PACT_Mobile_User_Manual_Arabic_${format(new Date(), 'yyyy-MM-dd')}.docx`;
  saveAs(blob, filename);
};
