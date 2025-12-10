import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface Chip {
  id: string;
  label: string;
  icon?: React.ReactNode;
  color?: string;
  disabled?: boolean;
}

interface MobileChipSelectorProps {
  chips: Chip[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  multiSelect?: boolean;
  maxSelect?: number;
  variant?: 'default' | 'outline' | 'filled';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MobileChipSelector({
  chips,
  selectedIds,
  onChange,
  multiSelect = true,
  maxSelect,
  variant = 'default',
  size = 'md',
  className,
}: MobileChipSelectorProps) {
  const handleChipClick = useCallback((chipId: string) => {
    hapticPresets.selection();
    
    if (multiSelect) {
      if (selectedIds.includes(chipId)) {
        onChange(selectedIds.filter(id => id !== chipId));
      } else {
        if (maxSelect && selectedIds.length >= maxSelect) {
          hapticPresets.error();
          return;
        }
        onChange([...selectedIds, chipId]);
      }
    } else {
      onChange(selectedIds.includes(chipId) ? [] : [chipId]);
    }
  }, [selectedIds, onChange, multiSelect, maxSelect]);

  const sizeClasses = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-5 text-base gap-2',
  };

  return (
    <div 
      className={cn("flex flex-wrap gap-2", className)}
      data-testid="chip-selector"
      role="group"
      aria-label="Select options"
    >
      {chips.map((chip) => {
        const isSelected = selectedIds.includes(chip.id);
        
        return (
          <motion.button
            key={chip.id}
            onClick={() => !chip.disabled && handleChipClick(chip.id)}
            disabled={chip.disabled}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "inline-flex items-center justify-center rounded-full font-medium transition-all touch-manipulation",
              sizeClasses[size],
              variant === 'default' && isSelected && "bg-black dark:bg-white text-white dark:text-black",
              variant === 'default' && !isSelected && "bg-black/5 dark:bg-white/5 text-black dark:text-white",
              variant === 'outline' && isSelected && "bg-black dark:bg-white text-white dark:text-black border-2 border-black dark:border-white",
              variant === 'outline' && !isSelected && "bg-transparent text-black dark:text-white border-2 border-black/20 dark:border-white/20",
              variant === 'filled' && isSelected && "bg-black dark:bg-white text-white dark:text-black",
              variant === 'filled' && !isSelected && "bg-black/10 dark:bg-white/10 text-black dark:text-white",
              chip.disabled && "opacity-40 cursor-not-allowed"
            )}
            data-testid={`chip-${chip.id}`}
            aria-pressed={isSelected}
          >
            <AnimatePresence mode="wait">
              {isSelected ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  <Check className={cn(
                    size === 'sm' && "h-3 w-3",
                    size === 'md' && "h-4 w-4",
                    size === 'lg' && "h-5 w-5"
                  )} />
                </motion.span>
              ) : chip.icon ? (
                <motion.span
                  key="icon"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  {chip.icon}
                </motion.span>
              ) : null}
            </AnimatePresence>
            <span>{chip.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

interface MobileFilterChipsProps {
  filters: Array<{
    id: string;
    label: string;
    count?: number;
  }>;
  activeFilters: string[];
  onChange: (filters: string[]) => void;
  onClearAll?: () => void;
  className?: string;
}

export function MobileFilterChips({
  filters,
  activeFilters,
  onChange,
  onClearAll,
  className,
}: MobileFilterChipsProps) {
  const handleFilterClick = useCallback((filterId: string) => {
    hapticPresets.selection();
    if (activeFilters.includes(filterId)) {
      onChange(activeFilters.filter(id => id !== filterId));
    } else {
      onChange([...activeFilters, filterId]);
    }
  }, [activeFilters, onChange]);

  const handleClearAll = useCallback(() => {
    hapticPresets.buttonPress();
    onClearAll?.();
    onChange([]);
  }, [onChange, onClearAll]);

  return (
    <div 
      className={cn("flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide", className)}
      data-testid="filter-chips"
    >
      {activeFilters.length > 0 && (
        <button
          onClick={handleClearAll}
          className="flex-shrink-0 h-9 px-3 rounded-full bg-destructive/10 text-destructive text-sm font-medium flex items-center gap-1.5 touch-manipulation"
          data-testid="button-clear-filters"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      )}

      {filters.map((filter) => {
        const isActive = activeFilters.includes(filter.id);
        return (
          <button
            key={filter.id}
            onClick={() => handleFilterClick(filter.id)}
            className={cn(
              "flex-shrink-0 h-9 px-3 rounded-full text-sm font-medium flex items-center gap-1.5 transition-all touch-manipulation",
              isActive 
                ? "bg-black dark:bg-white text-white dark:text-black" 
                : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
            )}
            data-testid={`filter-${filter.id}`}
          >
            {isActive && <Check className="h-4 w-4" />}
            <span>{filter.label}</span>
            {filter.count !== undefined && (
              <span className={cn(
                "h-5 min-w-5 px-1 rounded-full text-xs font-bold flex items-center justify-center",
                isActive 
                  ? "bg-white/20 dark:bg-black/20" 
                  : "bg-black/10 dark:bg-white/10"
              )}>
                {filter.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface AddableChipInputProps {
  chips: string[];
  onChange: (chips: string[]) => void;
  placeholder?: string;
  maxChips?: number;
  className?: string;
}

export function AddableChipInput({
  chips,
  onChange,
  placeholder = 'Add tag...',
  maxChips = 10,
  className,
}: AddableChipInputProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = useCallback(() => {
    const value = inputValue.trim();
    if (value && !chips.includes(value) && chips.length < maxChips) {
      hapticPresets.success();
      onChange([...chips, value]);
      setInputValue('');
    } else if (chips.includes(value)) {
      hapticPresets.error();
    }
  }, [inputValue, chips, maxChips, onChange]);

  const handleRemove = useCallback((chipToRemove: string) => {
    hapticPresets.buttonPress();
    onChange(chips.filter(c => c !== chipToRemove));
  }, [chips, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    } else if (e.key === 'Backspace' && !inputValue && chips.length > 0) {
      handleRemove(chips[chips.length - 1]);
    }
  }, [handleAdd, handleRemove, inputValue, chips]);

  return (
    <div 
      className={cn(
        "flex flex-wrap items-center gap-2 p-3 rounded-xl bg-black/5 dark:bg-white/5 min-h-[48px]",
        className
      )}
      data-testid="addable-chip-input"
    >
      {chips.map((chip) => (
        <motion.span
          key={chip}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-full bg-black dark:bg-white text-white dark:text-black text-sm font-medium"
        >
          {chip}
          <button
            onClick={() => handleRemove(chip)}
            className="ml-1 hover:bg-white/20 dark:hover:bg-black/20 rounded-full p-0.5 touch-manipulation"
            aria-label={`Remove ${chip}`}
          >
            <X className="h-3 w-3" />
          </button>
        </motion.span>
      ))}

      {chips.length < maxChips && (
        <div className="flex items-center gap-1 flex-1 min-w-[100px]">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 outline-none min-w-[80px]"
            data-testid="input-add-chip"
          />
          {inputValue && (
            <button
              onClick={handleAdd}
              className="h-6 w-6 rounded-full bg-black dark:bg-white flex items-center justify-center touch-manipulation"
              data-testid="button-add-chip"
            >
              <Plus className="h-4 w-4 text-white dark:text-black" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
