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
          "Team Coordination Center - Real-time location sharing, voice/video calling (WebRTC & Jitsi), and instant messaging",
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
    title: "8. Monthly Monitoring Plans (MMPs)",
    content: [
      "MMPs are structured plans that define sites to be monitored, schedule, personnel, and budget."
    ],
    subsections: [
      {
        title: "8.1 Understanding MMPs",
        content: [
          "Sites to be monitored",
          "Monitoring schedule",
          "Assigned personnel",
          "Budget allocation",
          "Permit requirements"
        ]
      },
      {
        title: "8.2 MMP Upload - CSV Requirements",
        content: [
          "Required columns: site_code, site_name, state, locality, planned_date",
          "Optional columns: classification, special_requirements",
          "Date format: YYYY-MM-DD",
          "File format: UTF-8 encoded CSV"
        ]
      },
      {
        title: "8.3 MMP Workflow Stages",
        content: [
          "Draft: Initial upload - Edit, Delete",
          "Submitted: Awaiting review - Review",
          "Under Review: Being reviewed - Approve, Reject, Request Changes",
          "Approved: Ready for dispatch - Forward to FOM",
          "Forwarded to FOM: With Field Operations - Assign Coordinators",
          "Dispatched: Sites assigned - Monitor Progress",
          "Completed: All visits done - Archive",
          "Archived: Historical record - View Only"
        ]
      },
      {
        title: "8.4 MMP Verification",
        content: [
          "Open the MMP",
          "Click 'Verify'",
          "Review each site entry: Location accuracy, Permit status, Classification correctness",
          "Mark items as verified or flag issues",
          "Complete verification"
        ]
      },
      {
        title: "8.5 Permit Management",
        content: [
          "Go to MMP detail",
          "Click 'Permit Upload'",
          "Upload permit document",
          "Enter: Permit Number, Issue Date, Expiry Date, Issuing Authority",
          "Submit for verification"
        ]
      },
      {
        title: "8.6 Dispatching Sites",
        content: [
          "Open the MMP",
          "Select sites to dispatch",
          "Choose dispatch mode: Open, State, Locality, Individual",
          "Click 'Dispatch'"
        ]
      }
    ]
  },
  {
    title: "9. Site Visits",
    content: [
      "Site visits are the core operational unit of the PACT system."
    ],
    subsections: [
      {
        title: "9.1 Creating Site Visits",
        content: [
          "From MMP: Select from approved MMP sites",
          "Urgent: Create ad-hoc urgent visit",
          "Fill in: Site information, Planned date, Assigned collector, Special instructions",
          "Click 'Create'"
        ]
      },
      {
        title: "9.2 Site Visit Status Flow",
        content: [
          "Dispatched: Available for claiming",
          "Claimed: Collector has claimed the site",
          "Accepted: Claim approved, ready to start",
          "Assigned: Directly assigned by operations",
          "In Progress: Visit actively being conducted",
          "Completed: Data collection finished",
          "Verified: Supervisor has verified data",
          "Cancelled: Visit cancelled"
        ]
      },
      {
        title: "9.3 Conducting Site Visits",
        content: [
          "View your assigned/claimed visits on the dashboard",
          "Click on a visit to open details",
          "Click 'Start Visit' to begin",
          "Capture: GPS location (automatic), Photos, Form responses, Face verification (if required)",
          "Click 'Complete Visit'"
        ]
      },
      {
        title: "9.4 Completion Requirements",
        content: [
          "GPS location captured",
          "All required photos taken",
          "All form fields completed",
          "Data synced to server"
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
          "Open: Available to all qualified collectors - Any active data collector can claim",
          "State: Limited to collectors in specific states - Collectors assigned to those states",
          "Locality: Limited to collectors in specific localities - Collectors in matching state + locality",
          "Individual: Direct assignment to specific person - Only the assigned collector"
        ]
      },
      {
        title: "10.2 How Claiming Works",
        content: [
          "Open the Site Visits or My Sites page",
          "View available dispatched sites in your area",
          "Click 'Claim' on a site you want to visit",
          "The system instantly reserves the site for you",
          "Wait for acceptance (or auto-accept if enabled)",
          "Once accepted, the site appears in your assignments"
        ]
      },
      {
        title: "10.3 Claim Protection",
        content: [
          "Uses atomic database transactions (PostgreSQL RPC)",
          "Only one collector can claim each site",
          "Claims processed in order received",
          "Failed claims show immediate feedback",
          "No race conditions possible"
        ]
      },
      {
        title: "10.4 Fee Calculation at Claim Time",
        content: [
          "Your classification level (A, B, C) is checked",
          "The fee structure for your classification is applied",
          "Enumerator fee and transport fee are calculated",
          "Fees are locked in at claim time",
          "Upon completion, fees are credited to your wallet"
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
          "IndexedDB: Browser-based offline storage"
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
    { action: 'Manage wallets', roles: 'Admin, Super Admin' }
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
  doc.text('Version 2.1 | December 2025', pageWidth / 2, yPos, { align: 'center' });
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
        new TextRun({ text: "Version 2.1 | December 2025", size: 20 })
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
  doc.text('Version 2.1 | December 2025', pageWidth / 2, yPos, { align: 'center' });
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
        new TextRun({ text: "Version 2.1 | December 2025", size: 20 })
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
