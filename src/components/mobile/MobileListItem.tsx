import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MobileListItemProps {
  title: string;
  subtitle?: string;
  description?: string;
  leftIcon?: React.ReactNode;
  leftImage?: string;
  rightIcon?: React.ReactNode;
  rightText?: string;
  badge?: React.ReactNode;
  showChevron?: boolean;
  selected?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  onClick?: () => void;
  className?: string;
}

export const MobileListItem = forwardRef<HTMLButtonElement, MobileListItemProps>(({
  title,
  subtitle,
  description,
  leftIcon,
  leftImage,
  rightIcon,
  rightText,
  badge,
  showChevron = false,
  selected = false,
  disabled = false,
  destructive = false,
  onClick,
  className,
}, ref) => {
  const handleClick = () => {
    if (!disabled && onClick) {
      hapticPresets.buttonPress();
      onClick();
    }
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors touch-manipulation",
        !disabled && "active:bg-black/5 dark:active:bg-white/5",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
      data-testid={`list-item-${title.toLowerCase().replace(/\s/g, '-')}`}
    >
      {leftImage && (
        <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
          <img 
            src={leftImage} 
            alt="" 
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {leftIcon && !leftImage && (
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          destructive 
            ? "bg-destructive/10 text-destructive" 
            : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
        )}>
          {leftIcon}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={cn(
            "text-sm font-medium truncate",
            destructive ? "text-destructive" : "text-black dark:text-white"
          )}>
            {title}
          </p>
          {badge}
        </div>
        
        {subtitle && (
          <p className="text-xs text-black/60 dark:text-white/60 truncate mt-0.5">
            {subtitle}
          </p>
        )}
        
        {description && (
          <p className="text-xs text-black/40 dark:text-white/40 truncate mt-0.5">
            {description}
          </p>
        )}
      </div>

      {rightText && (
        <span className="text-sm text-black/40 dark:text-white/40 flex-shrink-0">
          {rightText}
        </span>
      )}

      {rightIcon && (
        <span className="text-black/40 dark:text-white/40 flex-shrink-0">
          {rightIcon}
        </span>
      )}

      {selected && (
        <Check className="h-5 w-5 text-black dark:text-white flex-shrink-0" />
      )}

      {showChevron && !selected && (
        <ChevronRight className="h-5 w-5 text-black/30 dark:text-white/30 flex-shrink-0" />
      )}
    </button>
  );
});

MobileListItem.displayName = 'MobileListItem';

interface MobileListSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function MobileListSection({ 
  title, 
  children, 
  className 
}: MobileListSectionProps) {
  return (
    <div className={cn("mb-6", className)}>
      {title && (
        <h3 className="text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wider px-4 mb-2">
          {title}
        </h3>
      )}
      <div className="bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden divide-y divide-black/5 dark:divide-white/5">
        {children}
      </div>
    </div>
  );
}

interface MobileSelectableListProps {
  items: Array<{
    id: string;
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
  }>;
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function MobileSelectableList({
  items,
  selectedId,
  onSelect,
  className,
}: MobileSelectableListProps) {
  return (
    <div className={cn("bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden divide-y divide-black/5 dark:divide-white/5", className)}>
      {items.map((item) => (
        <MobileListItem
          key={item.id}
          title={item.title}
          subtitle={item.subtitle}
          leftIcon={item.icon}
          selected={selectedId === item.id}
          onClick={() => {
            hapticPresets.selection();
            onSelect(item.id);
          }}
        />
      ))}
    </div>
  );
}

interface MobileMenuItemProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string | number;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  showChevron?: boolean;
}

export function MobileMenuItem({
  icon,
  title,
  subtitle,
  badge,
  onClick,
  destructive = false,
  disabled = false,
  showChevron = true,
}: MobileMenuItemProps) {
  return (
    <MobileListItem
      title={title}
      subtitle={subtitle}
      leftIcon={icon}
      showChevron={showChevron}
      onClick={onClick}
      destructive={destructive}
      disabled={disabled}
      badge={
        badge !== undefined ? (
          <span className="h-5 min-w-5 px-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center">
            {typeof badge === 'number' && badge > 99 ? '99+' : badge}
          </span>
        ) : undefined
      }
    />
  );
}

interface InfoRowProps {
  label: string;
  value: string | React.ReactNode;
  className?: string;
}

export function InfoRow({ label, value, className }: InfoRowProps) {
  return (
    <div className={cn("flex items-center justify-between py-3", className)}>
      <span className="text-sm text-black/60 dark:text-white/60">{label}</span>
      <span className="text-sm font-medium text-black dark:text-white text-right">
        {value}
      </span>
    </div>
  );
}

interface InfoCardProps {
  rows: Array<{ label: string; value: string | React.ReactNode }>;
  title?: string;
  className?: string;
}

export function InfoCard({ rows, title, className }: InfoCardProps) {
  return (
    <div className={cn("bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden", className)}>
      {title && (
        <div className="px-4 py-3 border-b border-black/5 dark:border-white/5">
          <h3 className="text-sm font-semibold text-black dark:text-white">{title}</h3>
        </div>
      )}
      <div className="px-4 divide-y divide-black/5 dark:divide-white/5">
        {rows.map((row, index) => (
          <InfoRow key={index} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
}
