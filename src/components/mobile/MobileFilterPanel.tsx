import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Filter, 
  X, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  RotateCcw,
  Search,
  Calendar,
  MapPin,
  User,
  Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface FilterOption {
  id: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
}

interface FilterSection {
  id: string;
  title: string;
  type: 'single' | 'multi' | 'range' | 'date' | 'search';
  options?: FilterOption[];
  min?: number;
  max?: number;
  defaultExpanded?: boolean;
}

interface FilterValues {
  [sectionId: string]: string | string[] | [number, number] | [Date, Date] | undefined;
}

interface MobileFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sections: FilterSection[];
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onReset?: () => void;
  onApply?: () => void;
  title?: string;
  showActiveCount?: boolean;
  className?: string;
}

export function MobileFilterPanel({
  isOpen,
  onClose,
  sections,
  values,
  onChange,
  onReset,
  onApply,
  title = 'Filters',
  showActiveCount = true,
  className,
}: MobileFilterPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.filter(s => s.defaultExpanded).map(s => s.id))
  );
  const [searchQueries, setSearchQueries] = useState<Record<string, string>>({});

  const activeFilterCount = useMemo(() => {
    let count = 0;
    Object.entries(values).forEach(([, value]) => {
      if (Array.isArray(value)) {
        count += value.length;
      } else if (value !== undefined) {
        count += 1;
      }
    });
    return count;
  }, [values]);

  const toggleSection = useCallback((sectionId: string) => {
    hapticPresets.selection();
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const handleOptionToggle = useCallback((sectionId: string, optionId: string, type: 'single' | 'multi') => {
    hapticPresets.selection();
    const currentValue = values[sectionId];

    if (type === 'single') {
      onChange({
        ...values,
        [sectionId]: currentValue === optionId ? undefined : optionId,
      });
    } else {
      const currentArray = (currentValue as string[]) || [];
      const newArray = currentArray.includes(optionId)
        ? currentArray.filter(id => id !== optionId)
        : [...currentArray, optionId];
      onChange({
        ...values,
        [sectionId]: newArray.length > 0 ? newArray : undefined,
      });
    }
  }, [values, onChange]);

  const handleReset = useCallback(() => {
    hapticPresets.buttonPress();
    onChange({});
    onReset?.();
  }, [onChange, onReset]);

  const handleApply = useCallback(() => {
    hapticPresets.success();
    onApply?.();
    onClose();
  }, [onApply, onClose]);

  const getFilteredOptions = useCallback((section: FilterSection) => {
    if (!section.options) return [];
    const query = searchQueries[section.id]?.toLowerCase() || '';
    if (!query) return section.options;
    return section.options.filter(opt => 
      opt.label.toLowerCase().includes(query)
    );
  }, [searchQueries]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        data-testid="filter-panel-overlay"
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            "absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white dark:bg-neutral-900 flex flex-col",
            className
          )}
          onClick={(e) => e.stopPropagation()}
          data-testid="filter-panel"
        >
          <div className="flex items-center justify-between p-4 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5 text-black dark:text-white" />
              <h2 className="text-lg font-semibold text-black dark:text-white">{title}</h2>
              {showActiveCount && activeFilterCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black dark:bg-white text-white dark:text-black">
                  {activeFilterCount}
                </span>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-filter"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sections.map((section) => (
              <div 
                key={section.id} 
                className="border-b border-black/5 dark:border-white/5"
                data-testid={`filter-section-${section.id}`}
              >
                <button
                  className="w-full flex items-center justify-between p-4 text-left"
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="text-sm font-medium text-black dark:text-white">
                    {section.title}
                  </span>
                  <div className="flex items-center gap-2">
                    {values[section.id] && (
                      <span className="text-xs text-black/60 dark:text-white/60">
                        {Array.isArray(values[section.id]) 
                          ? `${(values[section.id] as string[]).length} selected`
                          : '1 selected'}
                      </span>
                    )}
                    {expandedSections.has(section.id) ? (
                      <ChevronUp className="h-4 w-4 text-black/40 dark:text-white/40" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-black/40 dark:text-white/40" />
                    )}
                  </div>
                </button>

                <AnimatePresence>
                  {expandedSections.has(section.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4">
                        {section.type === 'search' && section.options && section.options.length > 5 && (
                          <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-black/40 dark:text-white/40" />
                            <input
                              type="text"
                              placeholder="Search..."
                              value={searchQueries[section.id] || ''}
                              onChange={(e) => setSearchQueries(prev => ({
                                ...prev,
                                [section.id]: e.target.value,
                              }))}
                              className="w-full pl-9 pr-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
                              data-testid="input-filter-search"
                            />
                          </div>
                        )}

                        {(section.type === 'single' || section.type === 'multi' || section.type === 'search') && (
                          <div className="space-y-1">
                            {getFilteredOptions(section).map((option) => {
                              const isSelected = section.type === 'single'
                                ? values[section.id] === option.id
                                : ((values[section.id] as string[]) || []).includes(option.id);

                              return (
                                <button
                                  key={option.id}
                                  className={cn(
                                    "w-full flex items-center justify-between p-2.5 rounded-lg transition-colors",
                                    isSelected
                                      ? "bg-black dark:bg-white text-white dark:text-black"
                                      : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
                                  )}
                                  onClick={() => handleOptionToggle(section.id, option.id, section.type === 'search' ? 'multi' : section.type)}
                                  data-testid={`filter-option-${option.id}`}
                                >
                                  <div className="flex items-center gap-2">
                                    {option.icon}
                                    <span className="text-sm">{option.label}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {option.count !== undefined && (
                                      <span className={cn(
                                        "text-xs",
                                        isSelected ? "opacity-80" : "text-black/40 dark:text-white/40"
                                      )}>
                                        {option.count}
                                      </span>
                                    )}
                                    {isSelected && <Check className="h-4 w-4" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {section.type === 'range' && section.min !== undefined && section.max !== undefined && (
                          <RangeFilter
                            min={section.min}
                            max={section.max}
                            value={values[section.id] as [number, number] | undefined}
                            onChange={(value) => onChange({ ...values, [section.id]: value })}
                          />
                        )}

                        {section.type === 'date' && (
                          <DateRangeFilter
                            value={values[section.id] as [Date, Date] | undefined}
                            onChange={(value) => onChange({ ...values, [section.id]: value })}
                          />
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-black/10 dark:border-white/10 flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={activeFilterCount === 0}
              className="rounded-full"
              data-testid="button-reset-filters"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={handleApply}
              className="flex-1 rounded-full bg-black dark:bg-white text-white dark:text-black"
              data-testid="button-apply-filters"
            >
              Apply Filters
              {activeFilterCount > 0 && ` (${activeFilterCount})`}
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface RangeFilterProps {
  min: number;
  max: number;
  value?: [number, number];
  onChange: (value: [number, number]) => void;
}

function RangeFilter({ min, max, value, onChange }: RangeFilterProps) {
  const [localValue, setLocalValue] = useState<[number, number]>(value || [min, max]);

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = Number(e.target.value);
    const newValue: [number, number] = [newMin, Math.max(newMin, localValue[1])];
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = Number(e.target.value);
    const newValue: [number, number] = [Math.min(localValue[0], newMax), newMax];
    setLocalValue(newValue);
    onChange(newValue);
  };

  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        value={localValue[0]}
        onChange={handleMinChange}
        min={min}
        max={max}
        className="w-full p-2 rounded-lg bg-black/5 dark:bg-white/5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
        data-testid="input-range-min"
      />
      <span className="text-black/40 dark:text-white/40">to</span>
      <input
        type="number"
        value={localValue[1]}
        onChange={handleMaxChange}
        min={min}
        max={max}
        className="w-full p-2 rounded-lg bg-black/5 dark:bg-white/5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
        data-testid="input-range-max"
      />
    </div>
  );
}

interface DateRangeFilterProps {
  value?: [Date, Date];
  onChange: (value: [Date, Date]) => void;
}

function DateRangeFilter({ value, onChange }: DateRangeFilterProps) {
  const today = new Date();
  const [startDate, setStartDate] = useState(value?.[0] || today);
  const [endDate, setEndDate] = useState(value?.[1] || today);

  const handleStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = new Date(e.target.value);
    setStartDate(date);
    onChange([date, endDate]);
  };

  const handleEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = new Date(e.target.value);
    setEndDate(date);
    onChange([startDate, date]);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <label className="text-xs text-black/40 dark:text-white/40 mb-1 block">From</label>
        <input
          type="date"
          value={startDate.toISOString().split('T')[0]}
          onChange={handleStartChange}
          className="w-full p-2 rounded-lg bg-black/5 dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
          data-testid="input-date-start"
        />
      </div>
      <div className="flex-1">
        <label className="text-xs text-black/40 dark:text-white/40 mb-1 block">To</label>
        <input
          type="date"
          value={endDate.toISOString().split('T')[0]}
          onChange={handleEndChange}
          className="w-full p-2 rounded-lg bg-black/5 dark:bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 dark:focus:ring-white/20"
          data-testid="input-date-end"
        />
      </div>
    </div>
  );
}

interface FilterButtonProps {
  activeCount?: number;
  onClick: () => void;
  className?: string;
}

export function FilterButton({ activeCount = 0, onClick, className }: FilterButtonProps) {
  return (
    <Button
      variant="outline"
      onClick={() => {
        hapticPresets.buttonPress();
        onClick();
      }}
      className={cn("rounded-full relative", className)}
      data-testid="button-open-filter"
    >
      <Filter className="h-4 w-4 mr-2" />
      Filters
      {activeCount > 0 && (
        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-black dark:bg-white text-white dark:text-black">
          {activeCount}
        </span>
      )}
    </Button>
  );
}

export const defaultFilterSections: FilterSection[] = [
  {
    id: 'status',
    title: 'Status',
    type: 'multi',
    defaultExpanded: true,
    options: [
      { id: 'pending', label: 'Pending', count: 12 },
      { id: 'in_progress', label: 'In Progress', count: 8 },
      { id: 'completed', label: 'Completed', count: 45 },
      { id: 'cancelled', label: 'Cancelled', count: 3 },
    ],
  },
  {
    id: 'priority',
    title: 'Priority',
    type: 'single',
    options: [
      { id: 'low', label: 'Low' },
      { id: 'normal', label: 'Normal' },
      { id: 'high', label: 'High' },
      { id: 'urgent', label: 'Urgent' },
    ],
  },
  {
    id: 'date',
    title: 'Date Range',
    type: 'date',
  },
];
