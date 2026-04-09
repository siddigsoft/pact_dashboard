import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  LayoutDashboard, Database, Receipt, CreditCard, FolderKanban,
  ClipboardList, ClipboardCheck, Users, Shield, BarChart3,
  ChevronRight, ChevronLeft, X, Sparkles, MapPin
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface WalkthroughStep {
  title: string;
  description: string;
  icon: React.ElementType;
  path: string;
  tip: string;
}

const ROLE_STEPS: Record<string, WalkthroughStep[]> = {
  dataCollector: [
    { title: "My Sites Management", description: "View and manage all monitoring sites assigned to you. Track visit status and upcoming schedules.", icon: Database, path: "/mmp", tip: "Start here every day to see your assigned sites." },
    { title: "Cost Submission", description: "Submit your daily operational costs and transport allowances for reimbursement.", icon: Receipt, path: "/cost-submission", tip: "Submit costs within 48 hours of incurring them." },
    { title: "My Wallet", description: "View your approved advances and track payment history.", icon: CreditCard, path: "/wallet", tip: "Check here after cost submissions are approved." },
    { title: "Notifications", description: "Stay up-to-date with approvals, rejections, and important system alerts.", icon: ClipboardList, path: "/notifications", tip: "Check notifications daily for any pending actions." },
  ],
  coordinator: [
    { title: "My Sites Management", description: "Oversee all sites in your area and coordinate data collection teams.", icon: Database, path: "/mmp", tip: "Use this to assign sites and monitor progress." },
    { title: "Site Verification", description: "Review and verify data submitted by field teams for accuracy.", icon: ClipboardCheck, path: "/coordinator/sites", tip: "Verification should happen within 24 hours of submission." },
    { title: "Cost Submission", description: "Submit operational costs and review team expense reports.", icon: Receipt, path: "/cost-submission", tip: "Coordinate team submissions at the end of each week." },
    { title: "My Wallet", description: "Track your advances and payment history.", icon: CreditCard, path: "/wallet", tip: "Monitor your wallet balance and pending transactions." },
  ],
  supervisor: [
    { title: "Dashboard", description: "Get a full overview of your team's performance, pending approvals, and key metrics.", icon: LayoutDashboard, path: "/dashboard", tip: "Review the dashboard every morning for daily briefing." },
    { title: "My Site Management", description: "Manage sites under your supervision and track monitoring activities.", icon: MapPin, path: "/supervisor/sites", tip: "Assign sites to coordinators and data collectors here." },
    { title: "Tier 1 Approvals", description: "Review and approve cost submissions from your field teams.", icon: ClipboardCheck, path: "/supervisor-approvals", tip: "Process approvals within 24 hours to avoid delays." },
    { title: "My Wallet", description: "Track your own advances and reimbursements.", icon: CreditCard, path: "/wallet", tip: "Keep your wallet reconciled monthly." },
  ],
  projectManager: [
    { title: "Projects", description: "Manage all your projects, timelines, activities, and team assignments.", icon: FolderKanban, path: "/projects", tip: "Check project status and deadlines regularly." },
    { title: "Portfolio Dashboard", description: "Get a high-level overview of all projects across your portfolio.", icon: BarChart3, path: "/portfolio", tip: "Use portfolio view for strategic planning sessions." },
    { title: "Approvals Queue", description: "Review and approve project-related submissions and requests.", icon: ClipboardCheck, path: "/dashboard?tab=approvals", tip: "Process approvals promptly to keep projects on track." },
    { title: "MMP Management", description: "Oversee Monitoring and Management Plans for your projects.", icon: Database, path: "/mmp", tip: "Keep MMPs updated as project scope changes." },
  ],
  admin: [
    { title: "Dashboard", description: "System-wide overview of operations, user activity, and key performance indicators.", icon: LayoutDashboard, path: "/dashboard", tip: "Review the dashboard daily for operational overview." },
    { title: "User Management", description: "Manage all system users, approve registrations, and assign roles.", icon: Users, path: "/users", tip: "Review pending user activations regularly." },
    { title: "Role Management", description: "Configure roles and permissions for your organization.", icon: Shield, path: "/role-management", tip: "Review role permissions when onboarding new staff types." },
    { title: "Projects", description: "Oversee all projects and ensure smooth execution.", icon: FolderKanban, path: "/projects", tip: "Set up projects as soon as contracts are signed." },
  ],
  fom: [
    { title: "Dashboard", description: "Field operations overview — site visits, team activity, and financial summaries.", icon: LayoutDashboard, path: "/dashboard", tip: "Start each morning with the dashboard." },
    { title: "Field Team", description: "Monitor and manage your field operations team.", icon: Users, path: "/field-team", tip: "Use this to track team availability and assignments." },
    { title: "MMP Management", description: "Plan and manage Monitoring and Management Plans.", icon: Database, path: "/mmp", tip: "Keep MMPs current with field conditions." },
    { title: "Finance Processing", description: "Review and process financial approvals for field operations.", icon: ClipboardCheck, path: "/finance-approval", tip: "Process financial approvals daily." },
  ],
};

const getStepsForRole = (role: string): WalkthroughStep[] => {
  const normalized = role.toLowerCase().replace(/[\s_-]/g, '');
  if (normalized.includes('datacollector')) return ROLE_STEPS.dataCollector;
  if (normalized.includes('coordinator')) return ROLE_STEPS.coordinator;
  if (normalized.includes('supervisor')) return ROLE_STEPS.supervisor;
  if (normalized.includes('projectmanager')) return ROLE_STEPS.projectManager;
  if (normalized.includes('admin')) return ROLE_STEPS.admin;
  if (normalized.includes('fom') || normalized.includes('fieldoperation')) return ROLE_STEPS.fom;
  return ROLE_STEPS.admin;
};

interface WelcomeWalkthroughProps {
  userId: string;
  userName: string;
  userRole: string;
  open: boolean;
  onClose: () => void;
}

export const WelcomeWalkthrough = ({ userId, userName, userRole, open, onClose }: WelcomeWalkthroughProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const steps = getStepsForRole(userRole);
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleClose = () => {
    localStorage.setItem(`walkthrough_completed_${userId}`, 'true');
    onClose();
  };

  const handleNavigate = () => {
    navigate(steps[currentStep].path);
    handleClose();
  };

  const Step = steps[currentStep];
  const StepIcon = Step?.icon;

  if (!Step) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-walkthrough">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="gap-1 text-xs">
              <Sparkles className="h-3 w-3" />
              Welcome to PACT
            </Badge>
            <span className="text-xs text-muted-foreground">{currentStep + 1} of {steps.length}</span>
          </div>
          <DialogTitle className="text-lg mt-3">
            Hello, {userName.split(' ')[0]}! 👋
          </DialogTitle>
          <DialogDescription>
            Here's a quick tour of the key pages for your role
          </DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="h-1.5" />

        <div className="py-4 space-y-4">
          <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <StepIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-base">{Step.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{Step.description}</p>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200"><strong>Tip:</strong> {Step.tip}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {currentStep > 0 && (
            <Button variant="outline" size="sm" onClick={() => setCurrentStep(s => s - 1)} data-testid="button-walkthrough-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="sm" className="flex-1" onClick={handleNavigate} data-testid="button-walkthrough-go">
            Go to {Step.title}
          </Button>
          {currentStep < steps.length - 1 ? (
            <Button size="sm" onClick={() => setCurrentStep(s => s + 1)} data-testid="button-walkthrough-next">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleClose} data-testid="button-walkthrough-finish">
              Done
            </Button>
          )}
        </div>

        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-walkthrough-close"
        >
          <X className="h-4 w-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
};

export const useWalkthrough = (userId: string | undefined, userRole: string | undefined) => {
  const [showWalkthrough, setShowWalkthrough] = useState(false);

  useEffect(() => {
    if (!userId || !userRole) return;
    const completed = localStorage.getItem(`walkthrough_completed_${userId}`);
    const firstLogin = localStorage.getItem(`first_login_${userId}`);
    if (!completed && firstLogin === 'true') {
      setShowWalkthrough(true);
    }
  }, [userId, userRole]);

  const dismissWalkthrough = () => setShowWalkthrough(false);

  return { showWalkthrough, setShowWalkthrough, dismissWalkthrough };
};
