import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
  disabled?: boolean;
}

interface MobileTabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  variant?: 'default' | 'pills' | 'underline';
  fullWidth?: boolean;
  className?: string;
}

export function MobileTabBar({
  tabs,
  activeTab,
  onChange,
  variant = 'default',
  fullWidth = false,
  className,
}: MobileTabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeIndex = tabs.findIndex(t => t.id === activeTab);
    const container = containerRef.current;
    if (!container || activeIndex === -1) return;

    // Skip the motion.div indicator (first child) when getting the active button
    // For default variant, motion.div is the first child
    const buttonStartIndex = variant === 'default' ? 1 : 0;
    const activeButton = container.children[buttonStartIndex + activeIndex] as HTMLElement;
    
    if (activeButton) {
      // Use getBoundingClientRect for RTL-safe positioning
      const containerRect = container.getBoundingClientRect();
      const buttonRect = activeButton.getBoundingClientRect();
      
      setIndicatorStyle({
        left: buttonRect.left - containerRect.left + container.scrollLeft,
        width: buttonRect.width,
      });
    }
  }, [activeTab, tabs, variant]);

  const handleTabClick = useCallback((tab: Tab) => {
    if (tab.disabled) return;
    hapticPresets.selection();
    onChange(tab.id);
  }, [onChange]);

  if (variant === 'pills') {
    return (
      <div 
        className={cn(
          "flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide",
          fullWidth && "justify-around mx-0 px-0",
          className
        )}
        data-testid="mobile-tab-bar"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              disabled={tab.disabled}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all touch-manipulation",
                isActive 
                  ? "bg-black dark:bg-white text-white dark:text-black" 
                  : "bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60",
                tab.disabled && "opacity-40 cursor-not-allowed",
                fullWidth && "flex-1 justify-center"
              )}
              data-testid={`button-tab-${tab.id}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className={cn(
                  "h-5 min-w-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center",
                  isActive 
                    ? "bg-white/20 dark:bg-black/20" 
                    : "bg-black dark:bg-white text-white dark:text-black"
                )}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === 'underline') {
    return (
      <div 
        ref={containerRef}
        className={cn(
          "relative flex gap-4 border-b border-black/10 dark:border-white/10 overflow-x-auto scrollbar-hide",
          fullWidth && "justify-around gap-2",
          className
        )}
        data-testid="mobile-tab-bar"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab)}
              disabled={tab.disabled}
              className={cn(
                "relative flex items-center gap-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors touch-manipulation",
                isActive 
                  ? "text-black dark:text-white" 
                  : "text-black/40 dark:text-white/40",
                tab.disabled && "opacity-40 cursor-not-allowed",
                fullWidth && "flex-1 justify-center"
              )}
              data-testid={`button-tab-${tab.id}`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="h-5 min-w-5 px-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </button>
          );
        })}
        
        <motion.div
          className="absolute bottom-0 h-0.5 bg-black dark:bg-white"
          animate={indicatorStyle}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative flex p-1 gap-1 bg-black/5 dark:bg-white/5 rounded-xl overflow-x-auto scrollbar-hide",
        fullWidth && "justify-around",
        className
      )}
      data-testid="mobile-tab-bar"
    >
      <motion.div
        className="absolute top-1 bottom-1 bg-white dark:bg-neutral-800 rounded-lg shadow-sm"
        animate={indicatorStyle}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
      
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            disabled={tab.disabled}
            className={cn(
              "relative z-10 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors touch-manipulation",
              isActive 
                ? "text-black dark:text-white" 
                : "text-black/60 dark:text-white/60",
              tab.disabled && "opacity-40 cursor-not-allowed",
              fullWidth && "flex-1"
            )}
            data-testid={`button-tab-${tab.id}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className={cn(
                "h-5 min-w-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center",
                isActive 
                  ? "bg-black dark:bg-white text-white dark:text-black" 
                  : "bg-black/20 dark:bg-white/20"
              )}>
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface MobileSegmentedControlProps {
  segments: Array<{ id: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function MobileSegmentedControl({
  segments,
  value,
  onChange,
  className,
}: MobileSegmentedControlProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeIndex = segments.findIndex(s => s.id === value);
    const container = containerRef.current;
    if (!container || activeIndex === -1) return;

    const activeButton = container.children[activeIndex + 1] as HTMLElement;
    if (activeButton) {
      setIndicatorStyle({
        left: activeButton.offsetLeft,
        width: activeButton.offsetWidth,
      });
    }
  }, [value, segments]);

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative flex p-0.5 bg-black/10 dark:bg-white/10 rounded-full",
        className
      )}
      data-testid="segmented-control"
    >
      <motion.div
        className="absolute top-0.5 bottom-0.5 bg-black dark:bg-white rounded-full"
        animate={indicatorStyle}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
      
      {segments.map((segment) => {
        const isActive = segment.id === value;
        return (
          <button
            key={segment.id}
            onClick={() => {
              hapticPresets.selection();
              onChange(segment.id);
            }}
            className={cn(
              "relative z-10 flex-1 py-2 px-4 text-sm font-medium transition-colors touch-manipulation",
              isActive 
                ? "text-white dark:text-black" 
                : "text-black/60 dark:text-white/60"
            )}
            data-testid={`button-segment-${segment.id}`}
          >
            {segment.label}
          </button>
        );
      })}
    </div>
  );
}
