import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, ChevronDown, Network, Check } from "lucide-react";
import { useAuthorization } from "@/hooks/useAuthorization";
import { useNavigate } from "react-router-dom";

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  fontFamily: "Inter, sans-serif",
  fontSize: 13,
  flowchart: { curve: "basis", padding: 20 },
  sequence: { actorMargin: 60, messageMargin: 40 },
  er: { useMaxWidth: true },
});

const DIAGRAMS: { id: string; label: string; color: string; code: string }[] = [
  {
    id: "approval-flow",
    label: "Approval Flow",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    code: `flowchart TD
  S([👤 Submitter]) -->|Creates request| DRAFT[Draft]
  DRAFT -->|Submit| T1

  subgraph T1G [Tier 1 · Supervisor]
    T1{Review}
  end
  T1 -->|✅ Approve| T2
  T1 -->|❌ Reject| REJ([Rejected])
  T1 -->|↩ Recall| DRAFT

  subgraph T2G [Tier 2 · FOM / Admin]
    T2{Review}
  end
  T2 -->|✅ Approve 2-tier| APP
  T2 -->|✅ Approve → 3 tiers| T3
  T2 -->|❌ Reject| REJ

  subgraph T3G [Tier 3 · Finance / Country Director]
    T3{Review}
  end
  T3 -->|✅ Approve 3-tier| APP
  T3 -->|✅ Approve → 4 tiers| T4
  T3 -->|❌ Reject| REJ

  subgraph T4G [Tier 4 · HQ / T4 Admin]
    T4{Review}
  end
  T4 -->|✅ Final Approve| APP
  T4 -->|❌ Reject| REJ

  APP([✅ Approved]) -->|Request Payment| PAY([💳 Payment Requested])
  PAY -->|Mark Paid| PAID([✅ Paid])
  PAID -->|Reconcile| REC([📋 Reconciled])

  style T1G fill:#dbeafe,stroke:#3b82f6
  style T2G fill:#fef3c7,stroke:#f59e0b
  style T3G fill:#d1fae5,stroke:#10b981
  style T4G fill:#ede9fe,stroke:#7c3aed
  style APP fill:#dcfce7,stroke:#16a34a,color:#166534
  style REJ fill:#fee2e2,stroke:#dc2626,color:#991b1b
  style PAID fill:#dcfce7,stroke:#16a34a
  style REC fill:#f0fdf4,stroke:#16a34a`,
  },
  {
    id: "system-architecture",
    label: "System Architecture",
    color: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
    code: `graph TB
  subgraph Client [🖥️ Client Layer]
    direction LR
    RN[React 18 + TypeScript]
    TWC[Tailwind + Shadcn UI]
    RQ[TanStack Query]
    RR[React Router v6]
    SW[Service Worker / PWA]
    IDB[(IndexedDB Offline)]
  end

  subgraph Supabase [☁️ Supabase Backend]
    direction LR
    AUTH[Auth + TOTP 2FA]
    PG[(PostgreSQL + RLS)]
    RT[Realtime Channels]
    EDGE[Edge Functions]
    STORE[File Storage]
  end

  subgraph Integrations [🔗 External Integrations]
    direction LR
    FCM[Firebase FCM Push]
    SMTP[IONOS SMTP Email]
    WA[WhatsApp / WaSender]
    MSFT[Microsoft Graph / Outlook]
    GEM[Gemini 2.0 Flash AI]
    GROQ[Groq AI / OCR]
  end

  subgraph Mobile [📱 Mobile Layer]
    FL[Flutter / Dart App]
    HIVE[(Hive Cache)]
    SHO[Shorebird OTA]
  end

  Client --> Supabase
  Mobile --> Supabase
  Supabase --> Integrations
  Client -.->|Push| FCM
  Mobile -.->|Push| FCM

  style Client fill:#dbeafe,stroke:#3b82f6
  style Supabase fill:#d1fae5,stroke:#10b981
  style Integrations fill:#fef3c7,stroke:#f59e0b
  style Mobile fill:#ede9fe,stroke:#7c3aed`,
  },
  {
    id: "er-diagram",
    label: "Data Model (ER)",
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    code: `erDiagram
  PROFILES {
    uuid id PK
    text full_name
    text role
    text defaultRole
    uuid organization_id FK
  }
  ORGANIZATIONS {
    uuid id PK
    text name
    text country
  }
  MMP_FILES {
    uuid id PK
    uuid organization_id FK
    text cycle
    text status
    date cycle_start
    date cycle_end
  }
  SITE_VISITS {
    uuid id PK
    uuid mmp_file_id FK
    uuid coordinator_id FK
    text status
    timestamp visit_date
    text location
  }
  OPERATIONAL_COSTS {
    uuid id PK
    uuid submitter_id FK
    text category
    numeric amount
    text currency
    text tier1_status
    text tier2_status
    text tier3_status
    text tier4_status
  }
  HR_PAYROLL {
    uuid id PK
    uuid staff_id FK
    numeric gross_salary
    numeric net_salary
    date pay_period
    text status
  }
  PROJECTS {
    uuid id PK
    text title
    text type
    text health_score
    text status
    uuid owner_id FK
  }
  NOTIFICATIONS {
    uuid id PK
    uuid recipient_id FK
    text event_type
    text channel
    boolean is_read
    timestamp created_at
  }

  ORGANIZATIONS ||--o{ PROFILES : "employs"
  PROFILES ||--o{ SITE_VISITS : "conducts"
  PROFILES ||--o{ OPERATIONAL_COSTS : "submits"
  PROFILES ||--o{ HR_PAYROLL : "receives"
  PROFILES ||--o{ PROJECTS : "owns"
  PROFILES ||--o{ NOTIFICATIONS : "receives"
  MMP_FILES ||--o{ SITE_VISITS : "contains"
  ORGANIZATIONS ||--o{ MMP_FILES : "has"`,
  },
  {
    id: "user-roles",
    label: "User Roles & Permissions",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    code: `graph TD
  SA([🛡️ Super Admin]) -->|Full Access| ALL[All Modules]

  Admin([👔 Admin]) --> COST[Cost Submission]
  Admin --> MMP2[MMP Management]
  Admin --> HR[HR & Payroll]
  Admin --> FIN[Finance Hub]
  Admin --> PROJ[Projects]
  Admin --> USERS[User Management]

  FOM([📊 FOM]) --> MMP2
  FOM --> COST
  FOM --> PROJ
  FOM --> RPTS[Reports]

  SUP([👷 Supervisor]) --> COST
  SUP --> VISITS[Site Visits]
  SUP --> MMP2

  CD([🌍 Country Director]) --> COST
  CD --> PROJ
  CD --> RPTS

  FA([💰 Financial Admin]) --> FIN
  FA --> COST
  FA --> RPTS

  DC([📍 Data Collector]) --> VISITS
  DC --> SURV[Surveys]

  EMP([👤 Employee]) --> TASKS[My Tasks]
  EMP --> LEAVE[Leave Requests]
  EMP --> PAYSLIP[My Payslips]

  style SA fill:#fef9c3,stroke:#ca8a04,color:#713f12
  style ALL fill:#dcfce7,stroke:#16a34a
  style Admin fill:#dbeafe,stroke:#3b82f6
  style FOM fill:#ede9fe,stroke:#7c3aed
  style SUP fill:#fce7f3,stroke:#db2777
  style CD fill:#ffedd5,stroke:#ea580c
  style FA fill:#d1fae5,stroke:#10b981
  style DC fill:#e0f2fe,stroke:#0284c7
  style EMP fill:#f1f5f9,stroke:#64748b`,
  },
  {
    id: "mmp-workflow",
    label: "MMP / Site Visit Workflow",
    color: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
    code: `flowchart TD
  PLAN[📋 Plan MMP Cycle] --> UPLOAD[Upload MMP File]
  UPLOAD --> VERIFY{Verify Coverage}
  VERIFY -->|All sites assigned| ACTIVE[Cycle Active]
  VERIFY -->|Gaps found| FLAG[⚠️ Auto-flag Uncovered Sites]
  FLAG --> ASSIGN[Assign Coordinator]
  ASSIGN --> ACTIVE

  ACTIVE --> VISIT[📍 Conduct Site Visit]
  VISIT --> GPS{GPS Proximity Check}
  GPS -->|Within range| SUBMIT[Submit Visit Data]
  GPS -->|Out of range| WARN[Show Warning · Allow Override]
  WARN --> SUBMIT

  SUBMIT --> T1V{Tier 1 Verify}
  T1V -->|✅ Verified| T2V{Tier 2 Verify}
  T1V -->|Recall| VISIT
  T2V -->|✅ Final Verify| COMPLETE[✅ Visit Complete]
  T2V -->|Recall| VISIT

  COMPLETE --> COVERAGE{All Sites Done?}
  COVERAGE -->|Yes| CLOSE[🔒 Cycle Close Approval]
  COVERAGE -->|No| ACTIVE

  CLOSE --> ARCHIVE[📦 Archive Cycle]
  CLOSE --> COMPARE[Cycle Comparison Report]

  style ACTIVE fill:#d1fae5,stroke:#10b981
  style COMPLETE fill:#dcfce7,stroke:#16a34a
  style FLAG fill:#fff7ed,stroke:#ea580c
  style WARN fill:#fef3c7,stroke:#d97706
  style ARCHIVE fill:#f1f5f9,stroke:#64748b`,
  },
  {
    id: "cost-lifecycle",
    label: "Cost Submission Lifecycle",
    color: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
    code: `stateDiagram-v2
  [*] --> Draft : Staff creates request
  Draft --> Submitted : Submit
  Draft --> [*] : Delete

  Submitted --> InReviewT1 : Tier 1 picks up
  InReviewT1 --> Draft : Recall by submitter
  InReviewT1 --> Rejected : Tier 1 rejects
  InReviewT1 --> InReviewT2 : Tier 1 approves

  InReviewT2 --> Rejected : Tier 2 rejects
  InReviewT2 --> Approved : Tier 2 approves (2-tier)
  InReviewT2 --> InReviewT3 : Tier 2 approves (3-tier)

  InReviewT3 --> Rejected : Tier 3 rejects
  InReviewT3 --> Approved : Tier 3 approves (3-tier)
  InReviewT3 --> InReviewT4 : Tier 3 approves (4-tier)

  InReviewT4 --> Rejected : Tier 4 rejects
  InReviewT4 --> Approved : Tier 4 approves

  Approved --> PaymentRequested : Request Payment
  PaymentRequested --> Paid : Mark as Paid
  Paid --> Reconciled : Reconcile

  Rejected --> Draft : Resubmit
  Rejected --> [*] : Delete`,
  },
  {
    id: "hr-payroll",
    label: "HR & Payroll Flow",
    color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
    code: `flowchart TD
  HIRE[👤 Hire Staff / Create Profile] --> CONTRACT[Set Salary & Contract]
  CONTRACT --> LEAVES[Configure Leave Balances]

  subgraph Monthly [📅 Monthly Cycle]
    direction LR
    ATT[Attendance / Timesheet] --> DEDUCT[Calculate Deductions]
    ADV[Salary Advances] --> DEDUCT
    DEDUCT --> GROSS[Gross Salary Calc]
    GROSS --> NET[Net Salary]
  end

  LEAVES --> Monthly
  CONTRACT --> Monthly

  NET --> APPROVE{Manager Approve}
  APPROVE -->|✅ Approved| PAYSLIP[Generate Payslip PDF]
  APPROVE -->|❌ Revise| Monthly

  PAYSLIP --> BANK[Bank Transfer / Journal Entry]
  BANK --> GL[GL Bridge → Journal Posted]

  subgraph EOSB [🏁 End of Service]
    CALC[Calculate Gratuity]
    CALC -->|≤ 5 yrs: 21d/yr| G21[Basic Formula]
    CALC -->|> 5 yrs: 30d/yr| G30[Enhanced Formula]
    G21 --> XLSX[Export XLSX]
    G30 --> XLSX
  end

  CONTRACT -.-> EOSB

  style Monthly fill:#dbeafe,stroke:#3b82f6
  style EOSB fill:#fef3c7,stroke:#f59e0b
  style PAYSLIP fill:#d1fae5,stroke:#10b981
  style GL fill:#ede9fe,stroke:#7c3aed`,
  },
  {
    id: "notification-pipeline",
    label: "Notification Pipeline",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    code: `flowchart LR
  EVENT[⚡ System Event\n60+ types] --> ROUTER{Notification\nRouter}

  ROUTER -->|In-app| INAPP[🔔 In-App Bell\n+ Pending Actions Tab]
  ROUTER -->|Email opted-in| SMTP[📧 IONOS SMTP\nEmail]
  ROUTER -->|WhatsApp opted-in| WA[💬 WhatsApp\nWaSender API]
  ROUTER -->|Push enabled| FCM[📱 Firebase FCM\nPush Notification]

  INAPP --> BUNDLE{Bundle\nSimilar Events?}
  BUNDLE -->|Yes| BUNDLED[Bundled Notification]
  BUNDLE -->|No| SINGLE[Single Notification]

  SMTP --> TRACK[Delivery Log]
  WA --> TRACK
  FCM --> TRACK

  TRACK --> ESC{Escalation\nCheck\nEdge Fn}
  ESC -->|Overdue > threshold| ESCALATE[📢 Escalate to Manager]
  ESC -->|OK| DONE[✅ Delivered]

  subgraph Admin [Admin Controls]
    BC[Broadcast Center]
    ANA[Analytics Tab]
    CAT[Category Chips]
  end

  ROUTER -.-> Admin

  style EVENT fill:#fef3c7,stroke:#f59e0b
  style INAPP fill:#dbeafe,stroke:#3b82f6
  style SMTP fill:#d1fae5,stroke:#10b981
  style WA fill:#dcfce7,stroke:#25d366
  style FCM fill:#fce7f3,stroke:#db2777
  style ESCALATE fill:#fee2e2,stroke:#dc2626`,
  },
  {
    id: "project-flow",
    label: "Project Flow Engine",
    color: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    code: `flowchart TD
  CREATE[📁 Create Project\n10 Type Templates] --> STAGES[Define Stages\n+ Custom Stages]
  STAGES --> TASKS[Add Field Tasks\nGantt + Dependencies]
  TASKS --> ACTIVE[🟢 Project Active]

  ACTIVE --> HEALTH{Health Score\nCalculation}
  HEALTH -->|Green 80-100| OK[On Track]
  HEALTH -->|Amber 50-79| WARN[⚠️ Stalled Alert]
  HEALTH -->|Red < 50| CRIT[🚨 Critical]

  ACTIVE --> MILESTONE[🏁 Milestone Tracking]
  MILESTONE --> GRANT[Grant Tracking\n+ Expense Entry]
  GRANT --> ALLOC[Cost Allocation\nEngine → GL Journal]

  ACTIVE --> PROGRESS[📊 Progressive Output\nTracking w/ Proof Uploads]

  ACTIVE --> PORTFOLIO[📈 Portfolio Dashboard\nDirector View]
  PORTFOLIO --> KPI[KPI Cards + Health Matrix]
  PORTFOLIO --> ANALYTICS[Cross-Project Analytics\nBudget Utilization]

  ACTIVE --> CLOSE[Archive / Close]
  CLOSE --> PDF[Export PDF Report]

  subgraph Approval [Approval Gates]
    direction LR
    PAG[Stage Advance\nApproval]
    CYC[Cycle Close\nApproval]
  end

  STAGES -.-> Approval

  style ACTIVE fill:#d1fae5,stroke:#10b981
  style CRIT fill:#fee2e2,stroke:#dc2626
  style WARN fill:#fef3c7,stroke:#f59e0b
  style PORTFOLIO fill:#dbeafe,stroke:#3b82f6
  style Approval fill:#ede9fe,stroke:#7c3aed`,
  },
];

function DiagramBlock({ id, code }: { id: string; code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [showCode, setShowCode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const uniqueId = `mermaid-${id}-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(uniqueId, code);
        if (!cancelled) setSvg(rendered);
      } catch (e: unknown) {
        if (!cancelled) setError(String(e));
      }
    };
    render();
    return () => { cancelled = true; };
  }, [id, code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pact-${id}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => setShowCode(v => !v)} className="gap-1.5 text-xs h-8">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showCode ? "rotate-180" : ""}`} />
          {showCode ? "Hide" : "View"} Code
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5 text-xs h-8">
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownload} disabled={!svg} className="gap-1.5 text-xs h-8">
          <Download className="h-3.5 w-3.5" />SVG
        </Button>
      </div>

      {showCode && (
        <pre className="bg-gray-950 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto leading-relaxed border border-gray-800 max-h-72 overflow-y-auto">
          {code}
        </pre>
      )}

      <div
        ref={ref}
        className="rounded-xl border border-border bg-white dark:bg-gray-950 p-4 overflow-x-auto min-h-[200px] flex items-center justify-center"
      >
        {error ? (
          <p className="text-sm text-red-500">Render error: {error}</p>
        ) : svg ? (
          <div dangerouslySetInnerHTML={{ __html: svg }} className="max-w-full" />
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Rendering diagram…
          </div>
        )}
      </div>
    </div>
  );
}

export default function SystemDiagrams() {
  const { isSuperAdmin } = useAuthorization();
  const navigate = useNavigate();
  const [active, setActive] = useState(DIAGRAMS[0].id);

  if (!isSuperAdmin()) {
    navigate("/dashboard");
    return null;
  }

  const current = DIAGRAMS.find(d => d.id === active)!;

  return (
    <div className="flex flex-col h-full min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-white dark:bg-gray-950 px-6 py-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
          <Network className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">System Diagrams</h1>
          <p className="text-xs text-muted-foreground">Architecture, workflows and data models · Super Admin only</p>
        </div>
        <Badge variant="outline" className="ml-auto text-[10px] bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-400">
          Super Admin Only
        </Badge>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar tabs */}
        <nav className="w-56 shrink-0 border-r bg-gray-50/60 dark:bg-gray-900/40 py-3 flex flex-col gap-0.5 px-2">
          {DIAGRAMS.map(d => (
            <button
              key={d.id}
              onClick={() => setActive(d.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active === d.id
                  ? "bg-white dark:bg-gray-800 shadow-sm border border-border text-foreground"
                  : "text-muted-foreground hover:bg-white/70 dark:hover:bg-gray-800/60 hover:text-foreground"
              }`}
            >
              <span className={`inline-flex items-center gap-2`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${active === d.id ? "bg-violet-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                {d.label}
              </span>
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 mb-5">
              <Badge className={current.color + " text-xs font-semibold px-2.5 py-0.5 rounded-full border-0"}>
                {current.label}
              </Badge>
            </div>
            <DiagramBlock key={current.id} id={current.id} code={current.code} />
          </div>
        </main>
      </div>
    </div>
  );
}
