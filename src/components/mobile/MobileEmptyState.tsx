import { 
  Inbox, 
  Search, 
  MapPin, 
  Bell, 
  Wallet, 
  FileText, 
  Users, 
  Calendar,
  WifiOff,
  RefreshCw,
  Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import PactLogo from '@/assets/logo.png';

type EmptyStateVariant = 
  | 'default' 
  | 'search' 
  | 'sites' 
  | 'notifications' 
  | 'wallet' 
  | 'documents' 
  | 'team' 
  | 'calendar'
  | 'offline'
  | 'error';

interface MobileEmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  showLogo?: boolean;
  className?: string;
}

const variantConfig: Record<EmptyStateVariant, { icon: React.ReactNode; title: string; description: string }> = {
  default: {
    icon: <Inbox className="h-12 w-12" />,
    title: 'Nothing here yet',
    description: 'Items will appear here when available',
  },
  search: {
    icon: <Search className="h-12 w-12" />,
    title: 'No results found',
    description: 'Try adjusting your search or filters',
  },
  sites: {
    icon: <MapPin className="h-12 w-12" />,
    title: 'No sites assigned',
    description: 'Sites will appear here when assigned to you',
  },
  notifications: {
    icon: <Bell className="h-12 w-12" />,
    title: 'All caught up!',
    description: 'You have no new notifications',
  },
  wallet: {
    icon: <Wallet className="h-12 w-12" />,
    title: 'No transactions',
    description: 'Your wallet activity will appear here',
  },
  documents: {
    icon: <FileText className="h-12 w-12" />,
    title: 'No documents',
    description: 'Documents you create will appear here',
  },
  team: {
    icon: <Users className="h-12 w-12" />,
    title: 'No team members',
    description: 'Team members will appear here when assigned',
  },
  calendar: {
    icon: <Calendar className="h-12 w-12" />,
    title: 'No scheduled visits',
    description: 'Your upcoming visits will appear here',
  },
  offline: {
    icon: <WifiOff className="h-12 w-12" />,
    title: 'You are offline',
    description: 'Connect to the internet to see the latest data',
  },
  error: {
    icon: <RefreshCw className="h-12 w-12" />,
    title: 'Something went wrong',
    description: 'We could not load the data. Please try again.',
  },
};

export function MobileEmptyState({
  variant = 'default',
  title,
  description,
  icon,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  showLogo = false,
  className,
}: MobileEmptyStateProps) {
  const config = variantConfig[variant];

  const handleAction = () => {
    hapticPresets.buttonPress();
    onAction?.();
  };

  const handleSecondaryAction = () => {
    hapticPresets.buttonPress();
    onSecondaryAction?.();
  };

  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center py-16 px-6 text-center",
        className
      )}
      data-testid={`empty-state-${variant}`}
    >
      {showLogo ? (
        <div className="w-20 h-20 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-6">
          <img 
            src={PactLogo} 
            alt="PACT" 
            className="w-12 h-12 object-contain opacity-50"
          />
        </div>
      ) : (
        <div className="w-20 h-20 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-6 text-black/30 dark:text-white/30">
          {icon || config.icon}
        </div>
      )}

      <h3 className="text-lg font-bold text-black dark:text-white mb-2">
        {title || config.title}
      </h3>
      
      <p className="text-sm text-black/60 dark:text-white/60 max-w-xs mb-6">
        {description || config.description}
      </p>

      {(actionLabel || secondaryActionLabel) && (
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {actionLabel && onAction && (
            <Button
              onClick={handleAction}
              className="w-full h-12 rounded-full font-bold text-sm touch-manipulation active:scale-[0.98] transition-transform"
              data-testid="button-empty-action"
            >
              {variant === 'error' ? (
                <RefreshCw className="h-4 w-4 mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {actionLabel}
            </Button>
          )}
          
          {secondaryActionLabel && onSecondaryAction && (
            <Button
              variant="ghost"
              onClick={handleSecondaryAction}
              className="w-full h-10 rounded-full font-medium text-sm text-black/60 dark:text-white/60 touch-manipulation"
              data-testid="button-empty-secondary"
            >
              {secondaryActionLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

interface NoSearchResultsProps {
  query: string;
  onClear?: () => void;
}

export function NoSearchResults({ query, onClear }: NoSearchResultsProps) {
  return (
    <MobileEmptyState
      variant="search"
      title="No results found"
      description={`We couldn't find anything matching "${query}"`}
      actionLabel={onClear ? "Clear search" : undefined}
      onAction={onClear}
    />
  );
}

interface OfflineEmptyStateProps {
  onRetry?: () => void;
  cachedCount?: number;
}

export function OfflineEmptyState({ onRetry, cachedCount }: OfflineEmptyStateProps) {
  return (
    <MobileEmptyState
      variant="offline"
      description={
        cachedCount 
          ? `You have ${cachedCount} cached items available offline`
          : "Connect to the internet to see the latest data"
      }
      actionLabel={onRetry ? "Retry" : undefined}
      onAction={onRetry}
    />
  );
}
