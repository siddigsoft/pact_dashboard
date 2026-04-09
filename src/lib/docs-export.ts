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

interface WorkflowStep {
  step: string;
  action: string;
  who: string;
  details: string;
}

const documentationSections: Section[] = [
  {
    title: "1. Introduction",
    content: [
      "PACT Command Center is the centralized Field Operations Command Center designed for comprehensive management of humanitarian and development field operations. The platform serves as a unified command hub that enables organizations to plan, coordinate, execute, and monitor all field activities from a single integrated interface."
    ],
    subsections: [
      {
        title: "1.1 About PACT Command Center",
        content: [
          "Monthly Monitoring Plans (MMPs) - Strategic planning and site targeting for field activities",
          "Site Visit Management - End-to-end coordination with GPS tracking and photo documentation",
          "Team Coordination Center - Real-time location sharing, voice/video calling (WebRTC), and instant messaging",
          "Financial Control System - Budgets, digital wallets, cost submissions, multi-tier approvals, and Bank of Khartoum integration",
          "Role-Based Security - 12 specialized user roles with granular permission control",
          "Mobile-First Design - Native Android app with full offline capability for remote field operations",
          "Email Notifications - IONOS SMTP integration (noreply@pactorg.com) with popup action buttons"
        ]
      },
      {
        title: "1.2 Key Benefits",
        content: [
          "Streamlined Workflows: Automate approval processes and reduce manual coordination",
          "Real-Time Visibility: Track field team locations and site visit progress instantly",
          "Financial Control: Manage budgets, track expenses, and approve payments",
          "Role-Based Security: Ensure users only access what they need",
          "Mobile-Ready: Native Android app with offline capabilities",
          "Data Integrity: Complete audit trails for all operations",
          "Smart Dispatch: Uber/Lyft-style site claiming for field teams",
          "Classification Fees: Automatic fee calculation based on enumerator level"
        ]
      },
      {
        title: "1.3 System Requirements",
        content: [
          "Web Browser: Chrome 90+, Firefox 88+, Edge 90+, Safari 14+",
          "Mobile: Android 8.0 (API 26) or later, iOS 13.0 or later",
          "Minimum 2GB RAM recommended",
          "GPS/Location services enabled"
        ]
      }
    ]
  },
  {
    title: "2. Complete System Workflow A to Z",
    content: [
      "This section provides a comprehensive overview of the entire PACT system workflow, from initial setup to final payment processing. The system operates through five key phases."
    ],
    subsections: [
      {
        title: "2.1 Phase 1: Setup & Planning",
        content: [
          "Step A: System Configuration - Admin/ICT configures roles, fees, hubs, system settings",
          "Step B: User Onboarding - Registration, verification, role & classification assignment",
          "Step C: Project Creation - Create project, timeline, assign manager, build team",
          "Step D: Budget Allocation - Create budget, link to project, set categories"
        ]
      },
      {
        title: "2.2 Phase 2: MMP Lifecycle",
        content: [
          "Step E: MMP Preparation & Upload - Prepare CSV, upload file, validate data, submit",
          "Step F: MMP Review & Approval - Review, verify, check permits, approve, forward to FOM",
          "Step G: Permit Management - Upload permit, enter details, verification, link to sites"
        ]
      },
      {
        title: "2.3 Phase 3: Dispatch & Claiming",
        content: [
          "Step H: Site Dispatch - Select sites, choose mode (Open/State/Locality/Individual), execute",
          "Step I: Site Claiming - View available sites, select site, claim, atomic lock",
          "Step J: Claim Acceptance - Review claim, accept, calculate fees based on classification"
        ]
      },
      {
        title: "2.4 Phase 4: Field Operations",
        content: [
          "Step K: Starting a Site Visit - Open assignment, travel to site, GPS auto-captured, start visit",
          "Step L: Data Collection - GPS capture, take photos, fill forms, local save (offline)",
          "Step M: Completing a Site Visit - Review data, complete visit, sync to server, calculate payment",
          "Step N: Visit Verification - Review submission, verify location & photos, approve/reject"
        ]
      },
      {
        title: "2.5 Phase 5: Financial Processing",
        content: [
          "Step O: Wallet Credit (Automatic) - Automatic payment on completion, create transaction, update balance",
          "Step P: Cost Submission & Approval - Submit expenses, attach receipts, supervisor & finance approval",
          "Step Q: Tracker & Invoice Preparation - Access tracker, view analysis, export data, generate invoice",
          "Step R: Reporting & Analytics - Generate reports, set parameters, view dashboard, export",
          "Step S: Archive & Closure - Review completion, generate final report, archive MMP, close project"
        ]
      },
      {
        title: "2.6 Role Responsibilities Matrix",
        content: [
          "Setup Phase: Admin/ICT configures system, Finance sets budgets, Users register",
          "MMP Phase: Coordinator prepares CSV, ICT uploads, Admin/ICT approves",
          "Dispatch Phase: FOM executes dispatch, Collectors claim sites",
          "Field Phase: Collectors execute visits, Supervisors verify data",
          "Finance Phase: System credits wallets, Finance approves payments, Admin archives"
        ]
      }
    ]
  },
  {
    title: "3. Getting Started",
    content: [
      "This section guides you through account setup and first-time configuration."
    ],
    subsections: [
      {
        title: "3.1 Account Registration",
        content: [
          "Navigate to the PACT platform URL",
          "Click 'Get Started' on the landing page",
          "Click 'Register' to create a new account",
          "Fill in: Full Name, Email, Phone, Password (min 8 characters)",
          "Select your primary role",
          "Click 'Create Account'",
          "Check email for verification link",
          "Click verification link to activate account"
        ]
      },
      {
        title: "3.2 Logging In",
        content: [
          "Go to the login page",
          "Enter your registered email address",
          "Enter your password",
          "Click 'Sign In'",
          "If 2FA is enabled, enter the verification code",
          "You will be redirected to your personalized dashboard"
        ]
      },
      {
        title: "3.3 Forgot Password",
        content: [
          "Click 'Forgot Password?' on the login page",
          "Enter your registered email address",
          "Click 'Send Reset Link'",
          "Check your email for the password reset link",
          "Click the link and create a new password",
          "Log in with your new password"
        ]
      },
      {
        title: "3.4 First-Time Setup",
        content: [
          "Update Profile: Add your profile photo and contact details",
          "Set Preferences: Configure notifications and display settings",
          "Review Permissions: Understand what actions you can perform",
          "Enable Location: Allow location access for field operations",
          "Install Mobile App: Download the Android app for field work"
        ]
      }
    ]
  },
  {
    title: "4. Dashboard Overview",
    content: [
      "The Mission Control Dashboard is your central hub for all operations."
    ],
    subsections: [
      {
        title: "4.1 Dashboard Zones",
        content: [
          "Operations Center: Total Operations, Completed Visits, Active Operations, Pending Queue, Overdue Alerts, Performance Score",
          "Planning Zone: View upcoming site visits, Track MMP progress, See pending assignments",
          "Performance Zone: KPIs, Completion statistics, Trend analysis",
          "Team Zone: Field team locations, Online/offline status, Quick team actions",
          "Compliance Zone: Audit status, Compliance metrics, Pending verifications"
        ]
      },
      {
        title: "4.2 Quick Actions",
        content: [
          "Create Site Visit: Start a new site visit assignment",
          "Upload MMP: Import monthly monitoring plans",
          "View Reports: Access analytics and reports",
          "Search: Global search across all data"
        ]
      },
      {
        title: "4.3 Notifications",
        content: [
          "New assignments",
          "Approval requests",
          "System alerts",
          "Message notifications",
          "Site claim updates",
          "Click on any notification to view details or take action"
        ]
      },
      {
        title: "4.4 Live Mode Toggle",
        content: [
          "Toggle 'Live' mode to enable:",
          "Real-time data updates",
          "Automatic refresh",
          "Live location tracking",
          "Instant notifications"
        ]
      }
    ]
  },
  {
    title: "5. User Management",
    content: [
      "Manage users, roles, classifications, and account settings."
    ],
    subsections: [
      {
        title: "5.1 User Roles Overview",
        content: [
          "Super Admin: Highest authority with full system access, manage super admins, view/restore deleted records",
          "Admin: System administrator - User management, role management, project/MMP/site visit CRUD",
          "ICT: Technical administrator - System configuration, user support, MMP management",
          "Field Operation Manager (FOM): Manages field operations - MMP approval, team coordination",
          "Financial Admin: Manages financial operations - Budget management, payment approvals",
          "Supervisor: Supervises field teams - Team monitoring, site visit review",
          "Coordinator: Coordinates field activities - Site visit management",
          "Data Collector: Collects field data - Site visit execution, site claiming",
          "Reviewer: Reviews submissions - Read-only access to verify data"
        ]
      },
      {
        title: "5.2 User Classifications",
        content: [
          "Classification A (Senior): Highest fee tier, experienced enumerators, 2+ years experience",
          "Classification B (Standard): Mid-level fee tier, 1-2 years experience",
          "Classification C (Junior): Entry-level fee tier, less than 1 year experience"
        ]
      },
      {
        title: "5.3 Viewing Users",
        content: [
          "Navigate to Users from the sidebar",
          "View the list of all users in the system",
          "Use filters: By role, By status (active/inactive), By classification, By name or email"
        ]
      },
      {
        title: "5.4 Managing User Status",
        content: [
          "Activate/deactivate user accounts",
          "Reset user passwords",
          "Update user information",
          "Assign/remove roles",
          "Change classification level"
        ]
      }
    ]
  },
  {
    title: "6. Role-Based Access Control",
    content: [
      "The system uses granular permissions organized by resource and action."
    ],
    subsections: [
      {
        title: "6.1 Understanding Permissions",
        content: [
          "Resource-action based: mmp:read, site_visits:create, etc.",
          "Granular permissions for each feature module",
          "Admin bypass for emergency access",
          "Enforced across UI, route guards, and server-side RLS"
        ]
      },
      {
        title: "6.2 Role Management",
        content: [
          "Go to Role Management from the sidebar",
          "Click 'Create Role'",
          "Enter: Role Name, Display Name, Description, Category",
          "Select permissions using presets or individual selection",
          "Click 'Create Role'"
        ]
      },
      {
        title: "6.3 Permission Templates",
        content: [
          "Project Manager: Overseeing projects and teams",
          "Field Supervisor: Managing field operations",
          "Finance Officer: Financial operations and approvals",
          "Data Analyst: Reporting and data analysis",
          "State Coordinator: State-level activity coordination",
          "HR Manager: User account management",
          "Auditor: Read-only compliance review",
          "Technical Support: System configuration and support"
        ]
      }
    ]
  },
  {
    title: "7. Projects Management",
    content: [
      "Create and manage projects with teams, activities, and budgets."
    ],
    subsections: [
      {
        title: "7.1 Creating a Project",
        content: [
          "Navigate to Projects from the sidebar",
          "Click 'Create Project'",
          "Fill in: Project Name, Description, Start/End Date, Project Manager, Budget",
          "Click 'Create Project'"
        ]
      },
      {
        title: "7.2 Project Details",
        content: [
          "Overview: Basic project information",
          "Team: Assigned team members",
          "Activities: Project activities and tasks",
          "MMPs: Associated Monthly Monitoring Plans",
          "Site Visits: Related site visits",
          "Budget: Financial allocation",
          "Timeline: Project schedule"
        ]
      },
      {
        title: "7.3 Managing Project Team",
        content: [
          "Open the project",
          "Go to Team tab",
          "Click 'Add Team Member'",
          "Search and select users",
          "Assign team roles",
          "Click 'Add'"
        ]
      },
      {
        title: "7.4 Project Status",
        content: [
          "Draft: Initial creation",
          "Active: Currently running",
          "Completed: Successfully finished",
          "On Hold: Temporarily paused",
          "Cancelled: Terminated"
        ]
      }
    ]
  },
  {
    title: "8. Monthly Monitoring Plans (MMPs) - Complete Guide",
    content: [
      "Monthly Monitoring Plans (MMPs) are the backbone of field operations in PACT. An MMP is a structured plan that defines which sites need to be monitored during a given period, including the monitoring schedule, assigned personnel, budget allocation, and permit requirements. This section provides a complete end-to-end guide from uploading an MMP to completing all site visits and receiving payment."
    ],
    subsections: [
      {
        title: "8.1 Understanding MMPs",
        content: [
          "An MMP contains a list of field sites that need monitoring visits during a specific month or period",
          "Each site entry includes: Site Code, Site Name, State, Locality, Hub Office, Activity Type, CP Name (Cooperating Partner), Planned Visit Date",
          "Activities include: AM (Acute Malnutrition), DM (Distribution Monitoring), MDM (Market/Dry Monitoring), PDM (Post-Distribution Monitoring), Warehouse monitoring",
          "MMPs flow through a multi-stage approval process before sites become available for field visits",
          "Each MMP is linked to a project and can contain hundreds of site entries across multiple states and localities"
        ]
      },
      {
        title: "8.2 Step 1: MMP Upload (Admin/ICT/Coordinator)",
        content: [
          "Navigate to 'MMP Management' from the sidebar",
          "Click 'Upload MMP' button",
          "Select the project this MMP belongs to",
          "Choose and upload a CSV file containing site entries",
          "Required CSV columns: site_code, site_name, state, locality, hub_office, activity_at_site, cp_name, visit_date",
          "Optional CSV columns: monitoring_by, survey_tool, comments, classification, special_requirements",
          "The system validates the CSV data using Zod schema validation",
          "Validation checks: Required fields present, date format correct, no duplicate site codes",
          "If validation passes, the MMP is created with 'Draft' status",
          "If validation fails, error messages indicate which rows/columns need correction",
          "You can also use the Excel Upload Parser for bulk import with auto-population features"
        ]
      },
      {
        title: "8.3 Step 2: MMP Review & Approval (Admin/ICT)",
        content: [
          "Navigate to the 'New' tab in MMP Management to see uploaded MMPs",
          "Click on an MMP to view its details and site entries",
          "Review each site entry for accuracy: correct site codes, proper state/locality mapping, valid dates",
          "The admin can edit individual site entries if corrections are needed",
          "Options available: Approve (moves to 'Approved' status), Reject (returns to uploader with notes), Request Changes (sends back for modifications)",
          "Approved MMPs become eligible for the next stage: forwarding to Field Operations Manager (FOM)",
          "The 'Forward to FOM' action sends the MMP to the field operations team for dispatch planning"
        ]
      },
      {
        title: "8.4 Step 3: Permit Verification (If Required)",
        content: [
          "Some localities require monitoring permits before field visits can proceed",
          "The system checks the Locality Permit Requirement configuration for each site",
          "If a permit is required, the 'Permit Upload' option appears on the MMP detail page",
          "Upload the permit document (PDF/Image)",
          "Enter permit details: Permit Number, Issue Date, Expiry Date, Issuing Authority",
          "Submit permit for verification by the admin team",
          "Sites without required permits will be flagged and cannot be dispatched",
          "Once verified, the permit is linked to the relevant site entries"
        ]
      },
      {
        title: "8.5 Step 4: Site Verification (Admin/ICT)",
        content: [
          "After approval, sites go through a verification process",
          "Admin/ICT reviews each site entry to confirm: Location accuracy, Permit status, Fee structure correctness",
          "Verified sites are marked with a green checkmark",
          "The 'Verified Sites' tab shows all sites grouped by status: New Sites, Approved & Costed, Dispatched, Smart Assigned, Accepted, Ongoing, Completed, Rejected",
          "Each sub-tab provides different views and actions appropriate to that stage",
          "Cost assignment happens here: Enumerator Fee and Transport Fee are set based on classification level and site location"
        ]
      },
      {
        title: "8.6 Step 5: Dispatching Sites (FOM/Admin)",
        content: [
          "Once sites are verified and costed, they can be dispatched to field teams",
          "Open the MMP and navigate to verified sites",
          "Select the sites to dispatch (individually or in bulk)",
          "Choose a dispatch mode:",
          "  - Open Dispatch: Sites available to ALL qualified data collectors (first-come, first-served)",
          "  - State Dispatch: Sites only visible to collectors in the same state",
          "  - Locality Dispatch: Sites only visible to collectors in the same state AND locality",
          "  - Individual Dispatch: Direct assignment to a specific data collector",
          "Click 'Dispatch' to make sites available",
          "Dispatched sites appear in collectors' 'Claimable' tab on mobile/web",
          "Smart Assignment: The system can also auto-assign sites to nearby collectors based on GPS proximity, workload, and classification"
        ]
      },
      {
        title: "8.7 Step 6: Site Claiming (Data Collector - Mobile/Web)",
        content: [
          "Data Collectors open the MMP page on their mobile device or web browser",
          "Three main tabs appear: Claimable (available sites), Assigned (smart-assigned sites), My Sites (claimed/accepted sites)",
          "CLAIMABLE TAB: Shows all dispatched sites in the collector's area, grouped by State-Locality",
          "  - Each site card shows: Site Name, Code, Activity Type, Planned Date, Fees",
          "  - Click 'Claim Site' to reserve a site for yourself",
          "  - The system uses atomic database transactions to prevent race conditions",
          "  - Only ONE collector can successfully claim each site",
          "  - Upon claiming, your classification fees (Enumerator Fee + Transport Fee) are calculated and locked in",
          "ASSIGNED TAB: Shows sites assigned to you by the system or operations team",
          "  - These are mandatory visits that must be completed",
          "  - Click 'Accept' to acknowledge the assignment",
          "  - Click 'Acknowledge Cost' to confirm the fee amount"
        ]
      },
      {
        title: "8.8 Step 7: My Sites Tabs (Data Collector - Mobile/Web)",
        content: [
          "After claiming or being assigned sites, they appear in the 'My Sites' section with four sub-tabs:",
          "",
          "INBOX TAB (Green): Shows sites that are ready to start - Accepted, Claimed, Dispatched, Assigned, Verified, or Approved status",
          "  - These are sites waiting for you to begin the visit",
          "  - Each site shows: Name, Code, Location, Activity Type, Status Badge, Total Fee",
          "  - Actions available: 'Start Visit' button to begin the site visit, 'Request Advance' for transportation advance payment",
          "  - Badge count shows the number of sites in your inbox",
          "",
          "DRAFTS TAB (Blue): Shows sites with 'In Progress' or 'Ongoing' status",
          "  - These are site visits that you have STARTED but not yet COMPLETED",
          "  - You can continue data collection on these sites",
          "  - Actions available: 'Complete Site Visit' button to finish and submit data",
          "  - GPS tracking is active during these visits",
          "  - Data is saved locally and syncs when connected",
          "  - Badge count shows the number of in-progress visits",
          "",
          "OUTBOX TAB (Yellow): Shows completed visits that are stored offline and waiting to sync",
          "  - These visits were completed without internet connection",
          "  - Data is stored locally on your device",
          "  - When internet is available, data automatically syncs to the server",
          "  - Once synced, the visit moves to the 'Sent' tab",
          "  - Badge count shows the number of unsynced completed visits",
          "",
          "SENT TAB (Green): Shows fully completed and synced visits",
          "  - These visits have been submitted to the server successfully",
          "  - Payment has been calculated and credited to your wallet",
          "  - View details of completed visits: date, location, photos, fees",
          "  - No further actions required on these sites",
          "  - Badge count shows the number of synced completed visits"
        ]
      },
      {
        title: "8.9 Step 8: Conducting a Site Visit",
        content: [
          "From the Inbox tab, tap 'Start Visit' on a site",
          "The visit status changes to 'In Progress' and moves to the Drafts tab",
          "GPS location is automatically captured when you arrive at the site",
          "Data collection includes: GPS coordinates (automatic), Site photos (camera capture), Survey form responses, Observations and comments",
          "You can pause and resume the visit if needed - data is saved locally",
          "When all required data is collected, tap 'Complete Site Visit'",
          "The system verifies all required fields are filled and photos are taken",
          "Completed visit data is queued for server sync",
          "If online: Data syncs immediately and payment is calculated",
          "If offline: Data is stored in Outbox until internet connection is restored"
        ]
      },
      {
        title: "8.10 Step 9: Transportation Advance (Optional)",
        content: [
          "Before starting a visit, you can request a transportation advance",
          "Available for sites with transport budget allocated (Transport Fee > 0)",
          "From Inbox, click 'Request Advance' on an accepted/claimed site",
          "Enter the requested amount (up to the allocated Transport Fee)",
          "The request goes through two-tier approval: Supervisor approval (first level), then Admin/Finance approval (final level)",
          "Approved advances are credited to your wallet immediately",
          "When the site visit is completed, the advance is automatically deducted from the final payment",
          "The wallet page shows a reconciliation of advances vs. earned fees",
          "Digital signature-based receipt confirmation is required for advance acknowledgment"
        ]
      },
      {
        title: "8.11 Step 10: Visit Completion & Wallet Payment",
        content: [
          "When a site visit is marked as 'Completed' and synced to the server:",
          "1. The system calculates the total payment: Enumerator Fee + Transport Fee",
          "2. If a transportation advance was taken, it is deducted from the total",
          "3. The net amount is credited to your digital wallet as a 'Site Visit Fee' transaction",
          "4. A wallet transaction record is created with full details: Site Name, MMP reference, Fee breakdown, Date/Time",
          "5. Your wallet balance is updated immediately",
          "6. You receive a notification confirming the payment",
          "",
          "WALLET PAGE shows:",
          "  - Current Balance: Available funds in SDG",
          "  - Total Earned: Lifetime earnings from all completed visits",
          "  - Pending: Amounts awaiting approval or processing",
          "  - This Month: Current month's earnings",
          "  - Transaction History: Full list of all credits, debits, advances, and withdrawals",
          "  - Monthly Statement: Summary with advances receivable and reconciliation"
        ]
      },
      {
        title: "8.12 Complete Site Status Flow Chart",
        content: [
          "The complete lifecycle of a site from MMP upload to wallet payment follows this status flow:",
          "",
          "1. DRAFT → MMP uploaded, site entries created in the system",
          "2. SUBMITTED → MMP sent for review by admin team",
          "3. APPROVED → Admin approved the MMP and its site entries",
          "4. VERIFIED → Individual sites verified for accuracy and fees assigned",
          "5. DISPATCHED → Sites made available for field collectors (visible in Claimable tab)",
          "6. CLAIMED → A data collector has claimed the site (locked to that collector)",
          "7. ACCEPTED → The claim is confirmed, fees locked in (appears in Inbox tab)",
          "8. IN PROGRESS → Collector has started the visit, GPS tracking active (appears in Drafts tab)",
          "9. COMPLETED → Data collection finished, submitted to server (appears in Sent tab)",
          "10. WALLET CREDITED → Payment automatically calculated and added to collector's wallet",
          "",
          "Additional statuses:",
          "  - ASSIGNED: Site directly assigned to a collector (skips claiming)",
          "  - ONGOING: Alternative status for visits in progress",
          "  - REJECTED: Visit rejected by supervisor during verification",
          "  - CANCELLED: Visit cancelled by admin or operations team",
          "  - RECALLED: MMP recalled for modifications using the Multi-Tier Recall System"
        ]
      },
      {
        title: "8.13 MMP Tabs Reference (Admin/Operations View)",
        content: [
          "The MMP Management page provides different tabs for different stages of the workflow:",
          "",
          "NEW TAB: Recently uploaded MMPs awaiting review - Actions: Review, Approve, Reject, Edit",
          "FORWARDED TAB: MMPs forwarded to FOM - Sub-tabs: Pending (awaiting FOM action), Verified (sites verified)",
          "VERIFIED SITES TAB: All site entries across MMPs grouped by status:",
          "  - New Sites: Freshly verified, ready for cost assignment",
          "  - Approved & Costed: Fees assigned, ready for dispatch",
          "  - Dispatched: Sites sent out to field teams",
          "  - Smart Assigned: Sites auto-assigned by the system",
          "  - Accepted: Sites accepted by collectors",
          "  - Ongoing: Sites with active visits in progress",
          "  - Completed: All visits finished",
          "  - Rejected: Sites rejected during verification",
          "TRACKER TAB: Coverage analytics and progress tracking",
          "  - Shows completion percentages per hub, state, locality",
          "  - PDM Sites calculation: Math.floor(PDM count / 7) for accurate site counting (7 complete questionnaires = 1 site visit)",
          "  - Export options for Excel and PDF reports"
        ]
      },
      {
        title: "8.14 MMP Features & Tools",
        content: [
          "MMP Recall System: Multi-tier recall allows Admin/FOM to recall an MMP at any stage for modifications",
          "Visit Postponement: Reschedule planned visit dates with reason documentation",
          "Date Range Visits: Configure visit windows instead of fixed dates",
          "Auto-Release System: Automatically release unclaimed sites after configurable timeout",
          "Coverage Gap Notifications: Alerts when sites in specific areas lack collector coverage",
          "Smart Dispatch: Uber/Lyft-style system for matching collectors to sites based on proximity and availability",
          "Historical Trends: View MMP completion trends over time with charts and analytics",
          "Questionnaire Analytics: Dynamic visualizations of survey data collected during visits",
          "Coverage Tracker: Track monitoring coverage with export to Excel (includes PDM Sites adjusted totals)"
        ]
      }
    ]
  },
  {
    title: "9. Site Visits - Detailed Guide",
    content: [
      "Site visits are the core operational unit of the PACT system. Each visit represents a data collector traveling to a field site to conduct monitoring, collect data, and document findings."
    ],
    subsections: [
      {
        title: "9.1 Site Visit Lifecycle Overview",
        content: [
          "A site visit follows a structured lifecycle from dispatch to payment:",
          "1. Site is dispatched by admin/FOM (made available for claiming)",
          "2. Collector claims or is assigned the site",
          "3. Collector travels to the site location",
          "4. Collector starts the visit (GPS captured, status: In Progress)",
          "5. Collector collects data, takes photos, fills survey forms",
          "6. Collector completes the visit (status: Completed)",
          "7. Data syncs to server (if offline, waits in Outbox)",
          "8. Payment calculated and credited to wallet",
          "9. Supervisor can verify the submission quality"
        ]
      },
      {
        title: "9.2 Site Visit Status Definitions",
        content: [
          "DISPATCHED: Site has been sent out and is available for collectors to claim. Appears in the 'Claimable' tab",
          "CLAIMED: A collector has reserved the site. No other collector can claim it. Pending acceptance",
          "ACCEPTED: The claim has been confirmed. The site is ready for the collector to visit. Appears in 'Inbox' tab",
          "ASSIGNED: Site was directly assigned to a collector by admin/FOM (not through claiming). Appears in 'Inbox' tab",
          "VERIFIED: Site entry has been verified by admin for accuracy and fees. Ready for dispatch",
          "APPROVED: MMP or cost has been approved by the appropriate authority",
          "IN PROGRESS: The collector has started the visit. GPS tracking is active. Data collection is underway. Appears in 'Drafts' tab",
          "ONGOING: Alternative label for visits that are in progress (same as 'In Progress'). Appears in 'Drafts' tab",
          "COMPLETED: Data collection is finished and submitted. Payment is calculated. Appears in 'Sent' tab",
          "REJECTED: Visit was rejected during verification (poor data quality, wrong location, etc.)",
          "CANCELLED: Visit was cancelled by admin or operations team"
        ]
      },
      {
        title: "9.3 Mobile Tabs for Data Collectors",
        content: [
          "When a Data Collector opens the MMP/Sites page, they see these navigation levels:",
          "",
          "TOP LEVEL TABS:",
          "  Claimable: Available sites you can claim (grouped by State-Locality)",
          "  Assigned: Sites assigned to you by the system or admin (mandatory visits)",
          "  My Sites: Your claimed and accepted sites (with sub-tabs below)",
          "",
          "MY SITES SUB-TABS:",
          "  Inbox (Green): Sites ready to start - status is Accepted, Claimed, Assigned, Dispatched, Verified, or Approved",
          "  Drafts (Blue): Visits in progress - status is 'In Progress' or 'Ongoing'. These are started but not yet completed",
          "  Outbox (Yellow): Completed visits waiting to sync - stored offline, will auto-sync when connected",
          "  Sent (Green): Fully completed and synced visits - payment has been processed",
          "",
          "Each tab shows a badge count indicating the number of sites in that category",
          "The badge counts update in real-time as sites move between statuses"
        ]
      },
      {
        title: "9.4 Starting a Site Visit",
        content: [
          "From the Inbox tab, find the site you want to visit",
          "Review the site details: Name, Code, Location, Activity Type, Fees",
          "Ensure you are at or near the site location (GPS will be captured)",
          "Tap the 'Start Visit' button (black button with Play icon)",
          "The site status changes to 'In Progress'",
          "The site card moves from Inbox to the Drafts tab",
          "GPS location is captured automatically when you start",
          "A timer begins tracking the visit duration",
          "You can now begin data collection activities"
        ]
      },
      {
        title: "9.5 Completing a Site Visit",
        content: [
          "After collecting all required data at the site:",
          "Navigate to the Drafts tab to find your in-progress visit",
          "Tap the 'Complete Site Visit' button (green button)",
          "The system checks that all required fields are completed",
          "Final GPS location is captured for completion verification",
          "Visit status changes to 'Completed'",
          "If online: Data syncs immediately to the server, payment is calculated and credited to your wallet",
          "If offline: Visit moves to the Outbox tab, data stored locally until internet is available",
          "Once synced, the visit moves to the Sent tab",
          "A notification confirms the visit completion and payment amount"
        ]
      },
      {
        title: "9.6 Offline Mode & Data Sync",
        content: [
          "The PACT system fully supports offline data collection for remote field areas:",
          "You can start, conduct, and complete site visits without internet connection",
          "All data (GPS, photos, form responses) is saved locally on your device",
          "Completed offline visits appear in the Outbox tab",
          "When internet connection is restored, data automatically syncs to the server",
          "The sync process handles: GPS coordinates, captured photos, survey responses, visit timestamps",
          "If sync fails, data remains safely stored locally and retries automatically",
          "The Outbox badge count shows how many visits are waiting to sync",
          "Never delete the app or clear app data while visits are in the Outbox"
        ]
      },
      {
        title: "9.7 Payment After Completion",
        content: [
          "When a visit is completed and synced to the server:",
          "The system calculates payment based on your classification level fees:",
          "  - Enumerator Fee: Base payment for the site visit",
          "  - Transport Fee: Travel cost reimbursement",
          "  - Total = Enumerator Fee + Transport Fee",
          "If you received a transportation advance, it is deducted from the total",
          "The net amount is credited to your digital wallet",
          "A wallet transaction is created with: Site name, MMP reference, Fee breakdown, Transaction date",
          "Your wallet balance updates immediately",
          "View all transactions in the Wallet page under 'Transaction History'",
          "Monthly statements show a summary of all earnings, advances, and net payments"
        ]
      }
    ]
  },
  {
    title: "10. First-Claim Dispatch System",
    content: [
      "The First-Claim Dispatch System works like Uber/Lyft - sites are made available and field collectors can claim them on a first-come, first-served basis."
    ],
    subsections: [
      {
        title: "10.1 Dispatch Modes",
        content: [
          "Open Dispatch: Sites available to ALL qualified data collectors across all locations - Any active collector can claim",
          "State Dispatch: Sites only visible to collectors assigned to the same state - Limits claiming to that geographic area",
          "Locality Dispatch: Sites only visible to collectors in the same state AND locality - Most targeted geographic restriction",
          "Individual Dispatch: Direct assignment to a specific named data collector - Only that person can see and accept the site"
        ]
      },
      {
        title: "10.2 How Claiming Works",
        content: [
          "Open the Sites page or MMP page on mobile/web",
          "Navigate to the 'Claimable' tab to see dispatched sites in your area",
          "Sites are grouped by State-Locality for easy browsing",
          "Each site card shows: Site Name, Code, Activity, Date, CP Name, and Fee information",
          "Tap 'Claim Site' on the site you want to visit",
          "The system instantly reserves the site for you using atomic database transactions",
          "Your classification level determines the Enumerator Fee and Transport Fee",
          "Fees are calculated and locked in at claim time",
          "The site moves from 'Claimable' to 'My Sites > Inbox'",
          "Other collectors can no longer see or claim this site"
        ]
      },
      {
        title: "10.3 Claim Protection & Fairness",
        content: [
          "Uses atomic database transactions (PostgreSQL RPC) for concurrency safety",
          "Only ONE collector can successfully claim each site - prevents double-claiming",
          "Claims are processed in the order received - first-come, first-served",
          "If two collectors try to claim simultaneously, only the first succeeds",
          "Failed claims show immediate feedback: 'Site already claimed by another collector'",
          "Auto-Release System: Unclaimed sites can be automatically released after a configurable timeout period"
        ]
      },
      {
        title: "10.4 Fee Calculation at Claim Time",
        content: [
          "When you claim a site, the system automatically calculates your payment:",
          "1. Your classification level (A/Senior, B/Standard, C/Junior) is retrieved from your profile",
          "2. The fee structure for your classification is applied to the site",
          "3. Enumerator Fee: Base payment amount for your classification level",
          "4. Transport Fee: Travel reimbursement based on site location and classification",
          "5. Total Cost = Enumerator Fee + Transport Fee",
          "6. Fees are locked in at claim time and cannot change after",
          "7. Upon successful completion of the site visit, the total amount is credited to your wallet"
        ]
      }
    ]
  },
  {
    title: "11. Classification & Fee Structure",
    content: [
      "Enumerators are classified into tiers that determine their payment rates."
    ],
    subsections: [
      {
        title: "11.1 User Classifications",
        content: [
          "Level A (Senior): 2+ years experience, highest fee rate, complex sites",
          "Level B (Standard): 1-2 years experience, medium fee rate, regular sites",
          "Level C (Junior): Less than 1 year experience, entry fee rate, training sites"
        ]
      },
      {
        title: "11.2 Fee Structure",
        content: [
          "Enumerator Fee: Base payment for completing a site visit",
          "Transport Fee: Reimbursement for travel costs",
          "Total Cost: Enumerator Fee + Transport Fee"
        ]
      },
      {
        title: "11.3 Managing Classification Fees",
        content: [
          "Go to Administration > Classification Fees",
          "View current fee structure for each classification",
          "Click 'Edit' to modify rates",
          "Enter new fee amounts",
          "Click 'Save Changes'"
        ]
      },
      {
        title: "11.4 Fee Application",
        content: [
          "Applied when collector claims and accepts a site",
          "Applied when site is directly assigned to collector",
          "Operations team can manually set fees",
          "Paid to wallet when visit is Completed",
          "Creates wallet transaction with full audit trail"
        ]
      }
    ]
  },
  {
    title: "12. Field Team Management",
    content: [
      "Comprehensive tools for managing field team operations and tracking."
    ],
    subsections: [
      {
        title: "12.1 Team Overview",
        content: [
          "View all team members",
          "See current status (online/offline)",
          "Track real-time locations",
          "Monitor workload distribution",
          "View classification levels"
        ]
      },
      {
        title: "12.2 Team Member Status",
        content: [
          "Online (Green dot): Currently active",
          "Active (Orange dot): Has recent activity",
          "Offline (Gray dot): Not recently active"
        ]
      },
      {
        title: "12.3 Location Tracking",
        content: [
          "Team Map: View all team members on a map",
          "Location History: Track movement patterns",
          "Proximity Alerts: Get notified when collectors near sites",
          "Location Sharing: Team members share location during visits"
        ]
      },
      {
        title: "12.4 Nearest Enumerators",
        content: [
          "Open a site visit or MMP site entry",
          "Click 'Find Nearest Enumerators'",
          "View list sorted by distance (using GPS coordinates)",
          "Uses Haversine formula for accurate distance calculation",
          "Click to assign directly"
        ]
      },
      {
        title: "12.5 Smart Assignment",
        content: [
          "System suggests optimal assignments based on:",
          "Geographic proximity",
          "Current workload",
          "Past performance",
          "Skill requirements",
          "Availability",
          "Classification match"
        ]
      }
    ]
  },
  {
    title: "13. Financial Operations",
    content: [
      "The financial module handles all payment workflows in the system."
    ],
    subsections: [
      {
        title: "13.1 Financial Dashboard",
        content: [
          "Overview: Total budgets, expenses, pending approvals",
          "Cash Flow: Income vs expenses tracking",
          "Pending Approvals: Items awaiting review",
          "Recent Transactions: Latest financial activity"
        ]
      },
      {
        title: "13.2 Transaction Types",
        content: [
          "Down Payment: Advance payment for field expenses",
          "Site Visit Fee: Payment for completed site visits",
          "Transport Cost: Travel expense reimbursement",
          "Adjustment: Manual balance corrections",
          "Withdrawal: Cash out from wallet"
        ]
      },
      {
        title: "13.3 Two-Tier Approval Workflow",
        content: [
          "Supervisor Approval: First level review",
          "Finance Approval: Final authorization",
          "Both levels must approve before payment is processed"
        ]
      },
      {
        title: "13.4 Finance Processing Page",
        content: [
          "Dashboard: Ready to Pay, Processing, Paid Out, Rejected",
          "Wallet Balance Display: Shows user's current available balance",
          "Color-coded: Green (sufficient) or Red (insufficient)",
          "Shortfall Amount: How much more is needed if insufficient",
          "Receipt attachment support",
          "Batch processing capabilities"
        ]
      }
    ]
  },
  {
    title: "14. Budget Management",
    content: [
      "Tools for creating and tracking project budgets."
    ],
    subsections: [
      {
        title: "14.1 Creating Budgets",
        content: [
          "Navigate to Budget",
          "Click 'Create Budget'",
          "Enter: Budget Name, Project, Total Amount, Start/End Date",
          "Set Categories: Personnel, Transportation, Equipment, Communications, Contingency",
          "Click 'Create'"
        ]
      },
      {
        title: "14.2 Budget Tracking",
        content: [
          "Allocated: Total budget amount",
          "Spent: Amount used",
          "Committed: Pending expenses",
          "Available: Remaining balance",
          "Utilization %: Percentage used"
        ]
      },
      {
        title: "14.3 Budget Alerts",
        content: [
          "Configure alerts for: 50%, 75%, 90% utilization",
          "Over budget notifications",
          "Automatic email notifications"
        ]
      }
    ]
  },
  {
    title: "15. Wallet System",
    content: [
      "Each field user has a digital wallet for receiving payments and managing earnings."
    ],
    subsections: [
      {
        title: "15.1 Understanding Wallets",
        content: [
          "Each field user has a digital wallet",
          "Receiving site visit payments",
          "Tracking earnings history",
          "Managing withdrawals",
          "Viewing transaction history"
        ]
      },
      {
        title: "15.2 Wallet Dashboard",
        content: [
          "Current Balance: Available funds (SDG)",
          "Total Earned: Lifetime earnings",
          "Pending: Awaiting approval",
          "This Month: Current month earnings"
        ]
      },
      {
        title: "15.3 Earning Payments",
        content: [
          "Payments credited when you complete a site visit",
          "System calculates fees based on your classification",
          "Transaction created in your wallet",
          "Balance updated immediately"
        ]
      },
      {
        title: "15.4 Payment Breakdown",
        content: [
          "Enumerator fee amount",
          "Transport fee amount",
          "Total payment",
          "Site visit reference",
          "Date/time of completion"
        ]
      },
      {
        title: "15.5 Transaction History",
        content: [
          "Filter by type (earning, withdrawal, adjustment)",
          "Filter by date range",
          "Export to Excel",
          "View transaction details"
        ]
      }
    ]
  },
  {
    title: "16. Cost Submission & Approvals",
    content: [
      "This section covers three main financial workflows: Cost Submission, Down Payment, and Final Payment."
    ],
    subsections: [
      {
        title: "16.1 Cost Submission Workflow (Post-Visit Reimbursement)",
        content: [
          "For requesting reimbursement of ACTUAL expenses incurred AFTER completing a site visit",
          "Use cases: Unexpected transportation, Accommodation, Meals, Other incidental costs",
          "Navigate to Finance > Submit Cost",
          "Select completed site visit",
          "Enter costs in cents (e.g., 5000 = 50.00 SDG)",
          "Upload supporting documents (receipts)",
          "Submit for approval"
        ]
      },
      {
        title: "16.2 Down Payment (Advance) System",
        content: [
          "For requesting advance funds BEFORE traveling to a site visit",
          "Two-Tier Approval: Supervisor reviews first, then Admin/Finance",
          "Payment Types: Full Advance (single payment) or Installments (multiple stages)",
          "Statuses: pending_supervisor, pending_admin, approved, rejected, partially_paid, fully_paid"
        ]
      },
      {
        title: "16.3 Final Payment (Automatic Wallet Credit)",
        content: [
          "When site visit is completed, payment is automatically credited",
          "System calculates: enumerator_fee + transport_fee based on classification",
          "Creates wallet transaction with type 'earning'",
          "Updates wallet balance immediately",
          "Push notification sent to collector"
        ]
      },
      {
        title: "16.4 Hub Supervisor Model",
        content: [
          "Hub-based supervision where each hub manages MULTIPLE states",
          "Supervisors can approve withdrawals for team members in their hub",
          "Geographic management for efficient oversight"
        ]
      },
      {
        title: "16.5 Operational Cost Submission System",
        content: [
          "A separate system for submitting operational field costs that are NOT related to site visit transportation.",
          "This covers expenses like permits, training, communications, equipment, printing, meetings, incentives, and other operational needs.",
          "Navigate to Finance > Operational Costs to access this feature."
        ]
      },
      {
        title: "16.6 Operational Cost Categories",
        content: [
          "Permits: Locality access permits, government licenses, access permissions",
          "Incentives: Team bonuses, field allowances, performance rewards",
          "Communications: Phone credit, SIM cards, internet data packages, airtime",
          "Training: Workshops, training materials, venue hire, facilitator fees",
          "General Transportation: Office travel, hub visits (NOT site visit transport)",
          "Equipment & Supplies: Field equipment, stationery, tools",
          "Printing & Materials: Forms, reports, training materials, manuals",
          "Meetings & Events: Venue rental, refreshments, event logistics",
          "Other: Any operational cost not covered by the above categories"
        ]
      },
      {
        title: "16.7 Who Can Submit Operational Costs",
        content: [
          "FOM (Field Operations Manager): Hub-level operational expenses",
          "Coordinator: State-level coordination costs",
          "Country Director: National-level operational costs",
          "Admin / Super Admin: Any operational cost",
          "Supervisor: Team supervision related expenses",
          "Note: Data Collectors / Enumerators cannot submit operational costs - their expenses go through site visit cost submission"
        ]
      },
      {
        title: "16.8 Operational Cost Approval Workflow",
        content: [
          "Step 1 - Submit: Choose Advance (get funds first) or Reimbursement (already paid), select category, enter amount, attach receipts/documents",
          "Step 2 - Tier 1 Review: Hub Supervisor or FOM reviews submission, verifies details and supporting documents, can approve, reject, or request changes",
          "Step 3 - Tier 2 Approval: Admin or Super Admin performs final review and authorization, both tiers must approve before payment proceeds",
          "Step 4 - Reconciliation (Advances only): After spending, submit actual receipts to reconcile, return unused funds or request more if overspent",
          "Statuses: pending (submitted), tier1_approved, tier1_rejected, tier2_approved, tier2_rejected, reconciled, closed"
        ]
      },
      {
        title: "16.9 Submitting an Operational Cost Request",
        content: [
          "Navigate to Finance > Operational Costs",
          "Click 'New Submission'",
          "Choose request type: Advance Payment or Reimbursement",
          "Select expense category from the dropdown",
          "Enter amount in SDG (Sudanese Pounds)",
          "Add description explaining the expense",
          "Optionally enter vendor name and reference number",
          "Attach supporting documents (receipts, invoices, quotes)",
          "Click 'Submit' to send for approval"
        ]
      },
      {
        title: "16.10 Reviewing Operational Cost Submissions",
        content: [
          "Tier 1 Reviewers (Supervisor/FOM): See pending submissions in their hub, verify expense details and supporting documents, approve to move to Tier 2 or reject with reason",
          "Tier 2 Reviewers (Admin/Super Admin): See all Tier 1 approved submissions, perform final authorization, approve for payment or reject",
          "Both tiers can add review notes",
          "Rejection requires a written reason that is shared with the submitter"
        ]
      },
      {
        title: "16.11 Quantity-Based Cost Items",
        content: [
          "Each cost request supports multiple line items with quantity-based pricing",
          "For each expense item, enter: Category, Title/Description, Quantity, Unit Cost",
          "The system automatically calculates: Total = Quantity x Unit Cost",
          "All items are grouped by category with subtotals in an invoice-style layout",
          "Each request gets a generated request number combining date, project abbreviation, and item count",
          "The 'Other' category requires a specification text explaining the expense type",
          "Project, Date, and Title are mandatory fields for every cost request"
        ]
      },
      {
        title: "16.12 Excel/CSV Bulk Upload for Cost Items",
        content: [
          "Upload expense items in bulk from Excel or CSV files instead of entering them one by one",
          "Click 'Upload Excel / CSV' below the expense items section",
          "The system auto-detects column headers (Category, Title, Quantity, Unit Cost, Currency, Description, Justification, Vendor, Reference Number)",
          "Recognizes column name variations: Qty for Quantity, Price for Unit Cost, Supplier for Vendor",
          "Validates each row against the 9 valid expense categories",
          "Shows clear error messages for invalid rows (e.g., 'Row 3 - Category: not a valid category')",
          "Valid items are auto-populated into the cost request form",
          "Click 'Download Template' to get a ready-made Excel file with correct headers, sample rows, and a categories reference sheet"
        ]
      },
      {
        title: "16.13 Digital Signatures for Approvals",
        content: [
          "Tier 2 final approvals require a digital signature",
          "Two signature methods: Handwriting signature pad or UUID-based verification",
          "Signatures are cryptographically hashed using SHA-256",
          "PDF approval certificates are generated with the signature embedded",
          "Full audit trail of all signature events"
        ]
      },
      {
        title: "16.14 Advance Receipt Confirmation",
        content: [
          "After finance processes a transportation advance payment, the staff member who requested it must confirm receipt",
          "A 'Confirm Receipt' button appears for the requester once payment is processed",
          "Confirmation uses digital signature (handwriting or UUID method)",
          "Receipt confirmation is saved with signature hash, method, and timestamp",
          "Only the original requester can confirm receipt (authorization check enforced)",
          "The workflow timeline updates to show Paid then Confirmed steps",
          "Available in both English and Arabic"
        ]
      }
    ]
  },
  {
    title: "17. Tracker Preparation Plan",
    content: [
      "Analytics and planning tools for site coverage and invoicing."
    ],
    subsections: [
      {
        title: "17.1 Overview",
        content: [
          "Analyzes planned vs actual site coverage",
          "Provides real-time updates",
          "Facilitates invoice preparation",
          "Detailed cost breakdowns"
        ]
      },
      {
        title: "17.2 Analysis Views",
        content: [
          "Summary: Total sites, completion %, costs",
          "Site-by-Site: Individual site details",
          "By Classification: Fees by enumerator level",
          "By State/Locality: Geographic breakdown"
        ]
      },
      {
        title: "17.3 Tracker Actions",
        content: [
          "Access Tracker Preparation Plan",
          "Select date range / period",
          "View analysis",
          "Review costs",
          "Export Data (Excel/PDF)",
          "Generate Invoice"
        ]
      }
    ]
  },
  {
    title: "18. Reports & Analytics",
    content: [
      "Comprehensive reporting and data analysis tools."
    ],
    subsections: [
      {
        title: "18.1 Available Reports",
        content: [
          "Site Visit Summary: Completion rates by period",
          "Financial Summary: Expenses and payments",
          "Team Performance: Collector metrics",
          "Budget Utilization: Spending analysis",
          "MMP Progress: Planning vs execution"
        ]
      },
      {
        title: "18.2 Custom Reports",
        content: [
          "Select report type",
          "Set parameters and date range",
          "Choose filters",
          "Generate report"
        ]
      },
      {
        title: "18.3 Export Formats",
        content: [
          "PDF: For printing and distribution",
          "Excel: For data analysis",
          "CSV: For system integration"
        ]
      }
    ]
  },
  {
    title: "19. Communication Features",
    content: [
      "Built-in communication tools for team coordination."
    ],
    subsections: [
      {
        title: "19.1 Messaging",
        content: [
          "Direct messaging between team members",
          "Group chat for project teams",
          "Message history and search",
          "File sharing capabilities"
        ]
      },
      {
        title: "19.2 Announcements",
        content: [
          "System-wide announcements from admins",
          "Project-specific notices",
          "Urgent alerts for field operations"
        ]
      }
    ]
  },
  {
    title: "20. Maps & Location Services",
    content: [
      "Interactive mapping and geolocation features powered by Leaflet."
    ],
    subsections: [
      {
        title: "20.1 Map Features",
        content: [
          "Interactive site location display",
          "Real-time team member tracking",
          "Geofencing for site proximity detection",
          "Route visualization between sites",
          "Clustering for dense site areas"
        ]
      },
      {
        title: "20.2 Location Accuracy Display",
        content: [
          "Color-coded GPS accuracy indicators across all views",
          "Green: High accuracy (under 10m)",
          "Yellow: Medium accuracy (10-50m)",
          "Red: Low accuracy (over 50m)",
          "Haversine formula for distance calculations"
        ]
      }
    ]
  },
  {
    title: "21. Sites Registry",
    content: [
      "Unified site management system preventing duplicates and enabling GPS enrichment."
    ],
    subsections: [
      {
        title: "21.1 Understanding the Registry",
        content: [
          "Master registry of all monitoring sites",
          "Prevents duplicate site entries",
          "Enables GPS enrichment over time",
          "Sites registered and matched during MMP upload"
        ]
      },
      {
        title: "21.2 Site Management",
        content: [
          "Site code (unique identifier)",
          "Site name and description",
          "State and locality",
          "GPS coordinates",
          "Site classification",
          "Historical visit records"
        ]
      }
    ]
  },
  {
    title: "22. Archive Management",
    content: [
      "Historical storage for completed items and audit records."
    ],
    subsections: [
      {
        title: "22.1 Archiving Process",
        content: [
          "Completed MMPs automatically archived",
          "Financial records preserved for audit",
          "User activity logs maintained",
          "Configurable retention periods"
        ]
      },
      {
        title: "22.2 Archive Access",
        content: [
          "Search archived records by date range",
          "Filter by project, user, or type",
          "Export archived data for compliance",
          "Read-only access to historical data"
        ]
      }
    ]
  },
  {
    title: "23. Calendar & Scheduling",
    content: [
      "Calendar views for planning site visits and tracking deadlines."
    ],
    subsections: [
      {
        title: "23.1 Calendar Views",
        content: [
          "Monthly overview of scheduled visits",
          "Weekly planning view",
          "Daily agenda for collectors",
          "Color-coded by status and priority"
        ]
      },
      {
        title: "23.2 Scheduling",
        content: [
          "Drag-and-drop rescheduling",
          "Conflict detection for overlapping visits",
          "Reminder notifications",
          "Integration with MMP planned dates"
        ]
      }
    ]
  },
  {
    title: "24. Settings & Preferences",
    content: [
      "User and system configuration options."
    ],
    subsections: [
      {
        title: "24.1 User Settings",
        content: [
          "Profile information update",
          "Password and security settings",
          "Notification preferences",
          "Theme selection (light/dark)"
        ]
      },
      {
        title: "24.2 System Settings (Admin)",
        content: [
          "Organization configuration",
          "Default fee structures",
          "Email notification templates",
          "System maintenance options"
        ]
      }
    ]
  },
  {
    title: "25. Notification System",
    content: [
      "Comprehensive push notification system for real-time alerts."
    ],
    subsections: [
      {
        title: "25.1 Notification Types",
        content: [
          "Assignment notifications: New site assigned to you",
          "Approval requests: Items pending your review",
          "Status updates: Visit completed, payment processed",
          "Reminders: Upcoming deadlines and overdue items",
          "System alerts: Important announcements"
        ]
      },
      {
        title: "25.2 Notification Settings",
        content: [
          "Enable/disable specific notification types",
          "Push notification permissions",
          "Email notification preferences",
          "Quiet hours configuration"
        ]
      },
      {
        title: "25.3 Browser Push Notifications",
        content: [
          "Grant browser permission for push",
          "Notifications appear even when tab closed",
          "Click notification to open relevant page",
          "Badge counter for unread notifications"
        ]
      }
    ]
  },
  {
    title: "26. Mobile Application",
    content: [
      "The PACT mobile app provides full field operations capability with offline support."
    ],
    subsections: [
      {
        title: "26.1 Key Features",
        content: [
          "Offline-first data collection with IndexedDB",
          "GPS tracking with geofencing support",
          "Push notifications for assignments",
          "Camera integration for photos",
          "Background sync when online",
          "Error handling with diagnostics"
        ]
      },
      {
        title: "26.2 Installation",
        content: [
          "Download APK from authorized source",
          "Enable 'Install from Unknown Sources'",
          "Open APK file to install",
          "Grant required permissions",
          "Log in with your credentials"
        ]
      },
      {
        title: "26.3 Permissions Required",
        content: [
          "Location: GPS tracking for site visits",
          "Camera: Photo capture at sites",
          "Storage: Offline data and images",
          "Notifications: Push alerts for assignments"
        ]
      },
      {
        title: "26.4 Offline Mode",
        content: [
          "All data saved locally first using IndexedDB",
          "Works without internet connection",
          "Queued for sync when online",
          "Progress preserved if app closes",
          "Automatic conflict resolution on sync"
        ]
      },
      {
        title: "26.5 Capacitor Plugins",
        content: [
          "App: Lifecycle management",
          "Camera: Photo capture",
          "Device: Device info",
          "Filesystem: Local storage",
          "Geolocation: GPS coordinates",
          "Local Notifications: Offline alerts",
          "Network: Connection status",
          "Push Notifications: Remote alerts",
          "Status Bar: Native control"
        ]
      }
    ]
  },
  {
    title: "27. Troubleshooting",
    content: [
      "Common issues and their solutions for quick resolution."
    ],
    subsections: [
      {
        title: "27.1 Login Issues",
        content: [
          "Check credentials are correct",
          "Clear browser cache and cookies",
          "Try incognito/private mode",
          "Check internet connection",
          "Contact admin if account is locked"
        ]
      },
      {
        title: "27.2 GPS Problems",
        content: [
          "Enable high accuracy mode in device settings",
          "Grant location permissions to the app",
          "Ensure clear sky view for better GPS signal",
          "Restart the app if location not updating",
          "Check GPS hardware if issues persist"
        ]
      },
      {
        title: "27.3 Sync Issues",
        content: [
          "Check internet connection is stable",
          "Pull down to manually refresh data",
          "Force close and reopen the app",
          "Check for app updates in store",
          "Clear app cache if issues persist"
        ]
      },
      {
        title: "27.4 Common Error Messages",
        content: [
          "Session Expired: Log in again",
          "Permission Denied: Contact admin for access",
          "Network Error: Check internet connection",
          "Validation Failed: Fix highlighted fields",
          "Site Already Claimed: Try a different site",
          "Duplicate Site: Check existing MMPs"
        ]
      }
    ]
  },
  {
    title: "28. Glossary",
    content: [
      "Key terms and definitions used in the PACT system."
    ],
    subsections: [
      {
        title: "28.1 Terms & Definitions",
        content: [
          "MMP: Monthly Monitoring Plan - Scheduled site monitoring document",
          "Site Visit: A scheduled or ad-hoc visit to a monitoring location",
          "FOM: Field Operation Manager - Manages field operations",
          "Down Payment: Advance payment for field expenses",
          "Dispatch: Making sites available for claiming/assignment",
          "Claim: Reserving a dispatched site for yourself",
          "Wallet: Digital account for managing field payments",
          "Classification: Categorization of enumerators (A, B, C levels)",
          "Audit Trail: Record of all system actions",
          "RLS: Row Level Security - Database access control",
          "Haversine: Formula for calculating distances on Earth",
          "Geofencing: Location-based boundary detection",
          "IndexedDB: Browser-based offline storage",
          "Retainer: Regular monthly payment for classified personnel",
          "PageInfoBanner: Information banner showing page purpose and workflow steps",
          "Reconciliation: Process of matching advance payments against actual receipts"
        ]
      }
    ]
  },
  {
    title: "29. Retainer Management",
    content: [
      "Comprehensive retainer payment tracking and processing for classified personnel."
    ],
    subsections: [
      {
        title: "29.1 Overview",
        content: [
          "Retainer Management is available at Payments & Finance > Retainer Management",
          "Tracks and processes monthly retainer payments for personnel classified as retainer-eligible",
          "Accessible to Super Admin, Admin, and Finance Admin roles",
          "Uses wallet transactions with metadata type 'retainer' for tracking"
        ]
      },
      {
        title: "29.2 Available Tabs",
        content: [
          "Overview: KPI cards, monthly summary, and level breakdown charts",
          "Payment History: Searchable and sortable transaction list with export capability",
          "Tracking Grid: User by 12-month payment matrix showing payment status at a glance",
          "Eligible Users: All retainer-classified members with their current status",
          "Audit Trail: Full processing log of all retainer actions",
          "Review & Process: Preview before batch payment processing to prevent errors"
        ]
      },
      {
        title: "29.3 Processing Retainer Payments",
        content: [
          "Navigate to the Review & Process tab",
          "Preview which users are eligible for the current period",
          "Review amounts and verify no duplicates exist",
          "The system includes duplicate payment prevention",
          "Process batch payments for all eligible users",
          "CSV export available for all views for record keeping"
        ]
      }
    ]
  },
  {
    title: "30. Wallet-Advance Integration",
    content: [
      "Transportation advances are automatically reconciled with site visit fees when crediting wallets."
    ],
    subsections: [
      {
        title: "30.1 How It Works",
        content: [
          "When a collector receives an advance (down payment) before a site visit, the system tracks it",
          "Upon completing the site visit, the advance amount is automatically deducted from the earned fee",
          "Uses an 'advance_reconciled_at' flag in down_payment_requests metadata to prevent double-deduction",
          "The net amount (fee minus advance) is credited to the wallet"
        ]
      },
      {
        title: "30.2 Monthly Statements",
        content: [
          "The Wallet page includes bank-like monthly statements",
          "Each statement shows opening balance, all transactions, and closing balance for the month",
          "CSV export available for each monthly statement period",
          "Transactions are categorized by type (earnings, advances, deductions, adjustments)"
        ]
      }
    ]
  },
  {
    title: "31. Role Perspective Viewer",
    content: [
      "A Super Admin tool for viewing what any role or user can see in the system."
    ],
    subsections: [
      {
        title: "31.1 Accessing the Tool",
        content: [
          "Navigate to Administration > Role Perspective Viewer in the sidebar",
          "Only available to Super Admin users",
          "Located under the Administration section of the sidebar menu"
        ]
      },
      {
        title: "31.2 Features",
        content: [
          "Visible Screens: See which menu items and pages are visible for any selected role",
          "Permission Matrix: Full resource-by-action grid showing all permissions (read, create, update, delete)",
          "Permission Summary: Quick statistics of total permissions granted",
          "Role Comparison: Compare two roles side by side with difference highlighting",
          "Uses the actual permission system (getWorkflowMenuGroups and DEFAULT_ROLE_PERMISSIONS) for accurate simulation"
        ]
      }
    ]
  },
  {
    title: "32. Sidebar Favorites System",
    content: [
      "Users can customize their sidebar with favorite pages for quick access."
    ],
    subsections: [
      {
        title: "32.1 How to Use Favorites",
        content: [
          "Pin frequently used pages by clicking the star/pin icon next to any sidebar menu item",
          "Pinned items appear at the top of the sidebar in a dedicated Favorites section",
          "Drag and drop to reorder your favorite items",
          "Favorites are saved to the database and persist across sessions and devices",
          "Unpin items by clicking the star/pin icon again"
        ]
      }
    ]
  },
  {
    title: "33. Page Information Banners",
    content: [
      "Every financial page includes an information banner explaining its purpose and workflow."
    ],
    subsections: [
      {
        title: "33.1 What are Page Info Banners?",
        content: [
          "Each of the 12+ financial pages has a collapsible banner at the top",
          "The banner explains what the page does in plain language",
          "Shows a 'Who does what - Step by step' workflow with numbered steps",
          "Each step shows a role-specific color-coded badge and action description",
          "Collapsed by default to save screen space - click to expand",
          "Helps new users understand each page's purpose without external documentation"
        ]
      }
    ]
  },
  {
    title: "34. Timesheet Module & Payroll Scheduling",
    content: [
      "The Timesheet Module provides a complete system for tracking staff working hours, managing leave balances, and scheduling payroll runs with full approval workflows."
    ],
    subsections: [
      {
        title: "34.1 Timesheet Overview",
        content: [
          "Staff can log daily work hours directly from their profile or the HR Hub",
          "Each entry records the date, hours worked, project/task reference, and notes",
          "Supervisors and HR admins can review and approve submitted timesheets",
          "Monthly summaries are automatically aggregated for payroll calculation",
          "Integration with Leave Requests ensures leave days are excluded from billable hours"
        ]
      },
      {
        title: "34.2 Submitting a Timesheet",
        content: [
          "Navigate to HR Hub → Timesheets tab",
          "Click 'Add Entry' and select the work date",
          "Enter hours worked and select the associated project or task",
          "Add optional notes for context",
          "Submit for supervisor review — submitted entries are locked from editing"
        ]
      },
      {
        title: "34.3 Payroll Scheduling",
        content: [
          "Finance admins can schedule payroll runs from HR Hub → Payroll → Schedule Run",
          "Set the payroll period (start date / end date) and payment date",
          "System auto-calculates gross pay based on approved timesheets, salary contracts, and retainer agreements",
          "Deductions (advance repayments, unpaid leave) are applied automatically",
          "A payroll summary report is generated for admin sign-off before processing"
        ]
      },
      {
        title: "34.4 Payroll Approval Workflow",
        content: [
          "Step 1 — Finance Admin prepares payroll run and reviews the summary",
          "Step 2 — Admin or Super Admin approves the payroll run",
          "Step 3 — System credits individual wallets and generates payslips",
          "Step 4 — Staff receive in-app and email notification with payslip link",
          "All payroll actions are logged in the audit trail"
        ]
      },
      {
        title: "34.5 Payroll Reports",
        content: [
          "Payroll Breakdown: line-by-line breakdown per staff member for each run",
          "Contract Expiry Report: flags staff whose contracts expire within 30/60/90 days",
          "Budget vs Actual: compares planned payroll budget against actual payroll spend",
          "Staff Cost Projection: forecasts future payroll costs based on current contracts"
        ]
      }
    ]
  },
  {
    title: "35. Subscription Tracker & Month-End Finance Reports",
    content: [
      "The Subscription Tracker helps the organization monitor all active software and service subscriptions, track renewal dates, and manage costs. The Month-End Finance module provides automated financial close reports."
    ],
    subsections: [
      {
        title: "35.1 Subscription Tracker Overview",
        content: [
          "Accessible from Financial Operations → Subscriptions",
          "Lists all active subscriptions with vendor name, cost, billing cycle, renewal date, and owner",
          "Color-coded renewal alerts: red (overdue), amber (due within 30 days), green (active)",
          "Supports annual, monthly, and one-time payment types",
          "Admin and Finance roles can add, edit, or cancel subscriptions"
        ]
      },
      {
        title: "35.2 Adding a Subscription",
        content: [
          "Click 'Add Subscription' and fill in: vendor name, service description, cost (USD/SDG), billing cycle",
          "Set the renewal date — the system will alert the owner 30 days before renewal",
          "Assign an owner (the staff member responsible for managing the subscription)",
          "Attach any contract or invoice document",
          "Save — the subscription appears in the tracker immediately"
        ]
      },
      {
        title: "35.3 Cost Alerts",
        content: [
          "Automatic alerts fire when a subscription renewal is approaching",
          "Alerts are sent via in-app notification and email to the subscription owner and Finance Admin",
          "Budget overage alerts trigger when total subscription costs exceed the set budget ceiling",
          "All alerts are visible in the Notification Center and Approvals Hub"
        ]
      },
      {
        title: "35.4 Month-End Finance Reports",
        content: [
          "Navigate to Financial Operations → Month-End Reports",
          "Select the reporting period (month/year) and click 'Generate Report'",
          "Report includes: total income, total expenditure, wallet balances, advances outstanding, cost submissions, subscription costs, and net position",
          "Export as PDF or Excel for external audits",
          "Period-close lock prevents retroactive edits after the report is finalized"
        ]
      },
      {
        title: "35.5 Reconciliation",
        content: [
          "The Reconciliation Dashboard cross-checks wallet transactions against approved cost submissions",
          "Highlights discrepancies for Finance Admin to investigate",
          "Once reconciled, the period is marked 'Closed' and becomes read-only",
          "Duplicate payment detection flags identical transactions within the same period"
        ]
      }
    ]
  },
  {
    title: "36. Integrations Settings (Email & Calendar)",
    content: [
      "The Integrations Settings page allows each user to connect their Google Calendar account and configure email notification preferences, all from a single unified interface."
    ],
    subsections: [
      {
        title: "36.1 Accessing Integrations Settings",
        content: [
          "Click your profile avatar in the top-right corner of the sidebar",
          "Select 'Integrations' from the dropdown menu",
          "Alternatively, navigate directly to /integrations"
        ]
      },
      {
        title: "36.2 Google Calendar Integration",
        content: [
          "Click 'Connect Google Calendar' to begin the OAuth authorization flow",
          "You will be redirected to Google to grant calendar access — no passwords are stored",
          "Once connected, your account email is shown and the status badge turns green",
          "PACT events (site visits, project milestones, MMP deadlines) can sync to your calendar",
          "Click 'Disconnect' at any time to revoke access — tokens are deleted from the server immediately"
        ]
      },
      {
        title: "36.3 Email Notification Preferences",
        content: [
          "Use the master toggle to enable or disable all email notifications",
          "Fine-tune which categories trigger emails using individual category toggles:",
          "  • Task Assignments — notified when a task is assigned to you",
          "  • Approval Requests — notified when your approval is required",
          "  • Payroll — notified when payslips are ready or payroll is processed",
          "  • Milestones — notified when a project milestone is due or reached",
          "  • System — notified for account security events and system announcements",
          "Set a custom notification email address if you prefer a different inbox from your login email"
        ]
      },
      {
        title: "36.4 Privacy & Security",
        content: [
          "Google OAuth tokens are stored server-side only — never accessible from the browser",
          "Token revocation at Google is performed before local deletion on disconnect",
          "Admins cannot read your tokens or email preferences via client queries",
          "The OAuth state parameter prevents CSRF attacks during the authorization flow"
        ]
      }
    ]
  },
  {
    title: "37. Portfolio Dashboard Executive Enhancements",
    content: [
      "The Portfolio Dashboard (/portfolio) has been upgraded with executive-level insights, enabling directors and senior management to monitor the entire project portfolio from a single view."
    ],
    subsections: [
      {
        title: "37.1 Executive KPI Cards",
        content: [
          "Six live KPI cards at the top of the dashboard refresh in real time:",
          "  • Active Projects — count of projects currently in progress",
          "  • Stalled Projects — projects with no activity in the last 14 days",
          "  • At-Risk Projects — projects flagged by the health score algorithm",
          "  • Overdue Milestones — milestones past their planned completion date",
          "  • Portfolio Burn Rate — total budget consumed as a percentage of total budget",
          "  • Completed This Year — projects closed within the current calendar year"
        ]
      },
      {
        title: "37.2 Health Matrix Table",
        content: [
          "One row per project showing: project name, health signal (RAG), flow progress, next milestone, and burn %",
          "Sortable by any column — click column headers to sort ascending/descending",
          "Filterable by project type, status, or health signal using the toolbar dropdowns",
          "Health signal is calculated from: schedule adherence, budget consumption, team activity, and milestone completion rate"
        ]
      },
      {
        title: "37.3 Financial Tab",
        content: [
          "Budget vs Actual bar chart for all active projects side by side",
          "Top spenders table — ranked list of projects by absolute spend",
          "Over-budget alerts highlighted in red with drill-down to the project detail page",
          "Visible to Admin, Finance Admin, Super Admin, and Country Director roles only"
        ]
      },
      {
        title: "37.4 Milestones Tab",
        content: [
          "Overdue milestones listed with days-overdue counter and responsible team member",
          "30-day upcoming milestone timeline — visual Gantt-style view of imminent deadlines",
          "Click any milestone to navigate directly to the project detail page"
        ]
      },
      {
        title: "37.5 Pipeline & Project Mix Tabs",
        content: [
          "Pipeline Tab: Kanban board organized by project flow stage with a stalled swimlane at the bottom",
          "Project Mix Tab: Donut chart showing distribution by project type, plus a status breakdown bar chart",
          "Both tabs update live when project stages or statuses change"
        ]
      },
      {
        title: "37.6 Stalled Project Alerts",
        content: [
          "Projects inactive for 14+ days are automatically moved to the 'Stalled' swimlane",
          "An in-app notification is sent to the project manager when a project becomes stalled",
          "The project health score drops when stalled, surfacing it in the At-Risk KPI card",
          "Admins can manually mark a stalled project as active after verifying field activity"
        ]
      }
    ]
  }
];

const workflowSteps: WorkflowStep[] = [
  { step: "A", action: "System Configuration", who: "Admin/ICT", details: "Configure roles, fees, hubs, system settings" },
  { step: "B", action: "User Onboarding", who: "Admin/User", details: "Registration, verification, role & classification assignment" },
  { step: "C", action: "Project Creation", who: "Admin/ICT", details: "Create project, timeline, assign manager, build team" },
  { step: "D", action: "Budget Allocation", who: "Finance", details: "Create budget, link to project, set categories" },
  { step: "E", action: "MMP Upload", who: "Coordinator/ICT", details: "Prepare CSV, upload file, validate data, submit" },
  { step: "F", action: "MMP Review & Approval", who: "Reviewer/Admin", details: "Review, verify, check permits, approve, forward to FOM" },
  { step: "G", action: "Permit Management", who: "Coordinator", details: "Upload permit, enter details, verification, link to sites" },
  { step: "H", action: "Site Dispatch", who: "FOM", details: "Select sites, choose mode (Open/State/Locality/Individual), execute" },
  { step: "I", action: "Site Claiming", who: "Collector", details: "View available sites, select site, claim, atomic lock" },
  { step: "J", action: "Claim Acceptance", who: "FOM/System", details: "Review claim, accept, calculate fees based on classification" },
  { step: "K", action: "Start Site Visit", who: "Collector", details: "Open assignment, travel to site, GPS auto-captured, start visit" },
  { step: "L", action: "Data Collection", who: "Collector", details: "GPS capture, take photos, fill forms, local save (offline)" },
  { step: "M", action: "Complete Visit", who: "Collector", details: "Review data, complete visit, sync to server, calculate payment" },
  { step: "N", action: "Visit Verification", who: "Supervisor", details: "Review submission, verify location & photos, approve/reject" },
  { step: "O", action: "Wallet Credit", who: "System", details: "Automatic payment on completion, create transaction, update balance" },
  { step: "P", action: "Cost Submission", who: "Collector/Finance", details: "Submit expenses, attach receipts, supervisor & finance approval" },
  { step: "Q", action: "Tracker & Invoice", who: "Finance/FOM", details: "Access tracker, view analysis, export data, generate invoice" },
  { step: "R", action: "Reporting", who: "Any User", details: "Generate reports, set parameters, view dashboard, export" },
  { step: "S", action: "Archive & Close", who: "Admin", details: "Review completion, generate final report, archive MMP, close project" }
];

const quickReferenceData = {
  roles: [
    { action: 'Create users', roles: 'Admin, ICT' },
    { action: 'Upload MMP', roles: 'Admin, ICT, FOM' },
    { action: 'Approve costs', roles: 'Financial Admin, Admin' },
    { action: 'Assign visits', roles: 'Admin, FOM, Supervisor' },
    { action: 'Claim sites', roles: 'Data Collector' },
    { action: 'Collect data', roles: 'Data Collector' },
    { action: 'Manage budgets', roles: 'Financial Admin, Admin' },
    { action: 'Configure fees', roles: 'Admin' },
    { action: 'Manage wallets', roles: 'Admin, Super Admin' },
    { action: 'Submit operational costs', roles: 'FOM, Coordinator, Country Director, Admin, Supervisor' },
    { action: 'Approve operational costs (Tier 1)', roles: 'Supervisor, FOM' },
    { action: 'Approve operational costs (Tier 2)', roles: 'Admin, Super Admin' },
    { action: 'Upload Excel cost items', roles: 'FOM, Coordinator, Admin, Supervisor' },
    { action: 'Process retainer payments', roles: 'Super Admin, Admin, Finance Admin' },
    { action: 'View role perspective', roles: 'Super Admin' },
    { action: 'Confirm advance receipt', roles: 'Requester (any role)' }
  ],
  statusColors: [
    { color: 'Green', meaning: 'Complete / Online / Success' },
    { color: 'Blue', meaning: 'In Progress / Active' },
    { color: 'Yellow', meaning: 'Pending / Warning' },
    { color: 'Orange', meaning: 'Attention Required' },
    { color: 'Red', meaning: 'Overdue / Error / Offline' },
    { color: 'Gray', meaning: 'Inactive / Archived' },
    { color: 'Purple', meaning: 'Claimed / Reserved' }
  ],
  shortcuts: [
    { shortcut: 'Ctrl + K', action: 'Global search' },
    { shortcut: 'Ctrl + N', action: 'New item' },
    { shortcut: 'Ctrl + S', action: 'Save' },
    { shortcut: 'Esc', action: 'Close modal' },
    { shortcut: '?', action: 'Show help' }
  ],
  gestures: [
    { gesture: 'Swipe left/right', action: 'Navigate between items' },
    { gesture: 'Pull down', action: 'Refresh data' },
    { gesture: 'Long press', action: 'Access options menu' },
    { gesture: 'Pinch', action: 'Zoom on maps' },
    { gesture: 'Double tap', action: 'Quick zoom' }
  ]
};

export const generateUserManualPDF = () => {
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
  doc.text('PACT Workflow Platform', pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text('Complete User Manual', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;
  doc.text('Version 4.0 | April 2026', pageWidth / 2, yPos, { align: 'center' });
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

  documentationSections.forEach((section) => {
    checkPageBreak(6);
    doc.text(section.title, margin + 5, yPos);
    yPos += 5;
  });

  doc.addPage();
  yPos = 20;

  documentationSections.forEach((section) => {
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

  doc.addPage();
  yPos = 20;

  doc.setFontSize(16);
  doc.setTextColor(59, 130, 246);
  doc.text('Complete Workflow Steps (A to S)', margin, yPos);
  yPos += 10;

  autoTable(doc, {
    startY: yPos,
    head: [['Step', 'Action', 'Who', 'Details']],
    body: workflowSteps.map(step => [step.step, step.action, step.who, step.details]),
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 35 },
      2: { cellWidth: 30 },
      3: { cellWidth: 'auto' }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  checkPageBreak(80);
  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246);
  doc.text('Quick Reference: Role Permissions', margin, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Action', 'Roles']],
    body: quickReferenceData.roles.map(r => [r.action, r.roles]),
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94], fontSize: 9 },
    styles: { fontSize: 8 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  checkPageBreak(60);
  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246);
  doc.text('Quick Reference: Status Colors', margin, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Color', 'Meaning']],
    body: quickReferenceData.statusColors.map(s => [s.color, s.meaning]),
    theme: 'striped',
    headStyles: { fillColor: [168, 85, 247], fontSize: 9 },
    styles: { fontSize: 8 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  checkPageBreak(50);
  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246);
  doc.text('Quick Reference: Keyboard Shortcuts', margin, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Shortcut', 'Action']],
    body: quickReferenceData.shortcuts.map(s => [s.shortcut, s.action]),
    theme: 'striped',
    headStyles: { fillColor: [249, 115, 22], fontSize: 9 },
    styles: { fontSize: 8 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 15;

  checkPageBreak(50);
  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246);
  doc.text('Quick Reference: Mobile Gestures', margin, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Gesture', 'Action']],
    body: quickReferenceData.gestures.map(g => [g.gesture, g.action]),
    theme: 'striped',
    headStyles: { fillColor: [14, 165, 233], fontSize: 9 },
    styles: { fontSize: 8 }
  });

  const filename = `PACT_User_Manual_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(filename);
};

export const generateUserManualDOCX = async () => {
  const children: any[] = [];

  children.push(
    new Paragraph({
      text: "PACT Workflow Platform",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: "Complete User Manual",
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
        new TextRun({ text: "Version 4.0 | April 2026", size: 20 })
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

  documentationSections.forEach((section) => {
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

  documentationSections.forEach((section) => {
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
                new TextRun({ text: `• ${line}` })
              ],
              spacing: { after: 50 },
              indent: { left: convertInchesToTwip(0.25) }
            })
          );
        });
      });
    }
  });

  children.push(
    new Paragraph({
      text: "",
      pageBreakBefore: true
    }),
    new Paragraph({
      text: "Complete Workflow Steps (A to S)",
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 300 }
    })
  );

  const workflowRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Step", alignment: AlignmentType.CENTER })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: "Action", alignment: AlignmentType.CENTER })], width: { size: 25, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: "Who", alignment: AlignmentType.CENTER })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: "Details", alignment: AlignmentType.CENTER })], width: { size: 45, type: WidthType.PERCENTAGE } })
      ]
    }),
    ...workflowSteps.map(step => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: step.step })] }),
        new TableCell({ children: [new Paragraph({ text: step.action })] }),
        new TableCell({ children: [new Paragraph({ text: step.who })] }),
        new TableCell({ children: [new Paragraph({ text: step.details })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: workflowRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  children.push(
    new Paragraph({
      text: "Quick Reference: Role Permissions",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 }
    })
  );

  const roleRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Action" })] }),
        new TableCell({ children: [new Paragraph({ text: "Roles" })] })
      ]
    }),
    ...quickReferenceData.roles.map(r => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: r.action })] }),
        new TableCell({ children: [new Paragraph({ text: r.roles })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: roleRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  children.push(
    new Paragraph({
      text: "Quick Reference: Status Colors",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 }
    })
  );

  const colorRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Color" })] }),
        new TableCell({ children: [new Paragraph({ text: "Meaning" })] })
      ]
    }),
    ...quickReferenceData.statusColors.map(s => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: s.color })] }),
        new TableCell({ children: [new Paragraph({ text: s.meaning })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: colorRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  children.push(
    new Paragraph({
      text: "Quick Reference: Keyboard Shortcuts",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 }
    })
  );

  const shortcutRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Shortcut" })] }),
        new TableCell({ children: [new Paragraph({ text: "Action" })] })
      ]
    }),
    ...quickReferenceData.shortcuts.map(s => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: s.shortcut })] }),
        new TableCell({ children: [new Paragraph({ text: s.action })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: shortcutRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  children.push(
    new Paragraph({
      text: "Quick Reference: Mobile Gestures",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 }
    })
  );

  const gestureRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Gesture" })] }),
        new TableCell({ children: [new Paragraph({ text: "Action" })] })
      ]
    }),
    ...quickReferenceData.gestures.map(g => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: g.gesture })] }),
        new TableCell({ children: [new Paragraph({ text: g.action })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: gestureRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `PACT_User_Manual_${format(new Date(), 'yyyy-MM-dd')}.docx`;
  saveAs(blob, filename);
};

export const getDocumentationSections = () => documentationSections;
export const getWorkflowSteps = () => workflowSteps;
export const getQuickReferenceData = () => quickReferenceData;

export const generateWorkflowsPDF = () => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let yPos = 20;
  const margin = 14;

  doc.setFontSize(24);
  doc.setTextColor(59, 130, 246);
  doc.text('PACT Workflow Platform', pageWidth / 2, yPos, { align: 'center' });
  yPos += 12;

  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text('Complete Workflows Reference', pageWidth / 2, yPos, { align: 'center' });
  yPos += 8;

  doc.setFontSize(10);
  doc.text(`Generated: ${format(new Date(), 'PPpp')}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 6;
  doc.text('Version 4.0 | April 2026', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 15;

  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Complete Workflow Steps (A to S)', margin, yPos);
  yPos += 8;

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text('From project setup to payment processing - the complete field operations lifecycle.', margin, yPos);
  yPos += 10;

  autoTable(doc, {
    startY: yPos,
    head: [['Step', 'Action', 'Who', 'Details']],
    body: workflowSteps.map(step => [step.step, step.action, step.who, step.details]),
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      0: { cellWidth: 15 },
      1: { cellWidth: 35 },
      2: { cellWidth: 30 },
      3: { cellWidth: 'auto' }
    }
  });

  yPos = (doc as any).lastAutoTable.finalY + 20;

  const checkPageBreak = (neededSpace: number) => {
    if (yPos + neededSpace > pageHeight - 20) {
      doc.addPage();
      yPos = 20;
      return true;
    }
    return false;
  };

  checkPageBreak(80);
  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246);
  doc.text('Workflow Phases Overview', margin, yPos);
  yPos += 10;

  const phases = [
    { phase: 'Phase 1: Setup & Planning', steps: 'A, B, C, D', description: 'System configuration, user onboarding, project creation, budget allocation' },
    { phase: 'Phase 2: MMP Lifecycle', steps: 'E, F, G', description: 'MMP upload, review & approval, permit management' },
    { phase: 'Phase 3: Dispatch & Claiming', steps: 'H, I, J', description: 'Site dispatch, claiming, acceptance & fee calculation' },
    { phase: 'Phase 4: Field Operations', steps: 'K, L, M, N', description: 'Start visit, data collection, completion, verification' },
    { phase: 'Phase 5: Financial Processing', steps: 'O, P, Q, R, S', description: 'Wallet credit, cost submission, tracker, reporting, archive' }
  ];

  autoTable(doc, {
    startY: yPos,
    head: [['Phase', 'Steps', 'Description']],
    body: phases.map(p => [p.phase, p.steps, p.description]),
    theme: 'striped',
    headStyles: { fillColor: [34, 197, 94], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 20;

  checkPageBreak(80);
  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246);
  doc.text('Role Responsibilities by Phase', margin, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Action', 'Who Can Perform']],
    body: quickReferenceData.roles.map(r => [r.action, r.roles]),
    theme: 'striped',
    headStyles: { fillColor: [168, 85, 247], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 }
  });

  yPos = (doc as any).lastAutoTable.finalY + 20;

  checkPageBreak(60);
  doc.setFontSize(14);
  doc.setTextColor(59, 130, 246);
  doc.text('Status Color Guide', margin, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Color', 'Meaning']],
    body: quickReferenceData.statusColors.map(s => [s.color, s.meaning]),
    theme: 'striped',
    headStyles: { fillColor: [249, 115, 22], fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 3 }
  });

  const filename = `PACT_Workflows_Reference_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  doc.save(filename);
};

export const generateWorkflowsDOCX = async () => {
  const children: any[] = [];

  children.push(
    new Paragraph({
      text: "PACT Workflow Platform",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: "Complete Workflows Reference",
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
        new TextRun({ text: "Version 4.0 | April 2026", size: 20 })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    })
  );

  children.push(
    new Paragraph({
      text: "Complete Workflow Steps (A to S)",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 200 }
    }),
    new Paragraph({
      text: "From project setup to payment processing - the complete field operations lifecycle.",
      spacing: { after: 200 }
    })
  );

  const workflowRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Step", alignment: AlignmentType.CENTER })], width: { size: 10, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: "Action", alignment: AlignmentType.CENTER })], width: { size: 25, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: "Who", alignment: AlignmentType.CENTER })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ text: "Details", alignment: AlignmentType.CENTER })], width: { size: 45, type: WidthType.PERCENTAGE } })
      ]
    }),
    ...workflowSteps.map(step => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: step.step })] }),
        new TableCell({ children: [new Paragraph({ text: step.action })] }),
        new TableCell({ children: [new Paragraph({ text: step.who })] }),
        new TableCell({ children: [new Paragraph({ text: step.details })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: workflowRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  children.push(
    new Paragraph({
      text: "Workflow Phases Overview",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 }
    })
  );

  const phases = [
    { phase: 'Phase 1: Setup & Planning', steps: 'A, B, C, D', description: 'System configuration, user onboarding, project creation, budget allocation' },
    { phase: 'Phase 2: MMP Lifecycle', steps: 'E, F, G', description: 'MMP upload, review & approval, permit management' },
    { phase: 'Phase 3: Dispatch & Claiming', steps: 'H, I, J', description: 'Site dispatch, claiming, acceptance & fee calculation' },
    { phase: 'Phase 4: Field Operations', steps: 'K, L, M, N', description: 'Start visit, data collection, completion, verification' },
    { phase: 'Phase 5: Financial Processing', steps: 'O, P, Q, R, S', description: 'Wallet credit, cost submission, tracker, reporting, archive' }
  ];

  const phaseRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Phase" })] }),
        new TableCell({ children: [new Paragraph({ text: "Steps" })] }),
        new TableCell({ children: [new Paragraph({ text: "Description" })] })
      ]
    }),
    ...phases.map(p => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: p.phase })] }),
        new TableCell({ children: [new Paragraph({ text: p.steps })] }),
        new TableCell({ children: [new Paragraph({ text: p.description })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: phaseRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  children.push(
    new Paragraph({
      text: "Role Responsibilities",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 }
    })
  );

  const roleRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Action" })] }),
        new TableCell({ children: [new Paragraph({ text: "Who Can Perform" })] })
      ]
    }),
    ...quickReferenceData.roles.map(r => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: r.action })] }),
        new TableCell({ children: [new Paragraph({ text: r.roles })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: roleRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  children.push(
    new Paragraph({
      text: "Status Color Guide",
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 }
    })
  );

  const colorRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: "Color" })] }),
        new TableCell({ children: [new Paragraph({ text: "Meaning" })] })
      ]
    }),
    ...quickReferenceData.statusColors.map(s => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph({ text: s.color })] }),
        new TableCell({ children: [new Paragraph({ text: s.meaning })] })
      ]
    }))
  ];

  children.push(
    new Table({
      rows: colorRows,
      width: { size: 100, type: WidthType.PERCENTAGE }
    })
  );

  const doc = new Document({
    sections: [{
      properties: {},
      children: children
    }]
  });

  const blob = await Packer.toBlob(doc);
  const filename = `PACT_Workflows_Reference_${format(new Date(), 'yyyy-MM-dd')}.docx`;
  saveAs(blob, filename);
};

const arabicDocumentationSections: Section[] = [
  {
    title: "1. المقدمة",
    content: [
      "مركز قيادة PACT هو مركز عمليات ميدانية مركزي مصمم لإدارة شاملة للعمليات الميدانية الإنسانية والتنموية. تعمل المنصة كمركز قيادة موحد يمكّن المنظمات من التخطيط والتنسيق والتنفيذ ومراقبة جميع الأنشطة الميدانية من واجهة واحدة متكاملة."
    ],
    subsections: [
      {
        title: "1.1 حول مركز قيادة PACT",
        content: [
          "خطط المراقبة الشهرية (MMPs) - التخطيط الاستراتيجي واستهداف المواقع للأنشطة الميدانية",
          "إدارة زيارات المواقع - تنسيق شامل مع تتبع GPS وتوثيق بالصور",
          "مركز تنسيق الفريق - مشاركة الموقع في الوقت الحقيقي، مكالمات صوتية/فيديو، ومراسلة فورية",
          "نظام الرقابة المالية - الميزانيات، المحافظ الرقمية، تقديم التكاليف، الموافقات متعددة المستويات",
          "الأمان القائم على الأدوار - 12 دوراً متخصصاً للمستخدمين مع تحكم دقيق في الصلاحيات",
          "تصميم متوافق مع الهاتف - تطبيق Android أصلي مع إمكانية العمل بدون اتصال كامل",
          "إشعارات البريد الإلكتروني - عبر IONOS SMTP مع أزرار إجراء منبثقة"
        ]
      }
    ]
  },
  {
    title: "2. أدوار المستخدمين",
    content: [
      "يدعم النظام 12 دوراً متخصصاً للمستخدمين، لكل منها صلاحيات محددة."
    ],
    subsections: [
      {
        title: "2.1 الأدوار المتاحة",
        content: [
          "المسؤول الأعلى (Super Admin): وصول كامل للنظام وإدارة المستخدمين والإعدادات",
          "المسؤول (Admin): إدارة المشاريع والمستخدمين والموافقات",
          "مدير العمليات الميدانية (FOM): إدارة العمليات الميدانية والإرسال والتنسيق",
          "المنسق (Coordinator): تنسيق الأنشطة على مستوى الولاية",
          "المشرف (Supervisor): الإشراف على فرق الجمع الميداني",
          "جامع البيانات (Data Collector): تنفيذ زيارات المواقع وجمع البيانات",
          "المسؤول المالي (Finance Admin): إدارة الميزانيات والموافقات المالية",
          "فريق البيانات (Data Team): التحليلات والتقارير مع صلاحية القراءة",
          "المدير القطري (Country Director): إشراف شامل للقراءة فقط",
          "تكنولوجيا المعلومات (ICT): تكوين النظام والدعم الفني"
        ]
      }
    ]
  },
  {
    title: "3. خطط المراقبة الشهرية (MMPs) - الدليل الشامل",
    content: [
      "خطط المراقبة الشهرية (MMPs) هي العمود الفقري للعمليات الميدانية في PACT. تحدد خطة المراقبة الشهرية المواقع التي تحتاج إلى زيارات مراقبة خلال فترة معينة، بما في ذلك جدول المراقبة، والأفراد المعينين، وتخصيص الميزانية، ومتطلبات التصاريح. يقدم هذا القسم دليلاً شاملاً من رفع خطة المراقبة إلى إتمام جميع الزيارات واستلام المدفوعات."
    ],
    subsections: [
      {
        title: "3.1 فهم خطط المراقبة الشهرية",
        content: [
          "تحتوي خطة المراقبة على قائمة بالمواقع الميدانية التي تحتاج زيارات مراقبة خلال شهر أو فترة محددة",
          "كل إدخال موقع يتضمن: رمز الموقع، اسم الموقع، الولاية، المحلية، مكتب المحور، نوع النشاط، اسم الشريك المتعاون (CP)، تاريخ الزيارة المخطط",
          "الأنشطة تشمل: AM (سوء التغذية الحاد)، DM (مراقبة التوزيع)، MDM (مراقبة السوق/الجفاف)، PDM (مراقبة ما بعد التوزيع)، مراقبة المستودعات",
          "تمر خطط المراقبة بعملية موافقة متعددة المراحل قبل أن تصبح المواقع متاحة للزيارات الميدانية",
          "كل خطة مراقبة مرتبطة بمشروع ويمكن أن تحتوي على مئات الإدخالات عبر ولايات ومحليات متعددة"
        ]
      },
      {
        title: "3.2 الخطوة 1: رفع خطة المراقبة (المسؤول/تكنولوجيا المعلومات/المنسق)",
        content: [
          "انتقل إلى 'إدارة خطط المراقبة' من الشريط الجانبي",
          "اضغط على زر 'رفع MMP'",
          "اختر المشروع الذي تنتمي إليه هذه الخطة",
          "اختر وارفع ملف CSV يحتوي على إدخالات المواقع",
          "الأعمدة المطلوبة في CSV: site_code، site_name، state، locality، hub_office، activity_at_site، cp_name، visit_date",
          "الأعمدة الاختيارية: monitoring_by، survey_tool، comments، classification، special_requirements",
          "يتحقق النظام من بيانات CSV باستخدام مخطط التحقق Zod",
          "فحوصات التحقق: الحقول المطلوبة موجودة، تنسيق التاريخ صحيح، لا توجد رموز مواقع مكررة",
          "إذا نجح التحقق، يتم إنشاء خطة المراقبة بحالة 'مسودة'",
          "إذا فشل التحقق، تظهر رسائل خطأ توضح الصفوف/الأعمدة التي تحتاج تصحيح",
          "يمكنك أيضاً استخدام محلل رفع Excel للاستيراد بالجملة مع ميزات التعبئة التلقائية"
        ]
      },
      {
        title: "3.3 الخطوة 2: مراجعة واعتماد خطة المراقبة (المسؤول/تكنولوجيا المعلومات)",
        content: [
          "انتقل إلى تبويب 'جديد' في إدارة خطط المراقبة لعرض الخطط المرفوعة",
          "اضغط على خطة مراقبة لعرض تفاصيلها وإدخالات المواقع",
          "راجع كل إدخال موقع للتأكد من الدقة: رموز المواقع صحيحة، ربط الولاية/المحلية صحيح، التواريخ سليمة",
          "يمكن للمسؤول تعديل إدخالات المواقع الفردية إذا لزم التصحيح",
          "الخيارات المتاحة: اعتماد (ينقل إلى حالة 'معتمد')، رفض (يعود للمرفوع مع ملاحظات)، طلب تعديلات (يرسل مرة أخرى للتعديل)",
          "الخطط المعتمدة تصبح مؤهلة للمرحلة التالية: الإحالة إلى مدير العمليات الميدانية (FOM)",
          "إجراء 'إحالة إلى FOM' يرسل خطة المراقبة لفريق العمليات الميدانية للتخطيط للإرسال"
        ]
      },
      {
        title: "3.4 الخطوة 3: التحقق من التصاريح (إذا لزم)",
        content: [
          "بعض المحليات تتطلب تصاريح مراقبة قبل أن تتمكن الزيارات الميدانية من المضي قدماً",
          "يفحص النظام تكوين متطلبات تصريح المحلية لكل موقع",
          "إذا كان التصريح مطلوباً، يظهر خيار 'رفع التصريح' في صفحة تفاصيل الخطة",
          "ارفع وثيقة التصريح (PDF/صورة)",
          "أدخل تفاصيل التصريح: رقم التصريح، تاريخ الإصدار، تاريخ الانتهاء، جهة الإصدار",
          "أرسل التصريح للتحقق من فريق المسؤولين",
          "المواقع التي تفتقر للتصاريح المطلوبة ستُعلَّم ولن يمكن إرسالها",
          "بعد التحقق، يتم ربط التصريح بإدخالات المواقع ذات الصلة"
        ]
      },
      {
        title: "3.5 الخطوة 4: التحقق من المواقع (المسؤول/تكنولوجيا المعلومات)",
        content: [
          "بعد الاعتماد، تمر المواقع بعملية تحقق",
          "يراجع المسؤول/تكنولوجيا المعلومات كل إدخال موقع لتأكيد: دقة الموقع، حالة التصريح، صحة هيكل الرسوم",
          "المواقع المتحقق منها تُعلَّم بعلامة صح خضراء",
          "تبويب 'المواقع المتحقق منها' يعرض جميع المواقع مجمعة حسب الحالة: مواقع جديدة، معتمدة ومُكلَّفة، مُرسَلة، معينة ذكياً، مقبولة، جارية، مكتملة، مرفوضة",
          "كل تبويب فرعي يوفر عروض وإجراءات مناسبة لتلك المرحلة",
          "تعيين التكلفة يحدث هنا: يتم تحديد رسوم الجامع ورسوم النقل بناءً على مستوى التصنيف وموقع الموقع"
        ]
      },
      {
        title: "3.6 الخطوة 5: إرسال المواقع (مدير العمليات/المسؤول)",
        content: [
          "بمجرد التحقق من المواقع وتحديد تكلفتها، يمكن إرسالها لفرق الميدان",
          "افتح خطة المراقبة وانتقل إلى المواقع المتحقق منها",
          "اختر المواقع للإرسال (فردياً أو بالجملة)",
          "اختر نمط الإرسال:",
          "  - إرسال مفتوح: المواقع متاحة لجميع جامعي البيانات المؤهلين (أول من يطالب أولاً)",
          "  - إرسال بالولاية: المواقع مرئية فقط للجامعين في نفس الولاية",
          "  - إرسال بالمحلية: المواقع مرئية فقط للجامعين في نفس الولاية والمحلية",
          "  - إرسال فردي: تعيين مباشر لجامع بيانات محدد بالاسم",
          "اضغط 'إرسال' لجعل المواقع متاحة",
          "المواقع المُرسَلة تظهر في تبويب 'المتاحة للمطالبة' على الهاتف/الويب",
          "التعيين الذكي: يمكن للنظام تعيين المواقع تلقائياً للجامعين القريبين بناءً على موقع GPS والعبء الوظيفي والتصنيف"
        ]
      },
      {
        title: "3.7 الخطوة 6: المطالبة بالموقع (جامع البيانات - هاتف/ويب)",
        content: [
          "يفتح جامعو البيانات صفحة MMP على جهازهم المحمول أو متصفح الويب",
          "تظهر ثلاثة تبويبات رئيسية: المتاحة للمطالبة (المواقع المتاحة)، المعينة (المواقع المعينة ذكياً)، مواقعي (المواقع المطالب بها/المقبولة)",
          "تبويب المتاحة: يعرض جميع المواقع المُرسَلة في منطقة الجامع، مجمعة حسب الولاية-المحلية",
          "  - كل بطاقة موقع تعرض: اسم الموقع، الرمز، نوع النشاط، التاريخ المخطط، الرسوم",
          "  - اضغط 'مطالبة بالموقع' لحجز الموقع لنفسك",
          "  - يستخدم النظام معاملات قاعدة بيانات ذرية لمنع حالات السباق",
          "  - جامع واحد فقط يمكنه المطالبة بكل موقع بنجاح",
          "  - عند المطالبة، يتم حساب رسوم تصنيفك (رسوم الجامع + رسوم النقل) وتثبيتها",
          "تبويب المعينة: يعرض المواقع المعينة لك من النظام أو فريق العمليات",
          "  - هذه زيارات إلزامية يجب إتمامها",
          "  - اضغط 'قبول' للإقرار بالتعيين",
          "  - اضغط 'إقرار بالتكلفة' لتأكيد مبلغ الرسوم"
        ]
      },
      {
        title: "3.8 الخطوة 7: تبويبات مواقعي (جامع البيانات - هاتف/ويب)",
        content: [
          "بعد المطالبة بالمواقع أو تعيينها، تظهر في قسم 'مواقعي' مع أربعة تبويبات فرعية:",
          "",
          "تبويب البريد الوارد (أخضر): يعرض المواقع الجاهزة للبدء - حالات مقبول، مطالب به، مرسل، معين، متحقق، أو معتمد",
          "  - هذه مواقع تنتظرك لبدء الزيارة",
          "  - كل موقع يعرض: الاسم، الرمز، الموقع، نوع النشاط، شارة الحالة، إجمالي الرسوم",
          "  - الإجراءات المتاحة: زر 'بدء الزيارة' لبدء زيارة الموقع، 'طلب سلفة' لسلفة النقل",
          "  - عدد الشارات يظهر عدد المواقع في بريدك الوارد",
          "",
          "تبويب المسودات (أزرق): يعرض المواقع بحالة 'قيد التنفيذ' أو 'جاري'",
          "  - هذه زيارات بدأتها ولم تكملها بعد",
          "  - يمكنك متابعة جمع البيانات في هذه المواقع",
          "  - الإجراءات المتاحة: زر 'إكمال زيارة الموقع' لإنهاء وإرسال البيانات",
          "  - تتبع GPS نشط خلال هذه الزيارات",
          "  - البيانات تُحفظ محلياً وتُزامن عند الاتصال",
          "  - عدد الشارات يظهر عدد الزيارات قيد التنفيذ",
          "",
          "تبويب صندوق الصادر (أصفر): يعرض الزيارات المكتملة المخزنة بدون اتصال وتنتظر المزامنة",
          "  - هذه الزيارات اكتملت بدون اتصال بالإنترنت",
          "  - البيانات مخزنة محلياً على جهازك",
          "  - عند توفر الإنترنت، تُزامن البيانات تلقائياً مع الخادم",
          "  - بعد المزامنة، تنتقل الزيارة إلى تبويب 'المُرسَل'",
          "  - عدد الشارات يظهر عدد الزيارات المكتملة غير المُزامنة",
          "",
          "تبويب المُرسَل (أخضر): يعرض الزيارات المكتملة والمُزامنة بالكامل",
          "  - هذه الزيارات تم إرسالها للخادم بنجاح",
          "  - تم حساب الدفع وإيداعه في محفظتك",
          "  - اعرض تفاصيل الزيارات المكتملة: التاريخ، الموقع، الصور، الرسوم",
          "  - لا حاجة لإجراءات إضافية على هذه المواقع",
          "  - عدد الشارات يظهر عدد الزيارات المكتملة والمُزامنة"
        ]
      },
      {
        title: "3.9 الخطوة 8: إجراء زيارة الموقع",
        content: [
          "من تبويب البريد الوارد، اضغط 'بدء الزيارة' على الموقع المطلوب",
          "تتغير حالة الزيارة إلى 'قيد التنفيذ' وتنتقل إلى تبويب المسودات",
          "يتم التقاط موقع GPS تلقائياً عند وصولك للموقع",
          "جمع البيانات يشمل: إحداثيات GPS (تلقائي)، صور الموقع (التقاط بالكاميرا)، إجابات نموذج الاستبيان، ملاحظات وتعليقات",
          "يمكنك إيقاف الزيارة واستئنافها إذا لزم الأمر - البيانات تُحفظ محلياً",
          "عند جمع جميع البيانات المطلوبة، اضغط 'إكمال زيارة الموقع'",
          "يتحقق النظام من ملء جميع الحقول المطلوبة والتقاط الصور",
          "بيانات الزيارة المكتملة تُوضع في قائمة الانتظار للمزامنة مع الخادم",
          "إذا كان متصلاً: تُزامن البيانات فوراً ويُحسب الدفع",
          "إذا كان غير متصل: تُخزن البيانات في صندوق الصادر حتى يتوفر الاتصال"
        ]
      },
      {
        title: "3.10 الخطوة 9: سلفة النقل (اختياري)",
        content: [
          "قبل بدء الزيارة، يمكنك طلب سلفة نقل",
          "متاحة للمواقع التي لديها ميزانية نقل مخصصة (رسوم النقل > 0)",
          "من البريد الوارد، اضغط 'طلب سلفة' على موقع مقبول/مطالب به",
          "أدخل المبلغ المطلوب (حتى رسوم النقل المخصصة)",
          "الطلب يمر بموافقة من مرحلتين: موافقة المشرف (المرحلة الأولى)، ثم موافقة المسؤول/المالية (المرحلة النهائية)",
          "السلف المعتمدة تُضاف لمحفظتك فوراً",
          "عند إكمال زيارة الموقع، تُخصم السلفة تلقائياً من الدفعة النهائية",
          "صفحة المحفظة تعرض مطابقة السلف مقابل الرسوم المكتسبة",
          "يتطلب تأكيد الاستلام القائم على التوقيع الرقمي لإقرار السلفة"
        ]
      },
      {
        title: "3.11 الخطوة 10: إكمال الزيارة ودفع المحفظة",
        content: [
          "عندما تُعلَّم زيارة الموقع بحالة 'مكتملة' وتُزامن مع الخادم:",
          "1. يحسب النظام إجمالي الدفع: رسوم الجامع + رسوم النقل",
          "2. إذا أُخذت سلفة نقل، تُخصم من الإجمالي",
          "3. يُضاف المبلغ الصافي لمحفظتك الرقمية كمعاملة 'رسوم زيارة موقع'",
          "4. يُنشأ سجل معاملة محفظة بكامل التفاصيل: اسم الموقع، مرجع MMP، تفصيل الرسوم، التاريخ/الوقت",
          "5. يُحدَّث رصيد محفظتك فوراً",
          "6. تتلقى إشعاراً يؤكد الدفع",
          "",
          "صفحة المحفظة تعرض:",
          "  - الرصيد الحالي: الأموال المتاحة بالجنيه السوداني",
          "  - إجمالي الأرباح: الأرباح مدى الحياة من جميع الزيارات المكتملة",
          "  - معلق: المبالغ التي تنتظر الموافقة أو المعالجة",
          "  - هذا الشهر: أرباح الشهر الحالي",
          "  - سجل المعاملات: قائمة كاملة بجميع الإضافات والخصومات والسلف والسحوبات",
          "  - كشف شهري: ملخص مع السلف المستحقة والمطابقة"
        ]
      },
      {
        title: "3.12 مخطط تدفق حالات الموقع الكامل",
        content: [
          "دورة حياة الموقع الكاملة من رفع خطة المراقبة إلى دفع المحفظة تتبع هذا المسار:",
          "",
          "1. مسودة ← خطة المراقبة مرفوعة، إدخالات المواقع مُنشأة في النظام",
          "2. مقدم ← خطة المراقبة مُرسلة للمراجعة من فريق المسؤولين",
          "3. معتمد ← المسؤول اعتمد خطة المراقبة وإدخالات مواقعها",
          "4. متحقق ← المواقع الفردية تم التحقق منها للدقة والرسوم مُعيَّنة",
          "5. مُرسَل ← المواقع متاحة لجامعي البيانات (مرئية في تبويب المتاحة)",
          "6. مُطالب به ← جامع بيانات طالب بالموقع (مقفل لذلك الجامع)",
          "7. مقبول ← المطالبة مُؤكدة، الرسوم مُثبتة (يظهر في تبويب البريد الوارد)",
          "8. قيد التنفيذ ← الجامع بدأ الزيارة، تتبع GPS نشط (يظهر في تبويب المسودات)",
          "9. مكتمل ← جمع البيانات انتهى، أُرسل للخادم (يظهر في تبويب المُرسَل)",
          "10. إيداع المحفظة ← الدفع يُحسب تلقائياً ويُضاف لمحفظة الجامع",
          "",
          "حالات إضافية:",
          "  - معين: الموقع معين مباشرة لجامع (يتخطى المطالبة)",
          "  - جاري: حالة بديلة للزيارات قيد التنفيذ",
          "  - مرفوض: الزيارة رُفضت من المشرف أثناء التحقق",
          "  - ملغى: الزيارة أُلغيت من المسؤول أو فريق العمليات",
          "  - مُسترجع: خطة المراقبة استُرجعت للتعديلات باستخدام نظام الاسترجاع متعدد المستويات"
        ]
      },
      {
        title: "3.13 مرجع تبويبات MMP (عرض المسؤول/العمليات)",
        content: [
          "صفحة إدارة خطط المراقبة توفر تبويبات مختلفة لمراحل مختلفة من سير العمل:",
          "",
          "تبويب جديد: خطط المراقبة المرفوعة حديثاً بانتظار المراجعة - الإجراءات: مراجعة، اعتماد، رفض، تحرير",
          "تبويب المُحالة: خطط المراقبة المُحالة لمدير العمليات - تبويبات فرعية: معلقة (بانتظار إجراء FOM)، متحقق منها (مواقع تم التحقق منها)",
          "تبويب المواقع المتحقق منها: جميع إدخالات المواقع عبر خطط المراقبة مجمعة حسب الحالة:",
          "  - مواقع جديدة: متحقق منها حديثاً، جاهزة لتعيين التكلفة",
          "  - معتمدة ومُكلَّفة: الرسوم مُعيَّنة، جاهزة للإرسال",
          "  - مُرسَلة: المواقع أُرسلت لفرق الميدان",
          "  - معينة ذكياً: المواقع مُعيَّنة تلقائياً من النظام",
          "  - مقبولة: المواقع قبلها الجامعون",
          "  - جارية: المواقع بزيارات نشطة قيد التنفيذ",
          "  - مكتملة: جميع الزيارات انتهت",
          "  - مرفوضة: المواقع رُفضت أثناء التحقق",
          "تبويب المتتبع: تحليلات التغطية وتتبع التقدم",
          "  - يعرض نسب الإنجاز لكل محور، ولاية، محلية",
          "  - حساب مواقع PDM: Math.floor(عدد PDM / 7) لحساب المواقع بدقة (7 استبيانات كاملة = زيارة موقع واحدة)",
          "  - خيارات التصدير لتقارير Excel وPDF"
        ]
      },
      {
        title: "3.14 ميزات وأدوات MMP",
        content: [
          "نظام استرجاع MMP: الاسترجاع متعدد المستويات يسمح للمسؤول/مدير العمليات باسترجاع خطة مراقبة في أي مرحلة للتعديلات",
          "تأجيل الزيارة: إعادة جدولة تواريخ الزيارات المخططة مع توثيق السبب",
          "زيارات بنطاق تاريخ: تكوين نوافذ زيارة بدلاً من تواريخ ثابتة",
          "نظام الإفراج التلقائي: الإفراج التلقائي عن المواقع غير المطالب بها بعد فترة مهلة قابلة للتكوين",
          "إشعارات فجوة التغطية: تنبيهات عندما تفتقر المواقع في مناطق محددة لتغطية الجامعين",
          "الإرسال الذكي: نظام بأسلوب أوبر/ليفت لمطابقة الجامعين بالمواقع بناءً على القرب والتوفر",
          "الاتجاهات التاريخية: عرض اتجاهات إنجاز خطط المراقبة عبر الزمن مع مخططات وتحليلات",
          "تحليلات الاستبيانات: تصورات ديناميكية لبيانات الاستبيانات المجمعة أثناء الزيارات",
          "متتبع التغطية: تتبع تغطية المراقبة مع التصدير إلى Excel (يشمل إجماليات مواقع PDM المُعدلة)"
        ]
      }
    ]
  },
  {
    title: "4. زيارات المواقع - دليل مفصل",
    content: [
      "زيارات المواقع هي الوحدة التشغيلية الأساسية في نظام PACT. كل زيارة تمثل سفر جامع بيانات إلى موقع ميداني لإجراء المراقبة وجمع البيانات وتوثيق النتائج."
    ],
    subsections: [
      {
        title: "4.1 نظرة عامة على دورة حياة زيارة الموقع",
        content: [
          "تتبع زيارة الموقع دورة حياة منظمة من الإرسال إلى الدفع:",
          "1. يُرسَل الموقع من المسؤول/مدير العمليات (يُتاح للمطالبة)",
          "2. يطالب الجامع بالموقع أو يُعيَّن له",
          "3. يسافر الجامع إلى موقع الموقع",
          "4. يبدأ الجامع الزيارة (يُلتقط GPS، الحالة: قيد التنفيذ)",
          "5. يجمع الجامع البيانات، يلتقط الصور، يملأ نماذج الاستبيان",
          "6. يُكمل الجامع الزيارة (الحالة: مكتمل)",
          "7. تُزامن البيانات مع الخادم (إذا كان غير متصل، تنتظر في صندوق الصادر)",
          "8. يُحسب الدفع ويُضاف للمحفظة",
          "9. يمكن للمشرف التحقق من جودة البيانات المقدمة"
        ]
      },
      {
        title: "4.2 تعريفات حالات زيارة الموقع",
        content: [
          "مُرسَل: الموقع أُرسل ومتاح للجامعين للمطالبة. يظهر في تبويب 'المتاحة'",
          "مُطالب به: جامع حجز الموقع. لا يمكن لجامع آخر المطالبة به. بانتظار القبول",
          "مقبول: المطالبة مُؤكدة. الموقع جاهز لزيارة الجامع. يظهر في تبويب 'البريد الوارد'",
          "معين: الموقع عُيِّن مباشرة لجامع من المسؤول/مدير العمليات (ليس عبر المطالبة). يظهر في تبويب 'البريد الوارد'",
          "متحقق: إدخال الموقع تم التحقق منه من المسؤول للدقة والرسوم. جاهز للإرسال",
          "معتمد: خطة المراقبة أو التكلفة اعتُمدت من الجهة المختصة",
          "قيد التنفيذ: الجامع بدأ الزيارة. تتبع GPS نشط. جمع البيانات جارٍ. يظهر في تبويب 'المسودات'",
          "جاري: تسمية بديلة للزيارات قيد التنفيذ (نفس 'قيد التنفيذ'). يظهر في تبويب 'المسودات'",
          "مكتمل: جمع البيانات انتهى وأُرسل. يُحسب الدفع. يظهر في تبويب 'المُرسَل'",
          "مرفوض: الزيارة رُفضت أثناء التحقق (جودة بيانات ضعيفة، موقع خاطئ، إلخ.)",
          "ملغى: الزيارة أُلغيت من المسؤول أو فريق العمليات"
        ]
      },
      {
        title: "4.3 تبويبات الهاتف لجامعي البيانات",
        content: [
          "عندما يفتح جامع البيانات صفحة MMP/المواقع، يرى مستويات التنقل التالية:",
          "",
          "تبويبات المستوى الأعلى:",
          "  المتاحة: المواقع المتاحة التي يمكنك المطالبة بها (مجمعة حسب الولاية-المحلية)",
          "  المعينة: المواقع المعينة لك من النظام أو المسؤول (زيارات إلزامية)",
          "  مواقعي: المواقع المطالب بها والمقبولة (مع تبويبات فرعية أدناه)",
          "",
          "تبويبات فرعية لمواقعي:",
          "  البريد الوارد (أخضر): المواقع الجاهزة للبدء - الحالة مقبول، مطالب به، معين، مرسل، متحقق، أو معتمد",
          "  المسودات (أزرق): الزيارات قيد التنفيذ - الحالة 'قيد التنفيذ' أو 'جاري'. هذه بدأت ولم تكتمل بعد",
          "  صندوق الصادر (أصفر): الزيارات المكتملة بانتظار المزامنة - مخزنة بدون اتصال، ستُزامن تلقائياً عند الاتصال",
          "  المُرسَل (أخضر): الزيارات المكتملة والمُزامنة بالكامل - تمت معالجة الدفع",
          "",
          "كل تبويب يعرض عدد شارات يشير لعدد المواقع في تلك الفئة",
          "أعداد الشارات تُحدَّث في الوقت الحقيقي مع انتقال المواقع بين الحالات"
        ]
      },
      {
        title: "4.4 بدء زيارة الموقع",
        content: [
          "من تبويب البريد الوارد، جد الموقع الذي تريد زيارته",
          "راجع تفاصيل الموقع: الاسم، الرمز، الموقع، نوع النشاط، الرسوم",
          "تأكد من أنك في الموقع أو بالقرب منه (سيُلتقط GPS)",
          "اضغط زر 'بدء الزيارة' (زر أسود بأيقونة تشغيل)",
          "تتغير حالة الموقع إلى 'قيد التنفيذ'",
          "تنتقل بطاقة الموقع من البريد الوارد إلى تبويب المسودات",
          "يُلتقط موقع GPS تلقائياً عند البدء",
          "يبدأ مؤقت تتبع مدة الزيارة",
          "يمكنك الآن بدء أنشطة جمع البيانات"
        ]
      },
      {
        title: "4.5 إكمال زيارة الموقع",
        content: [
          "بعد جمع جميع البيانات المطلوبة في الموقع:",
          "انتقل إلى تبويب المسودات لإيجاد زيارتك قيد التنفيذ",
          "اضغط زر 'إكمال زيارة الموقع' (زر أخضر)",
          "يتحقق النظام من ملء جميع الحقول المطلوبة",
          "يُلتقط موقع GPS النهائي للتحقق من الإكمال",
          "تتغير حالة الزيارة إلى 'مكتمل'",
          "إذا متصل: تُزامن البيانات فوراً مع الخادم، يُحسب الدفع ويُضاف لمحفظتك",
          "إذا غير متصل: تنتقل الزيارة لتبويب صندوق الصادر، البيانات تُخزن محلياً حتى يتوفر الإنترنت",
          "بمجرد المزامنة، تنتقل الزيارة لتبويب المُرسَل",
          "إشعار يؤكد إكمال الزيارة ومبلغ الدفع"
        ]
      },
      {
        title: "4.6 الوضع بدون اتصال ومزامنة البيانات",
        content: [
          "نظام PACT يدعم بالكامل جمع البيانات بدون اتصال للمناطق الميدانية النائية:",
          "يمكنك بدء وإجراء وإكمال زيارات المواقع بدون اتصال بالإنترنت",
          "جميع البيانات (GPS، الصور، إجابات النماذج) تُحفظ محلياً على جهازك",
          "الزيارات المكتملة بدون اتصال تظهر في تبويب صندوق الصادر",
          "عند استعادة الاتصال بالإنترنت، تُزامن البيانات تلقائياً مع الخادم",
          "عملية المزامنة تتعامل مع: إحداثيات GPS، الصور الملتقطة، إجابات الاستبيان، طوابع وقت الزيارة",
          "إذا فشلت المزامنة، تبقى البيانات مخزنة محلياً بأمان وتُعاد المحاولة تلقائياً",
          "عدد شارات صندوق الصادر يظهر كم زيارة تنتظر المزامنة",
          "لا تحذف التطبيق أو تمسح بيانات التطبيق أبداً بينما هناك زيارات في صندوق الصادر"
        ]
      },
      {
        title: "4.7 الدفع بعد الإكمال",
        content: [
          "عند إكمال الزيارة ومزامنتها مع الخادم:",
          "يحسب النظام الدفع بناءً على رسوم مستوى تصنيفك:",
          "  - رسوم الجامع: الدفع الأساسي لزيارة الموقع",
          "  - رسوم النقل: تعويض تكاليف السفر",
          "  - الإجمالي = رسوم الجامع + رسوم النقل",
          "إذا حصلت على سلفة نقل، تُخصم من الإجمالي",
          "يُضاف المبلغ الصافي لمحفظتك الرقمية",
          "تُنشأ معاملة محفظة بالتفاصيل: اسم الموقع، مرجع MMP، تفصيل الرسوم، تاريخ المعاملة",
          "يُحدَّث رصيد محفظتك فوراً",
          "اعرض جميع المعاملات في صفحة المحفظة تحت 'سجل المعاملات'",
          "الكشوف الشهرية تعرض ملخصاً لجميع الأرباح والسلف والمدفوعات الصافية"
        ]
      }
    ]
  },
  {
    title: "5. نظام المطالبة بالمواقع",
    content: [
      "نظام الإرسال بالمطالبة الأولى يعمل مثل أوبر/ليفت - المواقع تُتاح وجامعو البيانات الميدانيون يمكنهم المطالبة بها على أساس أول من يأتي أولاً."
    ],
    subsections: [
      {
        title: "5.1 أنماط الإرسال",
        content: [
          "إرسال مفتوح: المواقع متاحة لجميع جامعي البيانات المؤهلين عبر جميع المواقع - أي جامع نشط يمكنه المطالبة",
          "إرسال بالولاية: المواقع مرئية فقط للجامعين المعينين في نفس الولاية - يحد المطالبة لتلك المنطقة الجغرافية",
          "إرسال بالمحلية: المواقع مرئية فقط للجامعين في نفس الولاية والمحلية - أكثر تقييد جغرافي استهدافاً",
          "إرسال فردي: تعيين مباشر لجامع بيانات محدد بالاسم - فقط ذلك الشخص يمكنه رؤية وقبول الموقع"
        ]
      },
      {
        title: "5.2 كيف تعمل المطالبة",
        content: [
          "افتح صفحة المواقع أو صفحة MMP على الهاتف/الويب",
          "انتقل إلى تبويب 'المتاحة' لرؤية المواقع المُرسَلة في منطقتك",
          "المواقع مجمعة حسب الولاية-المحلية لسهولة التصفح",
          "كل بطاقة موقع تعرض: اسم الموقع، الرمز، النشاط، التاريخ، اسم الشريك، ومعلومات الرسوم",
          "اضغط 'مطالبة بالموقع' على الموقع الذي تريد زيارته",
          "يحجز النظام الموقع لك فوراً باستخدام معاملات قاعدة بيانات ذرية",
          "مستوى تصنيفك يحدد رسوم الجامع ورسوم النقل",
          "الرسوم تُحسب وتُثبت عند وقت المطالبة",
          "ينتقل الموقع من 'المتاحة' إلى 'مواقعي > البريد الوارد'",
          "الجامعون الآخرون لم يعد بإمكانهم رؤية هذا الموقع أو المطالبة به"
        ]
      },
      {
        title: "5.3 حماية المطالبة والعدالة",
        content: [
          "يستخدم معاملات قاعدة بيانات ذرية (PostgreSQL RPC) لسلامة التزامن",
          "جامع واحد فقط يمكنه المطالبة بكل موقع بنجاح - يمنع المطالبة المزدوجة",
          "تُعالج المطالبات بالترتيب المستلم - أول من يأتي أولاً",
          "إذا حاول جامعان المطالبة في وقت واحد، ينجح الأول فقط",
          "المطالبات الفاشلة تعرض رسالة فورية: 'الموقع مطالب به بالفعل من جامع آخر'",
          "نظام الإفراج التلقائي: يمكن الإفراج التلقائي عن المواقع غير المطالب بها بعد فترة مهلة قابلة للتكوين"
        ]
      },
      {
        title: "5.4 حساب الرسوم عند المطالبة",
        content: [
          "عندما تطالب بموقع، يحسب النظام تلقائياً مدفوعاتك:",
          "1. يُسترجع مستوى تصنيفك (أ/كبير، ب/عادي، ج/مبتدئ) من ملفك الشخصي",
          "2. يُطبق هيكل الرسوم لتصنيفك على الموقع",
          "3. رسوم الجامع: مبلغ الدفع الأساسي لمستوى تصنيفك",
          "4. رسوم النقل: تعويض السفر بناءً على موقع الموقع والتصنيف",
          "5. إجمالي التكلفة = رسوم الجامع + رسوم النقل",
          "6. الرسوم تُثبت عند وقت المطالبة ولا يمكن تغييرها بعد ذلك",
          "7. عند الإكمال الناجح لزيارة الموقع، يُضاف المبلغ الإجمالي لمحفظتك"
        ]
      }
    ]
  },
  {
    title: "5. النظام المالي",
    content: [
      "يتضمن النظام المالي إدارة المحافظ والميزانيات والمدفوعات والتكاليف."
    ],
    subsections: [
      {
        title: "5.1 نظام المحفظة",
        content: [
          "كل مستخدم ميداني لديه محفظة رقمية",
          "استلام مدفوعات زيارات المواقع",
          "تتبع تاريخ الأرباح",
          "إدارة عمليات السحب",
          "الرصيد الحالي: الأموال المتاحة بالجنيه السوداني"
        ]
      },
      {
        title: "5.2 أنواع المعاملات",
        content: [
          "دفعة مقدمة: سلفة لمصاريف الميدان",
          "رسوم زيارة الموقع: دفع لزيارات المواقع المكتملة",
          "تكلفة النقل: استرداد مصاريف السفر",
          "تعديل: تصحيحات يدوية للرصيد",
          "سحب: صرف من المحفظة"
        ]
      },
      {
        title: "5.3 سير عمل الموافقة على المرحلتين",
        content: [
          "المرحلة الأولى: مراجعة المشرف - المراجعة الأولية",
          "المرحلة الثانية: موافقة المالية/المسؤول - التفويض النهائي",
          "يجب موافقة كلا المرحلتين قبل معالجة الدفع"
        ]
      }
    ]
  },
  {
    title: "6. تقديم التكاليف التشغيلية",
    content: [
      "نظام منفصل لتقديم التكاليف التشغيلية الميدانية التي لا تتعلق بنقل زيارات المواقع."
    ],
    subsections: [
      {
        title: "6.1 ما هي التكاليف التشغيلية؟",
        content: [
          "التصاريح: تصاريح الوصول المحلية، التراخيص الحكومية",
          "الحوافز: مكافآت الفريق، البدلات الميدانية",
          "الاتصالات: رصيد الهاتف، بطاقات SIM، باقات الإنترنت",
          "التدريب: ورش العمل، المواد التدريبية، استئجار القاعات",
          "النقل العام: سفر المكتب، زيارات المحاور (ليس نقل زيارة الموقع)",
          "المعدات واللوازم: معدات ميدانية، قرطاسية، أدوات",
          "الطباعة والمواد: نماذج، تقارير، أدلة",
          "الاجتماعات والفعاليات: استئجار القاعة، المرطبات",
          "أخرى: أي تكلفة تشغيلية غير مشمولة أعلاه"
        ]
      },
      {
        title: "6.2 من يمكنه تقديم التكاليف التشغيلية؟",
        content: [
          "مدير العمليات الميدانية (FOM): مصاريف تشغيلية على مستوى المحور",
          "المنسق: تكاليف التنسيق على مستوى الولاية",
          "المدير القطري: تكاليف تشغيلية على المستوى الوطني",
          "المسؤول / المسؤول الأعلى: أي تكلفة تشغيلية",
          "المشرف: مصاريف متعلقة بإشراف الفريق",
          "ملاحظة: جامعو البيانات لا يمكنهم تقديم تكاليف تشغيلية"
        ]
      },
      {
        title: "6.3 خطوات تقديم طلب التكلفة",
        content: [
          "انتقل إلى المالية > التكاليف التشغيلية",
          "اضغط على 'طلب جديد'",
          "اختر نوع الطلب: سلفة أو استرداد",
          "حدد فئة المصاريف من القائمة",
          "أدخل المبلغ بالجنيه السوداني",
          "أضف وصفاً يوضح المصروف",
          "أرفق المستندات الداعمة (إيصالات، فواتير)",
          "اضغط 'إرسال' للتقديم للموافقة"
        ]
      },
      {
        title: "6.4 سير عمل الموافقة",
        content: [
          "الخطوة 1 - التقديم: اختر سلفة أو استرداد، حدد الفئة، أدخل المبلغ، أرفق الوثائق",
          "الخطوة 2 - مراجعة المرحلة الأولى: المشرف/مدير العمليات يراجع ويتحقق",
          "الخطوة 3 - موافقة المرحلة الثانية: المسؤول يقوم بالمراجعة النهائية والتفويض",
          "الخطوة 4 - التسوية (للسلف فقط): بعد الإنفاق، قدم الإيصالات الفعلية",
          "الحالات: معلق، موافق المرحلة 1، مرفوض المرحلة 1، موافق المرحلة 2، مرفوض المرحلة 2، تمت التسوية، مغلق"
        ]
      },
      {
        title: "6.5 عناصر التكلفة بالكمية",
        content: [
          "يدعم كل طلب تكلفة عناصر متعددة بتسعير قائم على الكمية",
          "لكل عنصر مصروف، أدخل: الفئة، العنوان/الوصف، الكمية، تكلفة الوحدة",
          "يحسب النظام تلقائياً: الإجمالي = الكمية × تكلفة الوحدة",
          "يتم تجميع جميع العناصر حسب الفئة مع إجماليات فرعية بتصميم فاتورة",
          "كل طلب يحصل على رقم طلب مُولّد يجمع التاريخ واختصار المشروع وعدد العناصر",
          "فئة 'أخرى' تتطلب نصاً توضيحياً يشرح نوع المصروف",
          "المشروع والتاريخ والعنوان حقول إلزامية لكل طلب تكلفة"
        ]
      },
      {
        title: "6.6 رفع Excel/CSV لعناصر التكلفة بالجملة",
        content: [
          "رفع عناصر المصاريف بالجملة من ملفات Excel أو CSV بدلاً من إدخالها واحدة تلو الأخرى",
          "اضغط على 'رفع Excel / CSV' أسفل قسم عناصر المصاريف",
          "يكتشف النظام تلقائياً عناوين الأعمدة (الفئة، العنوان، الكمية، تكلفة الوحدة، العملة، الوصف، المبرر، المورد، رقم المرجع)",
          "يتعرف على أسماء أعمدة متنوعة: Qty للكمية، Price لتكلفة الوحدة، Supplier للمورد",
          "يتحقق من كل صف مقابل فئات المصاريف التسع الصالحة",
          "يظهر رسائل خطأ واضحة للصفوف غير الصالحة",
          "العناصر الصالحة تُضاف تلقائياً في نموذج طلب التكلفة",
          "اضغط 'تنزيل القالب' للحصول على ملف Excel جاهز مع العناوين الصحيحة وصفوف نموذجية وقائمة الفئات"
        ]
      },
      {
        title: "6.7 التوقيعات الرقمية للموافقات",
        content: [
          "موافقات المرحلة الثانية النهائية تتطلب توقيعاً رقمياً",
          "طريقتان للتوقيع: لوحة توقيع بخط اليد أو تحقق بالمعرف الفريد",
          "يتم تشفير التوقيعات باستخدام SHA-256",
          "يتم إنشاء شهادات موافقة PDF مع التوقيع المضمن",
          "سجل تدقيق كامل لجميع أحداث التوقيع"
        ]
      },
      {
        title: "6.8 تأكيد استلام السلفة",
        content: [
          "بعد معالجة المالية لدفعة سلفة النقل، يجب على الموظف الذي طلبها تأكيد الاستلام",
          "يظهر زر 'تأكيد الاستلام' للمقدم بعد معالجة الدفع",
          "التأكيد يستخدم التوقيع الرقمي (بخط اليد أو بالمعرف الفريد)",
          "يتم حفظ تأكيد الاستلام مع تجزئة التوقيع والطريقة والطابع الزمني",
          "فقط المقدم الأصلي يمكنه تأكيد الاستلام",
          "يتم تحديث الجدول الزمني لسير العمل لإظهار خطوات 'مدفوع' ثم 'مؤكد'",
          "متاح بالعربية والإنجليزية"
        ]
      }
    ]
  },
  {
    title: "7. إدارة الفريق الميداني",
    content: [
      "أدوات شاملة لإدارة عمليات الفريق الميداني والتتبع."
    ],
    subsections: [
      {
        title: "7.1 تتبع الموقع",
        content: [
          "خريطة الفريق: عرض جميع أعضاء الفريق على الخريطة",
          "تاريخ الموقع: تتبع أنماط الحركة",
          "تنبيهات القرب: إشعار عند اقتراب الجامعين من المواقع",
          "مشاركة الموقع: أعضاء الفريق يشاركون موقعهم أثناء الزيارات"
        ]
      },
      {
        title: "7.2 التصنيف والرسوم",
        content: [
          "المستوى أ (كبير): خبرة 2+ سنة، أعلى معدل رسوم، مواقع معقدة",
          "المستوى ب (عادي): خبرة 1-2 سنة، معدل رسوم متوسط، مواقع عادية",
          "المستوى ج (مبتدئ): خبرة أقل من سنة، معدل رسوم ابتدائي، مواقع تدريبية"
        ]
      }
    ]
  },
  {
    title: "8. التقارير والتحليلات",
    content: [
      "أدوات شاملة لإعداد التقارير وتحليل البيانات."
    ],
    subsections: [
      {
        title: "8.1 التقارير المتاحة",
        content: [
          "ملخص زيارات المواقع: معدلات الإنجاز حسب الفترة",
          "الملخص المالي: المصاريف والمدفوعات",
          "أداء الفريق: مقاييس الجامعين",
          "استخدام الميزانية: تحليل الإنفاق",
          "تقدم MMP: التخطيط مقابل التنفيذ"
        ]
      },
      {
        title: "8.2 صيغ التصدير",
        content: [
          "PDF: للطباعة والتوزيع",
          "Excel: لتحليل البيانات",
          "CSV: لتكامل الأنظمة"
        ]
      }
    ]
  },
  {
    title: "9. تطبيق الهاتف المحمول",
    content: [
      "يوفر تطبيق PACT للهاتف المحمول إمكانية كاملة للعمليات الميدانية مع دعم العمل بدون اتصال."
    ],
    subsections: [
      {
        title: "9.1 الميزات الرئيسية",
        content: [
          "جمع البيانات بدون اتصال أولاً مع IndexedDB",
          "تتبع GPS مع دعم السياج الجغرافي",
          "إشعارات فورية للتعيينات",
          "تكامل الكاميرا للصور",
          "مزامنة في الخلفية عند الاتصال بالإنترنت"
        ]
      },
      {
        title: "9.2 التثبيت",
        content: [
          "تنزيل APK من المصدر المعتمد",
          "تمكين 'التثبيت من مصادر غير معروفة'",
          "فتح ملف APK للتثبيت",
          "منح الأذونات المطلوبة",
          "تسجيل الدخول ببيانات الاعتماد الخاصة بك"
        ]
      }
    ]
  },
  {
    title: "10. استكشاف الأخطاء وإصلاحها",
    content: [
      "المشاكل الشائعة وحلولها."
    ],
    subsections: [
      {
        title: "10.1 مشاكل تسجيل الدخول",
        content: [
          "تحقق من صحة بيانات الاعتماد",
          "امسح ذاكرة التخزين المؤقت وملفات تعريف الارتباط",
          "جرب وضع التصفح المتخفي",
          "تحقق من اتصال الإنترنت",
          "اتصل بالمسؤول إذا كان الحساب مقفلاً"
        ]
      },
      {
        title: "10.2 مشاكل GPS",
        content: [
          "قم بتمكين وضع الدقة العالية في إعدادات الجهاز",
          "امنح أذونات الموقع للتطبيق",
          "تأكد من وجود رؤية واضحة للسماء",
          "أعد تشغيل التطبيق إذا لم يتم تحديث الموقع"
        ]
      },
      {
        title: "10.3 مشاكل المزامنة",
        content: [
          "تحقق من استقرار اتصال الإنترنت",
          "اسحب لأسفل لتحديث البيانات يدوياً",
          "أغلق التطبيق بالقوة وأعد فتحه",
          "تحقق من وجود تحديثات للتطبيق"
        ]
      }
    ]
  },
  {
    title: "11. إدارة المكافآت الشهرية",
    content: [
      "تتبع ومعالجة شاملة لمدفوعات المكافآت الشهرية للموظفين المصنفين."
    ],
    subsections: [
      {
        title: "11.1 نظرة عامة",
        content: [
          "إدارة المكافآت متاحة في المدفوعات والمالية > إدارة المكافآت",
          "تتبع ومعالجة المدفوعات الشهرية للموظفين المؤهلين للمكافآت",
          "متاحة لأدوار المسؤول الأعلى والمسؤول والمسؤول المالي",
          "تستخدم معاملات المحفظة مع نوع البيانات الوصفية 'retainer' للتتبع"
        ]
      },
      {
        title: "11.2 التبويبات المتاحة",
        content: [
          "نظرة عامة: بطاقات مؤشرات الأداء والملخص الشهري ومخططات التصنيف",
          "سجل المدفوعات: قائمة معاملات قابلة للبحث والفرز مع إمكانية التصدير",
          "شبكة التتبع: مصفوفة مستخدم × 12 شهراً تعرض حالة الدفع",
          "المستخدمون المؤهلون: جميع الأعضاء المصنفين مع حالتهم الحالية",
          "سجل التدقيق: سجل كامل لجميع إجراءات المكافآت",
          "المراجعة والمعالجة: معاينة قبل معالجة الدفع الجماعي لمنع الأخطاء"
        ]
      },
      {
        title: "11.3 معالجة مدفوعات المكافآت",
        content: [
          "انتقل إلى تبويب المراجعة والمعالجة",
          "معاينة المستخدمين المؤهلين للفترة الحالية",
          "مراجعة المبالغ والتحقق من عدم وجود تكرارات",
          "النظام يتضمن منع الدفع المكرر",
          "معالجة المدفوعات الجماعية لجميع المستخدمين المؤهلين",
          "تصدير CSV متاح لجميع العروض لحفظ السجلات"
        ]
      }
    ]
  },
  {
    title: "12. تكامل المحفظة والسلف",
    content: [
      "يتم تسوية سلف النقل تلقائياً مع رسوم زيارات المواقع عند إيداع المبالغ في المحافظ."
    ],
    subsections: [
      {
        title: "12.1 كيف يعمل",
        content: [
          "عندما يتلقى الجامع سلفة (دفعة مقدمة) قبل زيارة الموقع، يتتبعها النظام",
          "عند إكمال زيارة الموقع، يتم خصم مبلغ السلفة تلقائياً من الرسوم المكتسبة",
          "يستخدم علامة 'advance_reconciled_at' في البيانات الوصفية لمنع الخصم المزدوج",
          "يتم إيداع المبلغ الصافي (الرسوم ناقص السلفة) في المحفظة"
        ]
      },
      {
        title: "12.2 كشوف الحساب الشهرية",
        content: [
          "تتضمن صفحة المحفظة كشوف حساب شهرية على غرار البنوك",
          "كل كشف يعرض الرصيد الافتتاحي وجميع المعاملات والرصيد الختامي للشهر",
          "تصدير CSV متاح لكل فترة كشف شهري",
          "المعاملات مصنفة حسب النوع (أرباح، سلف، خصومات، تعديلات)"
        ]
      }
    ]
  },
  {
    title: "13. عارض منظور الأدوار",
    content: [
      "أداة للمسؤول الأعلى لعرض ما يمكن لأي دور أو مستخدم رؤيته في النظام."
    ],
    subsections: [
      {
        title: "13.1 الوصول إلى الأداة",
        content: [
          "انتقل إلى الإدارة > عارض منظور الأدوار في الشريط الجانبي",
          "متاح فقط لمستخدمي المسؤول الأعلى",
          "يقع تحت قسم الإدارة في قائمة الشريط الجانبي"
        ]
      },
      {
        title: "13.2 الميزات",
        content: [
          "الشاشات المرئية: عرض عناصر القائمة والصفحات المرئية لأي دور محدد",
          "مصفوفة الصلاحيات: شبكة كاملة للموارد والإجراءات تعرض جميع الصلاحيات (قراءة، إنشاء، تحديث، حذف)",
          "ملخص الصلاحيات: إحصائيات سريعة لإجمالي الصلاحيات الممنوحة",
          "مقارنة الأدوار: مقارنة دورين جنباً إلى جنب مع إبراز الاختلافات",
          "يستخدم نظام الصلاحيات الفعلي للمحاكاة الدقيقة"
        ]
      }
    ]
  },
  {
    title: "14. نظام المفضلة في الشريط الجانبي",
    content: [
      "يمكن للمستخدمين تخصيص شريطهم الجانبي بالصفحات المفضلة للوصول السريع."
    ],
    subsections: [
      {
        title: "14.1 كيفية استخدام المفضلة",
        content: [
          "ثبّت الصفحات المستخدمة بشكل متكرر بالنقر على أيقونة النجمة/التثبيت بجانب أي عنصر في القائمة",
          "تظهر العناصر المثبتة في أعلى الشريط الجانبي في قسم مفضلة مخصص",
          "اسحب وأفلت لإعادة ترتيب عناصرك المفضلة",
          "المفضلة محفوظة في قاعدة البيانات وتبقى عبر الجلسات والأجهزة",
          "ألغِ تثبيت العناصر بالنقر على أيقونة النجمة/التثبيت مرة أخرى"
        ]
      }
    ]
  },
  {
    title: "15. لافتات معلومات الصفحة",
    content: [
      "كل صفحة مالية تتضمن لافتة معلومات تشرح غرضها وسير العمل."
    ],
    subsections: [
      {
        title: "15.1 ما هي لافتات معلومات الصفحة؟",
        content: [
          "كل صفحة من الصفحات المالية الـ 12+ لديها لافتة قابلة للطي في الأعلى",
          "تشرح اللافتة ما تفعله الصفحة بلغة بسيطة",
          "تعرض سير العمل 'من يفعل ماذا - خطوة بخطوة' مع خطوات مرقمة",
          "كل خطوة تعرض شارة ملونة خاصة بالدور ووصف الإجراء",
          "مطوية بشكل افتراضي لتوفير مساحة الشاشة - انقر للتوسيع",
          "تساعد المستخدمين الجدد على فهم غرض كل صفحة دون وثائق خارجية"
        ]
      }
    ]
  },
  {
    title: "16. وحدة كشوف الدوام وجدولة الرواتب",
    content: [
      "توفر وحدة كشوف الدوام نظاماً متكاملاً لتتبع ساعات عمل الموظفين وإدارة أرصدة الإجازات وجدولة مسيرات الرواتب مع سير عمل موافقة متكامل."
    ],
    subsections: [
      {
        title: "16.1 نظرة عامة على كشوف الدوام",
        content: [
          "يمكن للموظفين تسجيل ساعات العمل اليومية من ملفهم الشخصي أو مركز الموارد البشرية",
          "كل إدخال يسجل التاريخ وساعات العمل والمشروع/المهمة المرتبطة والملاحظات",
          "يمكن للمشرفين ومسؤولي الموارد البشرية مراجعة كشوف الدوام المقدمة والموافقة عليها",
          "يتم تجميع الملخصات الشهرية تلقائياً لحساب الراتب",
          "التكامل مع طلبات الإجازة يضمن استبعاد أيام الإجازة من الساعات القابلة للفوترة"
        ]
      },
      {
        title: "16.2 تقديم كشف دوام",
        content: [
          "انتقل إلى مركز الموارد البشرية ← تبويب كشوف الدوام",
          "انقر على 'إضافة إدخال' وحدد تاريخ العمل",
          "أدخل ساعات العمل وحدد المشروع أو المهمة المرتبطة",
          "أضف ملاحظات اختيارية للسياق",
          "قدم للمراجعة من قبل المشرف — الإدخالات المقدمة تكون مقفلة من التعديل"
        ]
      },
      {
        title: "16.3 جدولة الرواتب",
        content: [
          "يمكن لمسؤولي المالية جدولة مسيرات الرواتب من مركز الموارد البشرية ← الرواتب ← جدولة مسيرة",
          "حدد فترة الرواتب (تاريخ البداية/النهاية) وتاريخ الدفع",
          "يحسب النظام تلقائياً إجمالي الراتب بناءً على كشوف الدوام المعتمدة وعقود الرواتب واتفاقيات الاحتفاظ",
          "يتم تطبيق الاستقطاعات (سداد السلف، الإجازات غير المدفوعة) تلقائياً",
          "يتم إنشاء ملخص مسيرة الرواتب لمراجعة المسؤول قبل المعالجة"
        ]
      },
      {
        title: "16.4 سير عمل الموافقة على الرواتب",
        content: [
          "الخطوة 1 — يُعدّ مسؤول المالية مسيرة الرواتب ويراجع الملخص",
          "الخطوة 2 — يوافق المسؤول أو المسؤول الأعلى على مسيرة الرواتب",
          "الخطوة 3 — يعتمد النظام المحافظ الفردية ويُنشئ قسائم الراتب",
          "الخطوة 4 — يتلقى الموظفون إشعاراً داخل التطبيق وعبر البريد الإلكتروني مع رابط قسيمة الراتب",
          "جميع إجراءات الرواتب مسجلة في سجل التدقيق"
        ]
      }
    ]
  },
  {
    title: "17. متتبع الاشتراكات وتقارير نهاية الشهر المالية",
    content: [
      "يساعد متتبع الاشتراكات المنظمة على مراقبة جميع اشتراكات البرامج والخدمات النشطة وتتبع تواريخ التجديد وإدارة التكاليف. توفر وحدة نهاية الشهر تقارير إغلاق مالية آلية."
    ],
    subsections: [
      {
        title: "17.1 نظرة عامة على متتبع الاشتراكات",
        content: [
          "يمكن الوصول إليه من العمليات المالية ← الاشتراكات",
          "يسرد جميع الاشتراكات النشطة مع اسم المورد والتكلفة ودورة الفوترة وتاريخ التجديد والمسؤول",
          "تنبيهات تجديد مرمزة بالألوان: أحمر (متأخر)، كهرماني (مستحق خلال 30 يوماً)، أخضر (نشط)",
          "يدعم أنواع الدفع السنوية والشهرية ولمرة واحدة",
          "يمكن للمسؤول ومسؤولي المالية إضافة الاشتراكات وتعديلها وإلغاؤها"
        ]
      },
      {
        title: "17.2 إضافة اشتراك",
        content: [
          "انقر على 'إضافة اشتراك' وأدخل: اسم المورد، وصف الخدمة، التكلفة (دولار/جنيه)، دورة الفوترة",
          "حدد تاريخ التجديد — سيُنبّه النظام المسؤول قبل 30 يوماً من التجديد",
          "عيّن مسؤولاً (الموظف المسؤول عن إدارة الاشتراك)",
          "أرفق أي وثيقة عقد أو فاتورة",
          "احفظ — يظهر الاشتراك في المتتبع فوراً"
        ]
      },
      {
        title: "17.3 تقارير نهاية الشهر",
        content: [
          "انتقل إلى العمليات المالية ← تقارير نهاية الشهر",
          "حدد فترة التقرير (الشهر/السنة) وانقر على 'إنشاء تقرير'",
          "يتضمن التقرير: إجمالي الإيرادات، إجمالي النفقات، أرصدة المحافظ، السلف القائمة، تقديمات التكاليف، تكاليف الاشتراكات، والمركز الصافي",
          "تصدير كـ PDF أو Excel للمراجعات الخارجية",
          "قفل إغلاق الفترة يمنع التعديلات بأثر رجعي بعد الاعتماد النهائي"
        ]
      }
    ]
  },
  {
    title: "18. إعدادات التكاملات (البريد الإلكتروني والتقويم)",
    content: [
      "تتيح صفحة إعدادات التكاملات لكل مستخدم ربط حسابه في تقويم Google وضبط تفضيلات إشعارات البريد الإلكتروني من واجهة موحدة."
    ],
    subsections: [
      {
        title: "18.1 الوصول إلى إعدادات التكاملات",
        content: [
          "انقر على صورتك الشخصية في الزاوية العلوية اليمنى من الشريط الجانبي",
          "اختر 'التكاملات' من القائمة المنسدلة",
          "أو انتقل مباشرةً إلى /integrations"
        ]
      },
      {
        title: "18.2 تكامل تقويم Google",
        content: [
          "انقر على 'ربط تقويم Google' لبدء تدفق تفويض OAuth",
          "سيتم توجيهك إلى Google لمنح وصول التقويم — لا يتم تخزين كلمات المرور",
          "بعد الربط، يظهر البريد الإلكتروني لحسابك وتتحول شارة الحالة إلى اللون الأخضر",
          "يمكن لفعاليات PACT (زيارات المواقع، معالم المشاريع، مواعيد MMP) المزامنة مع تقويمك",
          "انقر على 'قطع الاتصال' في أي وقت لإلغاء الوصول — يتم حذف الرموز من الخادم فوراً"
        ]
      },
      {
        title: "18.3 تفضيلات إشعارات البريد الإلكتروني",
        content: [
          "استخدم المفتاح الرئيسي لتمكين أو تعطيل جميع إشعارات البريد الإلكتروني",
          "اضبط الفئات التي تُشغّل رسائل البريد الإلكتروني باستخدام أزرار التشغيل الفردية:",
          "  • تعيينات المهام — إشعار عند تعيين مهمة لك",
          "  • طلبات الموافقة — إشعار عند الحاجة إلى موافقتك",
          "  • الرواتب — إشعار عند جاهزية قسائم الراتب أو معالجة الرواتب",
          "  • المعالم — إشعار عند استحقاق معلم مشروع أو تحقيقه",
          "  • النظام — إشعار لأحداث أمان الحساب وإعلانات النظام",
          "حدد عنوان بريد إلكتروني مخصص للإشعارات إذا كنت تفضل صندوق بريد مختلف عن بريد تسجيل الدخول"
        ]
      }
    ]
  },
  {
    title: "19. تحسينات لوحة محفظة المشاريع التنفيذية",
    content: [
      "تم تحديث لوحة محفظة المشاريع (/portfolio) بإضافة رؤى تنفيذية، مما يمكّن المدراء وكبار الإدارة من مراقبة محفظة المشاريع بأكملها من عرض واحد."
    ],
    subsections: [
      {
        title: "19.1 بطاقات المؤشرات التنفيذية",
        content: [
          "ست بطاقات مؤشرات حية في أعلى لوحة القيادة تُحدَّث في الوقت الفعلي:",
          "  • المشاريع النشطة — عدد المشاريع قيد التنفيذ",
          "  • المشاريع المتوقفة — المشاريع التي لا يوجد فيها نشاط خلال الـ 14 يوماً الماضية",
          "  • المشاريع المعرضة للخطر — المشاريع التي يحددها خوارزمية الصحة",
          "  • المعالم المتأخرة — المعالم التي تجاوزت تاريخ الإكمال المخطط",
          "  • معدل استهلاك الميزانية — إجمالي الميزانية المستهلكة كنسبة مئوية",
          "  • المكتملة هذا العام — المشاريع المغلقة خلال السنة التقويمية الحالية"
        ]
      },
      {
        title: "19.2 جدول مصفوفة الصحة",
        content: [
          "صف واحد لكل مشروع يعرض: اسم المشروع، إشارة الصحة (RAG)، تقدم المسار، المعلم التالي، ونسبة الاستهلاك",
          "قابل للترتيب حسب أي عمود — انقر على رؤوس الأعمدة للترتيب تصاعدياً/تنازلياً",
          "قابل للتصفية حسب نوع المشروع أو الحالة أو إشارة الصحة",
          "يتم حساب إشارة الصحة من: الالتزام بالجدول الزمني، استهلاك الميزانية، نشاط الفريق، ومعدل إكمال المعالم"
        ]
      },
      {
        title: "19.3 تبويب لوحة البيبلاين والتنوع",
        content: [
          "تبويب البيبلاين: لوحة Kanban منظمة حسب مرحلة تدفق المشروع مع ممر سباحة للمشاريع المتوقفة في الأسفل",
          "تبويب تنوع المشاريع: مخطط دائري يعرض التوزيع حسب نوع المشروع، بالإضافة إلى مخطط شريطي لتوزيع الحالات",
          "كلا التبويبين يتحدثان مباشرةً عند تغيير مراحل أو حالات المشروع"
        ]
      }
    ]
  }
];

export const generateArabicUserManualDOCX = async () => {
  const children: any[] = [];

  children.push(
    new Paragraph({
      text: "منصة PACT للعمليات الميدانية",
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 200 }
    }),
    new Paragraph({
      text: "دليل المستخدم الشامل",
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
        new TextRun({ text: "الإصدار 4.0", size: 20 })
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

  arabicDocumentationSections.forEach((section) => {
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

  arabicDocumentationSections.forEach((section) => {
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
                new TextRun({ text: `• ${line}` })
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
  const filename = `PACT_User_Manual_Arabic_${format(new Date(), 'yyyy-MM-dd')}.docx`;
  saveAs(blob, filename);
};

export const getArabicDocumentationSections = () => arabicDocumentationSections;
