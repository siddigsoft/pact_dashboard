import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Download, BookOpen, ListChecks, Loader2, Eye, ChevronRight } from 'lucide-react';
import { generateUserManualPDF, generateUserManualDOCX, generateWorkflowsPDF, generateWorkflowsDOCX } from '@/lib/docs-export';

const tableOfContents = [
  { id: 1, title: "Introduction", sections: ["What is PACT?", "Key Benefits", "System Requirements"] },
  { id: 2, title: "Complete System Workflow A to Z", sections: ["Phase 1: Setup & Planning", "Phase 2: MMP Lifecycle", "Phase 3: Dispatch & Claiming", "Phase 4: Field Operations", "Phase 5: Financial Processing", "Role Responsibilities Matrix"] },
  { id: 3, title: "Getting Started", sections: ["Account Registration", "Logging In", "Forgot Password", "First-Time Setup"] },
  { id: 4, title: "Dashboard Overview", sections: ["Dashboard Zones", "Quick Actions", "Notifications", "Live Mode Toggle"] },
  { id: 5, title: "User Management", sections: ["User Roles Overview", "User Classifications", "Viewing Users", "Managing User Status"] },
  { id: 6, title: "Role-Based Access Control", sections: ["Understanding Permissions", "Role Management", "Permission Templates"] },
  { id: 7, title: "Projects Management", sections: ["Creating a Project", "Project Details", "Managing Project Team", "Project Status"] },
  { id: 8, title: "Monthly Monitoring Plans (MMPs)", sections: ["Understanding MMPs", "MMP Upload - CSV Requirements", "MMP Workflow Stages", "MMP Verification", "Permit Management", "Dispatching Sites"] },
  { id: 9, title: "Site Visits", sections: ["Creating Site Visits", "Site Visit Status Flow", "Conducting Site Visits", "Completion Requirements"] },
  { id: 10, title: "First-Claim Dispatch System", sections: ["Dispatch Modes", "How Claiming Works", "Claim Protection", "Fee Calculation at Claim Time"] },
  { id: 11, title: "Classification & Fee Structure", sections: ["User Classifications", "Fee Structure", "Managing Classification Fees", "Fee Application"] },
  { id: 12, title: "Field Team Management", sections: ["Team Overview", "Team Member Status", "Location Tracking", "Nearest Enumerators", "Smart Assignment"] },
  { id: 13, title: "Financial Operations", sections: ["Financial Dashboard", "Transaction Types", "Two-Tier Approval Workflow", "Finance Processing Page"] },
  { id: 14, title: "Budget Management", sections: ["Creating Budgets", "Budget Tracking", "Budget Alerts"] },
  { id: 15, title: "Wallet System", sections: ["Understanding Wallets", "Wallet Dashboard", "Earning Payments", "Payment Breakdown", "Transaction History"] },
  { id: 16, title: "Cost Submission & Approvals", sections: ["Cost Submission Workflow", "Down Payment (Advance) System", "Final Payment (Automatic)", "Hub Supervisor Model"] },
  { id: 17, title: "Tracker Preparation Plan", sections: ["Overview", "Analysis Views", "Tracker Actions"] },
  { id: 18, title: "Reports & Analytics", sections: ["Available Reports", "Custom Reports", "Export Formats"] },
  { id: 19, title: "Communication Features", sections: ["Messaging", "Announcements"] },
  { id: 20, title: "Maps & Location Services", sections: ["Map Features", "Location Accuracy Display"] },
  { id: 21, title: "Sites Registry", sections: ["Understanding the Registry", "Site Management"] },
  { id: 22, title: "Archive Management", sections: ["Archiving Process", "Archive Access"] },
  { id: 23, title: "Calendar & Scheduling", sections: ["Calendar Views", "Scheduling"] },
  { id: 24, title: "Settings & Preferences", sections: ["User Settings", "System Settings (Admin)"] },
  { id: 25, title: "Notification System", sections: ["Notification Types", "Notification Settings", "Browser Push Notifications"] },
  { id: 26, title: "Mobile Application", sections: ["Key Features", "Installation", "Permissions Required", "Offline Mode", "Capacitor Plugins"] },
  { id: 27, title: "Troubleshooting", sections: ["Login Issues", "GPS Problems", "Sync Issues", "Common Error Messages"] },
  { id: 28, title: "Glossary", sections: ["Terms & Definitions"] }
];

const workflowSteps = [
  { phase: "Setup", step: "A", action: "System Configuration", who: "Admin/ICT", details: "Configure roles, fees, hubs, system settings" },
  { phase: "Setup", step: "B", action: "User Onboarding", who: "Admin/User", details: "Registration, verification, role & classification assignment" },
  { phase: "Setup", step: "C", action: "Project Creation", who: "Admin/ICT", details: "Create project, timeline, assign manager, build team" },
  { phase: "Setup", step: "D", action: "Budget Allocation", who: "Finance", details: "Create budget, link to project, set categories" },
  { phase: "MMP", step: "E", action: "MMP Upload", who: "Coordinator/ICT", details: "Prepare CSV, upload file, validate data, submit" },
  { phase: "MMP", step: "F", action: "MMP Review & Approval", who: "Reviewer/Admin", details: "Review, verify, check permits, approve, forward to FOM" },
  { phase: "MMP", step: "G", action: "Permit Management", who: "Coordinator", details: "Upload permit, enter details, verification, link to sites" },
  { phase: "Dispatch", step: "H", action: "Site Dispatch", who: "FOM", details: "Select sites, choose mode (Open/State/Locality/Individual), execute" },
  { phase: "Dispatch", step: "I", action: "Site Claiming", who: "Collector", details: "View available sites, select site, claim, atomic lock" },
  { phase: "Dispatch", step: "J", action: "Claim Acceptance", who: "FOM/System", details: "Review claim, accept, calculate fees based on classification" },
  { phase: "Field", step: "K", action: "Start Site Visit", who: "Collector", details: "Open assignment, travel to site, GPS auto-captured, start visit" },
  { phase: "Field", step: "L", action: "Data Collection", who: "Collector", details: "GPS capture, take photos, fill forms, local save (offline)" },
  { phase: "Field", step: "M", action: "Complete Visit", who: "Collector", details: "Review data, complete visit, sync to server, calculate payment" },
  { phase: "Field", step: "N", action: "Visit Verification", who: "Supervisor", details: "Review submission, verify location & photos, approve/reject" },
  { phase: "Finance", step: "O", action: "Wallet Credit", who: "System", details: "Automatic payment on completion, create transaction, update balance" },
  { phase: "Finance", step: "P", action: "Cost Submission", who: "Collector/Finance", details: "Submit expenses, attach receipts, supervisor & finance approval" },
  { phase: "Finance", step: "Q", action: "Tracker & Invoice", who: "Finance/FOM", details: "Access tracker, view analysis, export data, generate invoice" },
  { phase: "Finance", step: "R", action: "Reporting", who: "Any User", details: "Generate reports, set parameters, view dashboard, export" },
  { phase: "Closure", step: "S", action: "Archive & Close", who: "Admin", details: "Review completion, generate final report, archive MMP, close project" }
];

export default function PublicDocumentation() {
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [loadingDOCX, setLoadingDOCX] = useState(false);
  const [loadingWorkflowPDF, setLoadingWorkflowPDF] = useState(false);
  const [loadingWorkflowDOCX, setLoadingWorkflowDOCX] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const handleDownloadPDF = async () => {
    setLoadingPDF(true);
    try {
      generateUserManualPDF();
    } finally {
      setTimeout(() => setLoadingPDF(false), 1000);
    }
  };

  const handleDownloadDOCX = async () => {
    setLoadingDOCX(true);
    try {
      await generateUserManualDOCX();
    } finally {
      setTimeout(() => setLoadingDOCX(false), 1000);
    }
  };

  const handleDownloadWorkflowPDF = async () => {
    setLoadingWorkflowPDF(true);
    try {
      generateWorkflowsPDF();
    } finally {
      setTimeout(() => setLoadingWorkflowPDF(false), 1000);
    }
  };

  const handleDownloadWorkflowDOCX = async () => {
    setLoadingWorkflowDOCX(true);
    try {
      await generateWorkflowsDOCX();
    } finally {
      setTimeout(() => setLoadingWorkflowDOCX(false), 1000);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BookOpen className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            PACT Platform Documentation
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Comprehensive documentation for the PACT Workflow Platform - Field Operations Command Center
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Eye className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="contents" data-testid="tab-contents">
              <FileText className="h-4 w-4 mr-2" />
              Contents
            </TabsTrigger>
            <TabsTrigger value="workflows" data-testid="tab-workflows">
              <ListChecks className="h-4 w-4 mr-2" />
              Workflows
            </TabsTrigger>
            <TabsTrigger value="download" data-testid="tab-download">
              <Download className="h-4 w-4 mr-2" />
              Download
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>What is PACT?</CardTitle>
                  <CardDescription>Field Operations Management System</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    The PACT Workflow Platform is a comprehensive field operations management system designed to streamline:
                  </p>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Monthly Monitoring Plans (MMPs)</li>
                    <li className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Site visits and field data collection</li>
                    <li className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Field team coordination</li>
                    <li className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Financial tracking and approvals</li>
                    <li className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Real-time location sharing</li>
                    <li className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Role-based access control</li>
                    <li className="flex items-center gap-2"><ChevronRight className="h-4 w-4 text-primary" /> Mobile field operations with offline support</li>
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Key Benefits</CardTitle>
                  <CardDescription>Why use PACT Platform</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span className="font-medium text-sm">Streamlined Workflows</span>
                      <span className="text-xs text-muted-foreground">Automated approvals</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span className="font-medium text-sm">Real-Time Visibility</span>
                      <span className="text-xs text-muted-foreground">Live tracking</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span className="font-medium text-sm">Financial Control</span>
                      <span className="text-xs text-muted-foreground">Budget management</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span className="font-medium text-sm">Role-Based Security</span>
                      <span className="text-xs text-muted-foreground">Access control</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span className="font-medium text-sm">Mobile-Ready</span>
                      <span className="text-xs text-muted-foreground">Offline capable</span>
                    </div>
                    <div className="flex justify-between items-center p-2 bg-muted/50 rounded">
                      <span className="font-medium text-sm">Smart Dispatch</span>
                      <span className="text-xs text-muted-foreground">First-claim system</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>System Workflow Phases</CardTitle>
                  <CardDescription>The complete journey from setup to completion</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-4">
                    <div className="text-center p-4 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">1</div>
                      <div className="font-medium text-sm mt-2">Setup & Planning</div>
                      <div className="text-xs text-muted-foreground mt-1">System config, users, projects, budgets</div>
                    </div>
                    <div className="text-center p-4 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">2</div>
                      <div className="font-medium text-sm mt-2">MMP Lifecycle</div>
                      <div className="text-xs text-muted-foreground mt-1">Upload, review, approve, forward</div>
                    </div>
                    <div className="text-center p-4 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">3</div>
                      <div className="font-medium text-sm mt-2">Dispatch & Claiming</div>
                      <div className="text-xs text-muted-foreground mt-1">Dispatch sites, collectors claim</div>
                    </div>
                    <div className="text-center p-4 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">4</div>
                      <div className="font-medium text-sm mt-2">Field Operations</div>
                      <div className="text-xs text-muted-foreground mt-1">Visit sites, collect data, complete</div>
                    </div>
                    <div className="text-center p-4 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">5</div>
                      <div className="font-medium text-sm mt-2">Financial Processing</div>
                      <div className="text-xs text-muted-foreground mt-1">Payments, reports, archive</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="contents">
            <Card>
              <CardHeader>
                <CardTitle>Table of Contents</CardTitle>
                <CardDescription>28 comprehensive sections covering all platform features</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-4">
                    {tableOfContents.map((chapter) => (
                      <div key={chapter.id} className="border rounded-lg p-4">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                          <span className="bg-primary text-primary-foreground px-2 py-1 rounded text-sm">{chapter.id}</span>
                          {chapter.title}
                        </h3>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {chapter.sections.map((section, idx) => (
                            <span key={idx} className="text-xs bg-muted px-2 py-1 rounded">
                              {section}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workflows">
            <Card>
              <CardHeader>
                <CardTitle>Complete Workflow Steps (A to S)</CardTitle>
                <CardDescription>Step-by-step process from setup to closure</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-3 font-medium">Phase</th>
                          <th className="text-left p-3 font-medium">Step</th>
                          <th className="text-left p-3 font-medium">Action</th>
                          <th className="text-left p-3 font-medium">Who</th>
                          <th className="text-left p-3 font-medium">Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workflowSteps.map((step, idx) => (
                          <tr key={idx} className="border-b hover:bg-muted/50">
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                step.phase === 'Setup' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                step.phase === 'MMP' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                                step.phase === 'Dispatch' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                                step.phase === 'Field' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300' :
                                step.phase === 'Finance' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' :
                                'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300'
                              }`}>
                                {step.phase}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-bold">{step.step}</td>
                            <td className="p-3 font-medium">{step.action}</td>
                            <td className="p-3 text-muted-foreground">{step.who}</td>
                            <td className="p-3 text-muted-foreground">{step.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="download">
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-2 hover:border-primary/50 transition-colors">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                      <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>Complete User Manual</CardTitle>
                      <CardDescription>Full platform documentation</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Comprehensive guide with 28 sections covering all platform features including detailed tables, workflow diagrams, and step-by-step instructions.
                  </p>
                  <ul className="text-sm text-muted-foreground mb-6 space-y-1">
                    <li>- 28 detailed chapters</li>
                    <li>- Complete workflow reference (A-S)</li>
                    <li>- Role permissions matrix</li>
                    <li>- Fee calculation examples</li>
                    <li>- Troubleshooting guide</li>
                    <li>- Glossary of terms</li>
                  </ul>
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleDownloadPDF}
                      disabled={loadingPDF}
                      className="flex-1"
                      data-testid="button-download-manual-pdf"
                    >
                      {loadingPDF ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Download PDF
                    </Button>
                    <Button 
                      onClick={handleDownloadDOCX}
                      disabled={loadingDOCX}
                      variant="outline"
                      className="flex-1"
                      data-testid="button-download-manual-docx"
                    >
                      {loadingDOCX ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Download Word
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-2 hover:border-primary/50 transition-colors">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                      <ListChecks className="h-8 w-8 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <CardTitle>Workflows Reference</CardTitle>
                      <CardDescription>Step-by-step process guide</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Detailed workflow documentation with step-by-step instructions for all major processes from project setup to payment processing.
                  </p>
                  <ul className="text-sm text-muted-foreground mb-6 space-y-1">
                    <li>- 19 workflow steps (A-S)</li>
                    <li>- 5 phase breakdown</li>
                    <li>- Role assignments per step</li>
                    <li>- Status color guide</li>
                    <li>- Process flow diagrams</li>
                    <li>- Quick reference tables</li>
                  </ul>
                  <div className="flex gap-3">
                    <Button 
                      onClick={handleDownloadWorkflowPDF}
                      disabled={loadingWorkflowPDF}
                      className="flex-1"
                      data-testid="button-download-workflow-pdf"
                    >
                      {loadingWorkflowPDF ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Download PDF
                    </Button>
                    <Button 
                      onClick={handleDownloadWorkflowDOCX}
                      disabled={loadingWorkflowDOCX}
                      variant="outline"
                      className="flex-1"
                      data-testid="button-download-workflow-docx"
                    >
                      {loadingWorkflowDOCX ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      Download Word
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-8 text-center">
          <p className="text-sm text-muted-foreground">
            PACT Workflow Platform - Field Operations Command Center
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Version 2.1 | December 2025
          </p>
        </div>
      </div>
    </div>
  );
}
