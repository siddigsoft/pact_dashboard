import { Info, ChevronDown, ArrowRight, Languages } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface WorkflowStep {
  step: number;
  role: string;
  action: string;
  description: string;
}

interface PageInfoBannerProps {
  title: string;
  description: string;
  descriptionAr?: string;
  workflowSteps?: WorkflowStep[];
  workflowStepsAr?: WorkflowStep[];
  defaultOpen?: boolean;
}

const roleColors: Record<string, string> = {
  'Field Staff': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'Data Collector': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'Supervisor': 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  'FOM': 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300',
  'Admin': 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  'Finance Admin': 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  'Super Admin': 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  'System': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
  'موظف ميداني': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'جامع بيانات': 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
  'المشرف': 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  'المدير': 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  'مدير المالية': 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
  'المشرف والمدير': 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
  'النظام': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
};

const getRoleColor = (role: string) => {
  return roleColors[role] || 'bg-muted text-muted-foreground';
};

function WorkflowStepsSection({ steps, label, isRtl = false }: { steps: WorkflowStep[]; label: string; isRtl?: boolean }) {
  return (
    <div className="space-y-2" data-testid="workflow-steps">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" dir={isRtl ? 'rtl' : 'ltr'}>
        {label}
      </p>
      <div className="space-y-1.5">
        {steps.map((step, idx) => (
          <div key={step.step} className={`flex items-start gap-2 ${isRtl ? 'flex-row-reverse text-right' : ''}`} data-testid={`workflow-step-${step.step}`}>
            <div className={`flex items-center gap-1.5 shrink-0 mt-0.5 ${isRtl ? 'flex-row-reverse' : ''}`}>
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-600 dark:bg-blue-500 text-white text-[10px] font-bold">
                {step.step}
              </span>
              {idx < steps.length - 1 && (
                <ArrowRight className={`h-3 w-3 text-muted-foreground hidden sm:block ${isRtl ? 'rotate-180' : ''}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`flex items-center gap-1.5 flex-wrap ${isRtl ? 'flex-row-reverse' : ''}`}>
                <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${getRoleColor(step.role)}`}>
                  {step.role}
                </Badge>
                <span className="text-xs font-medium text-foreground">{step.action}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug" dir={isRtl ? 'rtl' : 'ltr'}>{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageInfoBanner({ title, description, descriptionAr, workflowSteps, workflowStepsAr, defaultOpen = false }: PageInfoBannerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const hasArabic = !!descriptionAr;

  return (
    <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 mb-4" data-testid="page-info-banner">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button 
            className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-blue-100/50 dark:hover:bg-blue-900/30 rounded-md transition-colors"
            data-testid="button-toggle-page-info"
          >
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300 flex-1">
              What does this page do? {hasArabic && <span className="text-blue-500 dark:text-blue-400">/ ماذا تفعل هذه الصفحة؟</span>}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-blue-600 dark:text-blue-400 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 space-y-3">
            <div data-testid="section-english">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">English</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-page-description">
                {description}
              </p>
              {workflowSteps && workflowSteps.length > 0 && (
                <div className="mt-3">
                  <WorkflowStepsSection steps={workflowSteps} label="Who does what - Step by step" />
                </div>
              )}
            </div>

            {hasArabic && (
              <div className="border-t border-blue-200/50 dark:border-blue-800/50 pt-3" data-testid="section-arabic">
                <div className="flex items-center gap-1.5 mb-1.5" dir="rtl">
                  <Languages className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">العربية</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed" dir="rtl" data-testid="text-page-description-ar">
                  {descriptionAr}
                </p>
                {workflowStepsAr && workflowStepsAr.length > 0 && (
                  <div className="mt-3">
                    <WorkflowStepsSection steps={workflowStepsAr} label="من يفعل ماذا - خطوة بخطوة" isRtl />
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
