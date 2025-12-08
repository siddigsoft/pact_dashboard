import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MobilePageCardProps {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  headerAction?: ReactNode;
}

export function MobilePageCard({ 
  title, 
  subtitle, 
  icon: Icon,
  children, 
  className,
  headerAction 
}: MobilePageCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn("mx-3 my-3", className)}
    >
      <Card className="bg-white dark:bg-black border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
        {title && (
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 px-4 pt-4">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-black/5 dark:bg-white/5">
                  <Icon className="w-5 h-5 text-black dark:text-white" />
                </div>
              )}
              <div>
                <CardTitle className="text-base font-semibold text-black dark:text-white">
                  {title}
                </CardTitle>
                {subtitle && (
                  <p className="text-xs text-black/60 dark:text-white/60 mt-0.5">{subtitle}</p>
                )}
              </div>
            </div>
            {headerAction}
          </CardHeader>
        )}
        <CardContent className={cn("px-4 pb-4", !title && "pt-4")}>
          {children}
        </CardContent>
      </Card>
    </motion.div>
  );
}

interface MobileListItemProps {
  icon?: LucideIcon;
  label: string;
  description?: string;
  value?: string | ReactNode;
  onClick?: () => void;
  showChevron?: boolean;
  rightContent?: ReactNode;
  className?: string;
}

export function MobileListItem({
  icon: Icon,
  label,
  description,
  value,
  onClick,
  showChevron = true,
  rightContent,
  className,
}: MobileListItemProps) {
  const Component = onClick ? 'button' : 'div';
  
  return (
    <Component
      onClick={() => {
        if (onClick) {
          hapticPresets.buttonPress();
          onClick();
        }
      }}
      className={cn(
        "flex items-center w-full gap-3 px-3 py-3 rounded-xl min-h-[52px]",
        "bg-black/5 dark:bg-white/5",
        onClick && "hover-elevate active-elevate-2 cursor-pointer",
        className
      )}
      data-testid={`list-item-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {Icon && (
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-black/10 dark:bg-white/10">
          <Icon className="w-4 h-4 text-black dark:text-white" />
        </div>
      )}
      <div className="flex-1 text-left">
        <p className="text-sm font-medium text-black dark:text-white">{label}</p>
        {description && (
          <p className="text-xs text-black/50 dark:text-white/50">{description}</p>
        )}
      </div>
      {value && (
        <span className="text-sm text-black/60 dark:text-white/60">{value}</span>
      )}
      {rightContent}
      {onClick && showChevron && (
        <ChevronRight className="w-4 h-4 text-black/40 dark:text-white/40" />
      )}
    </Component>
  );
}

interface MobileSectionProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function MobileSection({ title, children, className }: MobileSectionProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {title && (
        <p className="text-xs font-semibold text-black/50 dark:text-white/50 uppercase tracking-wider px-1">
          {title}
        </p>
      )}
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

export default MobilePageCard;
