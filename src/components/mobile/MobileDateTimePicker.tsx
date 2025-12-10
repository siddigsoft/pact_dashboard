import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Clock,
  Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, isToday, setHours, setMinutes } from 'date-fns';

interface MobileDatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

export function MobileDatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  className,
}: MobileDatePickerProps) {
  const [currentMonth, setCurrentMonth] = useState(value || new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value);

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    const daysInMonth = eachDayOfInterval({ start, end });
    
    const startDay = start.getDay();
    const paddingDays = Array(startDay).fill(null);
    
    return [...paddingDays, ...daysInMonth];
  }, [currentMonth]);

  const handlePrevMonth = useCallback(() => {
    hapticPresets.selection();
    setCurrentMonth(prev => subMonths(prev, 1));
  }, []);

  const handleNextMonth = useCallback(() => {
    hapticPresets.selection();
    setCurrentMonth(prev => addMonths(prev, 1));
  }, []);

  const handleSelectDate = useCallback((date: Date) => {
    hapticPresets.buttonPress();
    setSelectedDate(date);
    onChange(date);
  }, [onChange]);

  const isDateDisabled = useCallback((date: Date) => {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  }, [minDate, maxDate]);

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className={cn("bg-white dark:bg-neutral-900 rounded-2xl p-4", className)}>
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={handlePrevMonth}
          data-testid="button-prev-month"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        
        <h3 className="text-base font-bold text-black dark:text-white">
          {format(currentMonth, 'MMMM yyyy')}
        </h3>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={handleNextMonth}
          data-testid="button-next-month"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {weekDays.map(day => (
          <div 
            key={day} 
            className="h-8 flex items-center justify-center text-xs font-medium text-black/40 dark:text-white/40"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="h-10" />;
          }

          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isCurrentDay = isToday(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const disabled = isDateDisabled(day);

          return (
            <button
              key={day.toISOString()}
              onClick={() => !disabled && handleSelectDate(day)}
              disabled={disabled}
              className={cn(
                "h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-all touch-manipulation",
                isSelected && "bg-black dark:bg-white text-white dark:text-black",
                !isSelected && isCurrentDay && "ring-2 ring-black dark:ring-white",
                !isSelected && !disabled && "active:scale-95",
                !isCurrentMonth && "text-black/20 dark:text-white/20",
                isCurrentMonth && !isSelected && "text-black dark:text-white",
                disabled && "opacity-30 cursor-not-allowed"
              )}
              data-testid={`date-${format(day, 'yyyy-MM-dd')}`}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 mt-4 pt-4 border-t border-black/10 dark:border-white/10">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={() => handleSelectDate(new Date())}
          data-testid="button-today"
        >
          Today
        </Button>
      </div>
    </div>
  );
}

interface MobileTimePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  minuteStep?: number;
  className?: string;
}

export function MobileTimePicker({
  value = new Date(),
  onChange,
  minuteStep = 5,
  className,
}: MobileTimePickerProps) {
  const [selectedHour, setSelectedHour] = useState(value.getHours());
  const [selectedMinute, setSelectedMinute] = useState(value.getMinutes());
  const [isPM, setIsPM] = useState(value.getHours() >= 12);

  const hours = Array.from({ length: 12 }, (_, i) => i === 0 ? 12 : i);
  const minutes = Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep);

  const handleHourSelect = useCallback((hour: number) => {
    hapticPresets.selection();
    const actualHour = isPM ? (hour === 12 ? 12 : hour + 12) : (hour === 12 ? 0 : hour);
    setSelectedHour(actualHour);
    const newDate = setHours(value, actualHour);
    onChange(newDate);
  }, [isPM, value, onChange]);

  const handleMinuteSelect = useCallback((minute: number) => {
    hapticPresets.selection();
    setSelectedMinute(minute);
    const newDate = setMinutes(value, minute);
    onChange(newDate);
  }, [value, onChange]);

  const toggleAMPM = useCallback(() => {
    hapticPresets.toggle();
    const newIsPM = !isPM;
    setIsPM(newIsPM);
    const currentHour = selectedHour % 12;
    const newHour = newIsPM ? currentHour + 12 : currentHour;
    setSelectedHour(newHour);
    const newDate = setHours(value, newHour);
    onChange(newDate);
  }, [isPM, selectedHour, value, onChange]);

  const displayHour = selectedHour % 12 || 12;

  return (
    <div className={cn("bg-white dark:bg-neutral-900 rounded-2xl p-4", className)}>
      <div className="flex items-center justify-center gap-4 mb-6">
        <div className="text-5xl font-bold text-black dark:text-white tracking-tight">
          {String(displayHour).padStart(2, '0')}
          <span className="text-black/30 dark:text-white/30">:</span>
          {String(selectedMinute).padStart(2, '0')}
        </div>
        
        <button
          onClick={toggleAMPM}
          className="flex flex-col gap-1"
          data-testid="button-toggle-ampm"
        >
          <span className={cn(
            "text-sm font-bold px-2 py-1 rounded",
            !isPM ? "bg-black dark:bg-white text-white dark:text-black" : "text-black/40 dark:text-white/40"
          )}>
            AM
          </span>
          <span className={cn(
            "text-sm font-bold px-2 py-1 rounded",
            isPM ? "bg-black dark:bg-white text-white dark:text-black" : "text-black/40 dark:text-white/40"
          )}>
            PM
          </span>
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-black/40 dark:text-white/40 mb-2">Hour</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {hours.map(hour => (
              <button
                key={hour}
                onClick={() => handleHourSelect(hour)}
                className={cn(
                  "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-base font-medium transition-all touch-manipulation",
                  displayHour === hour 
                    ? "bg-black dark:bg-white text-white dark:text-black" 
                    : "bg-black/5 dark:bg-white/5 text-black dark:text-white active:scale-95"
                )}
                data-testid={`hour-${hour}`}
              >
                {hour}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-black/40 dark:text-white/40 mb-2">Minute</p>
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
            {minutes.map(minute => (
              <button
                key={minute}
                onClick={() => handleMinuteSelect(minute)}
                className={cn(
                  "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-base font-medium transition-all touch-manipulation",
                  selectedMinute === minute 
                    ? "bg-black dark:bg-white text-white dark:text-black" 
                    : "bg-black/5 dark:bg-white/5 text-black dark:text-white active:scale-95"
                )}
                data-testid={`minute-${minute}`}
              >
                {String(minute).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MobileDateTimePickerProps {
  isOpen: boolean;
  onClose: () => void;
  value?: Date;
  onChange: (date: Date) => void;
  mode?: 'date' | 'time' | 'datetime';
  title?: string;
  minDate?: Date;
  maxDate?: Date;
}

export function MobileDateTimePicker({
  isOpen,
  onClose,
  value = new Date(),
  onChange,
  mode = 'datetime',
  title = 'Select Date & Time',
  minDate,
  maxDate,
}: MobileDateTimePickerProps) {
  const [activeTab, setActiveTab] = useState<'date' | 'time'>(mode === 'time' ? 'time' : 'date');
  const [selectedValue, setSelectedValue] = useState(value);

  const handleConfirm = useCallback(() => {
    hapticPresets.success();
    onChange(selectedValue);
    onClose();
  }, [selectedValue, onChange, onClose]);

  const handleDateChange = useCallback((date: Date) => {
    const newDate = new Date(date);
    newDate.setHours(selectedValue.getHours());
    newDate.setMinutes(selectedValue.getMinutes());
    setSelectedValue(newDate);
  }, [selectedValue]);

  const handleTimeChange = useCallback((date: Date) => {
    const newDate = new Date(selectedValue);
    newDate.setHours(date.getHours());
    newDate.setMinutes(date.getMinutes());
    setSelectedValue(newDate);
  }, [selectedValue]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998] bg-black/50"
            onClick={onClose}
          />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 right-0 bottom-0 z-[9999] bg-white dark:bg-black rounded-t-3xl overflow-hidden"
            data-testid="mobile-datetime-picker"
          >
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 bg-black/20 dark:bg-white/20 rounded-full" />
            </div>

            <div className="px-5 pb-2">
              <h2 className="text-lg font-bold text-black dark:text-white text-center">
                {title}
              </h2>
              <p className="text-sm text-black/60 dark:text-white/60 text-center mt-1">
                {format(selectedValue, 'EEEE, MMMM d, yyyy')} at {format(selectedValue, 'h:mm a')}
              </p>
            </div>

            {mode === 'datetime' && (
              <div className="flex gap-2 px-5 mb-4">
                <button
                  onClick={() => {
                    hapticPresets.selection();
                    setActiveTab('date');
                  }}
                  className={cn(
                    "flex-1 h-10 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-all",
                    activeTab === 'date' 
                      ? "bg-black dark:bg-white text-white dark:text-black" 
                      : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
                  )}
                  data-testid="tab-date"
                >
                  <Calendar className="h-4 w-4" />
                  Date
                </button>
                <button
                  onClick={() => {
                    hapticPresets.selection();
                    setActiveTab('time');
                  }}
                  className={cn(
                    "flex-1 h-10 rounded-full flex items-center justify-center gap-2 text-sm font-medium transition-all",
                    activeTab === 'time' 
                      ? "bg-black dark:bg-white text-white dark:text-black" 
                      : "bg-black/5 dark:bg-white/5 text-black dark:text-white"
                  )}
                  data-testid="tab-time"
                >
                  <Clock className="h-4 w-4" />
                  Time
                </button>
              </div>
            )}

            <div className="px-5 pb-4">
              {(mode === 'date' || (mode === 'datetime' && activeTab === 'date')) && (
                <MobileDatePicker
                  value={selectedValue}
                  onChange={handleDateChange}
                  minDate={minDate}
                  maxDate={maxDate}
                />
              )}

              {(mode === 'time' || (mode === 'datetime' && activeTab === 'time')) && (
                <MobileTimePicker
                  value={selectedValue}
                  onChange={handleTimeChange}
                />
              )}
            </div>

            <div className="px-5 pb-safe">
              <Button
                onClick={handleConfirm}
                className="w-full h-12 rounded-full font-bold"
                data-testid="button-confirm-datetime"
              >
                <Check className="h-4 w-4 mr-2" />
                Confirm
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
