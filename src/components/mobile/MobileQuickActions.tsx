import { useNavigate } from 'react-router-dom';
import { 
  MapPin, 
  Plus, 
  FileText, 
  Camera, 
  Clock, 
  Users,
  Wallet,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { hapticPresets } from '@/lib/haptics';

interface QuickAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  description?: string;
  route?: string;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'destructive';
}

interface MobileQuickActionsProps {
  className?: string;
  actions?: QuickAction[];
  columns?: 2 | 3 | 4;
}

const DEFAULT_ACTIONS: QuickAction[] = [
  {
    id: 'start-visit',
    icon: <MapPin className="w-5 h-5" />,
    label: 'Start Visit',
    description: 'Begin a site visit',
    route: '/site-visits',
    variant: 'primary',
  },
  {
    id: 'new-report',
    icon: <FileText className="w-5 h-5" />,
    label: 'New Report',
    description: 'Create a report',
    route: '/reports/new',
  },
  {
    id: 'take-photo',
    icon: <Camera className="w-5 h-5" />,
    label: 'Photo',
    description: 'Capture evidence',
    route: '/camera',
  },
  {
    id: 'time-log',
    icon: <Clock className="w-5 h-5" />,
    label: 'Time Log',
    description: 'Log work hours',
    route: '/timesheet',
  },
];

export function MobileQuickActions({ 
  className,
  actions = DEFAULT_ACTIONS,
  columns = 4
}: MobileQuickActionsProps) {
  const navigate = useNavigate();

  const handleAction = (action: QuickAction) => {
    hapticPresets.buttonPress();
    if (action.onClick) {
      action.onClick();
    } else if (action.route) {
      navigate(action.route);
    }
  };

  return (
    <div 
      className={cn(
        "grid gap-2",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-4",
        className
      )}
      data-testid="quick-actions-widget"
    >
      {actions.map((action) => (
        <Button
          key={action.id}
          variant={action.variant === 'primary' ? 'default' : 'ghost'}
          className={cn(
            "flex flex-col items-center justify-center gap-1 h-auto py-3 px-2",
            "rounded-2xl",
            action.variant === 'primary' && "bg-black text-white dark:bg-white dark:text-black",
            action.variant === 'destructive' && "bg-red-500 text-white"
          )}
          onClick={() => handleAction(action)}
          data-testid={`button-quick-${action.id}`}
          aria-label={action.description || action.label}
        >
          {action.icon}
          <span className="text-xs font-medium truncate w-full text-center">
            {action.label}
          </span>
        </Button>
      ))}
    </div>
  );
}

interface FloatingActionButtonProps {
  icon?: React.ReactNode;
  label?: string;
  onClick?: () => void;
  route?: string;
  className?: string;
}

export function FloatingActionButton({
  icon = <Plus className="w-6 h-6" />,
  label = 'Add',
  onClick,
  route,
  className
}: FloatingActionButtonProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    hapticPresets.buttonPress();
    if (onClick) {
      onClick();
    } else if (route) {
      navigate(route);
    }
  };

  return (
    <Button
      size="lg"
      className={cn(
        "fixed bottom-20 right-4 z-40",
        "h-14 w-14 rounded-full shadow-lg",
        "bg-black text-white dark:bg-white dark:text-black",
        className
      )}
      onClick={handleClick}
      data-testid="button-fab"
      aria-label={label}
    >
      {icon}
    </Button>
  );
}

export function QuickActionCard({
  icon,
  label,
  value,
  trend,
  onClick,
  className
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: 'up' | 'down' | 'neutral';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "flex flex-col items-start gap-2 p-4",
        "bg-white dark:bg-black border border-black/10 dark:border-white/10",
        "rounded-2xl text-left transition-all",
        "hover:border-black/20 dark:hover:border-white/20",
        className
      )}
      onClick={() => {
        hapticPresets.buttonPress();
        onClick?.();
      }}
      data-testid={`card-${label.toLowerCase().replace(/\s+/g, '-')}`}
      aria-label={`${label}: ${value}`}
    >
      <div className="flex items-center gap-2 text-black/60 dark:text-white/60">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-2xl font-bold text-black dark:text-white">
        {value}
      </div>
      {trend && (
        <div className={cn(
          "text-xs font-medium",
          trend === 'up' && "text-green-600",
          trend === 'down' && "text-red-600",
          trend === 'neutral' && "text-gray-500"
        )}>
          {trend === 'up' && '+'}
          {trend === 'down' && '-'}
        </div>
      )}
    </button>
  );
}
