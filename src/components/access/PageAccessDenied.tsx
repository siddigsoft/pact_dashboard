import { ShieldX, Lock, Home, ArrowLeft, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';

interface PageAccessDeniedProps {
  pageLabel?: string;
  reason?: 'blocked' | 'role';
}

const ROLE_LABELS: Record<string, string> = {
  superAdmin: 'Super Admin', admin: 'Admin', financialAdmin: 'Financial Admin',
  fom: 'Field Operations Manager', supervisor: 'Supervisor', coordinator: 'Coordinator',
  dataCollector: 'Data Collector', dataTeam: 'Data Team', auditor: 'Auditor',
  ict: 'ICT', projectManager: 'Project Manager', countryDirector: 'Country Director',
  reviewer: 'Reviewer',
};

export function PageAccessDenied({ pageLabel, reason = 'blocked' }: PageAccessDeniedProps) {
  const navigate = useNavigate();
  const { currentUser, effectiveCurrentUser } = useAppContext();

  const roleDisplay = effectiveCurrentUser?.role
    ? (ROLE_LABELS[effectiveCurrentUser.role] ?? effectiveCurrentUser.role)
    : 'Unknown';

  return (
    <div className="flex flex-col items-center justify-center min-h-[65vh] px-6 text-center select-none">

      {/* Icon */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center border-4 border-red-100 dark:border-red-900/50 shadow-inner">
          <ShieldX className="h-12 w-12 text-red-500 dark:text-red-400" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-white dark:bg-gray-900 border-2 border-red-200 dark:border-red-800 flex items-center justify-center shadow">
          <Lock className="h-4 w-4 text-red-500" />
        </div>
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-bold text-foreground mb-2">Access Restricted</h1>

      {/* Page label chip */}
      {pageLabel && (
        <div className="flex items-center gap-1.5 mb-3 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <Lock className="h-3 w-3 text-slate-500" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-wide uppercase">{pageLabel}</span>
        </div>
      )}

      {/* Description */}
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed mb-2">
        {reason === 'blocked'
          ? 'A system administrator has specifically blocked your access to this page.'
          : 'Your account role does not have permission to access this page.'}
      </p>

      {/* User info */}
      {currentUser && (
        <div className="flex items-center gap-2 mt-1 mb-6 px-3 py-2 rounded-xl bg-muted/40 border border-border/50 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{currentUser.full_name ?? currentUser.email ?? 'Unknown user'}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{roleDisplay}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={() => navigate(-1)}
          data-testid="btn-access-denied-back"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Go Back
        </Button>
        <Button
          onClick={() => navigate('/dashboard')}
          data-testid="btn-access-denied-dashboard"
          className="bg-[#0F2041] hover:bg-[#1D3461] text-white"
        >
          <Home className="h-4 w-4 mr-1.5" />
          Go to Dashboard
        </Button>
      </div>

      {/* Support note */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-8 max-w-xs leading-relaxed">
        <Mail className="h-3 w-3 shrink-0" />
        If you believe this is a mistake, ask your Super Admin to review your access in the Page Access Control settings.
      </p>
    </div>
  );
}
