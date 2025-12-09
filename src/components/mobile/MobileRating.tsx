import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Star, ThumbsUp, ThumbsDown, Heart, Smile, Meh, Frown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MobileStarRatingProps {
  value?: number;
  onChange?: (rating: number) => void;
  maxStars?: number;
  size?: 'sm' | 'md' | 'lg';
  readonly?: boolean;
  showValue?: boolean;
  className?: string;
}

export function MobileStarRating({
  value = 0,
  onChange,
  maxStars = 5,
  size = 'md',
  readonly = false,
  showValue = false,
  className,
}: MobileStarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const displayValue = hoverValue ?? value;

  const sizeClasses = {
    sm: 'h-5 w-5',
    md: 'h-7 w-7',
    lg: 'h-9 w-9',
  };

  const gapClasses = {
    sm: 'gap-1',
    md: 'gap-1.5',
    lg: 'gap-2',
  };

  const handleClick = useCallback((rating: number) => {
    if (readonly) return;
    hapticPresets.selection();
    onChange?.(rating);
  }, [readonly, onChange]);

  return (
    <div 
      className={cn("flex items-center", gapClasses[size], className)}
      data-testid="star-rating"
    >
      <div className={cn("flex", gapClasses[size])}>
        {Array.from({ length: maxStars }, (_, i) => i + 1).map((star) => (
          <motion.button
            key={star}
            className={cn(
              "touch-manipulation transition-colors",
              readonly && "cursor-default"
            )}
            onClick={() => handleClick(star)}
            onMouseEnter={() => !readonly && setHoverValue(star)}
            onMouseLeave={() => setHoverValue(null)}
            whileTap={readonly ? {} : { scale: 0.9 }}
            data-testid={`star-${star}`}
          >
            <Star
              className={cn(
                sizeClasses[size],
                star <= displayValue
                  ? "text-black dark:text-white fill-current"
                  : "text-black/20 dark:text-white/20"
              )}
            />
          </motion.button>
        ))}
      </div>

      {showValue && (
        <span className="text-sm font-medium text-black/60 dark:text-white/60 ml-2">
          {value.toFixed(1)}
        </span>
      )}
    </div>
  );
}

interface MobileThumbsRatingProps {
  value?: 'up' | 'down' | null;
  onChange?: (value: 'up' | 'down' | null) => void;
  upCount?: number;
  downCount?: number;
  showCounts?: boolean;
  readonly?: boolean;
  className?: string;
}

export function MobileThumbsRating({
  value = null,
  onChange,
  upCount,
  downCount,
  showCounts = false,
  readonly = false,
  className,
}: MobileThumbsRatingProps) {
  const handleClick = useCallback((newValue: 'up' | 'down') => {
    if (readonly) return;
    hapticPresets.selection();
    onChange?.(value === newValue ? null : newValue);
  }, [readonly, onChange, value]);

  return (
    <div 
      className={cn("flex items-center gap-3", className)}
      data-testid="thumbs-rating"
    >
      <motion.button
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors",
          value === 'up'
            ? "bg-black dark:bg-white text-white dark:text-black"
            : "bg-black/5 dark:bg-white/5 text-black dark:text-white",
          readonly && "cursor-default"
        )}
        onClick={() => handleClick('up')}
        whileTap={readonly ? {} : { scale: 0.95 }}
        data-testid="thumbs-up"
      >
        <ThumbsUp className="h-5 w-5" />
        {showCounts && upCount !== undefined && (
          <span className="text-sm font-medium">{upCount}</span>
        )}
      </motion.button>

      <motion.button
        className={cn(
          "flex items-center gap-1.5 px-3 py-2 rounded-full transition-colors",
          value === 'down'
            ? "bg-black dark:bg-white text-white dark:text-black"
            : "bg-black/5 dark:bg-white/5 text-black dark:text-white",
          readonly && "cursor-default"
        )}
        onClick={() => handleClick('down')}
        whileTap={readonly ? {} : { scale: 0.95 }}
        data-testid="thumbs-down"
      >
        <ThumbsDown className="h-5 w-5" />
        {showCounts && downCount !== undefined && (
          <span className="text-sm font-medium">{downCount}</span>
        )}
      </motion.button>
    </div>
  );
}

interface MobileEmojiRatingProps {
  value?: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  showLabels?: boolean;
  className?: string;
}

const emojiOptions = [
  { value: 1, icon: Frown, label: 'Very Bad', color: 'text-black/40 dark:text-white/40' },
  { value: 2, icon: Meh, label: 'Bad', color: 'text-black/40 dark:text-white/40' },
  { value: 3, icon: Meh, label: 'Okay', color: 'text-black/60 dark:text-white/60' },
  { value: 4, icon: Smile, label: 'Good', color: 'text-black/80 dark:text-white/80' },
  { value: 5, icon: Heart, label: 'Excellent', color: 'text-black dark:text-white' },
];

export function MobileEmojiRating({
  value,
  onChange,
  readonly = false,
  showLabels = false,
  className,
}: MobileEmojiRatingProps) {
  const handleClick = useCallback((newValue: number) => {
    if (readonly) return;
    hapticPresets.selection();
    onChange?.(newValue);
  }, [readonly, onChange]);

  return (
    <div className={cn("", className)} data-testid="emoji-rating">
      <div className="flex items-center justify-between gap-2">
        {emojiOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;

          return (
            <motion.button
              key={option.value}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-xl transition-all",
                isSelected
                  ? "bg-black dark:bg-white scale-110"
                  : "bg-transparent",
                readonly && "cursor-default"
              )}
              onClick={() => handleClick(option.value)}
              whileTap={readonly ? {} : { scale: 0.9 }}
              data-testid={`emoji-${option.value}`}
            >
              <Icon
                className={cn(
                  "h-8 w-8 transition-colors",
                  isSelected
                    ? "text-white dark:text-black"
                    : option.color
                )}
              />
              {showLabels && (
                <span className={cn(
                  "text-[10px] font-medium",
                  isSelected
                    ? "text-white dark:text-black"
                    : "text-black/40 dark:text-white/40"
                )}>
                  {option.label}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {value && !showLabels && (
        <p className="text-center text-sm text-black/60 dark:text-white/60 mt-2">
          {emojiOptions.find(o => o.value === value)?.label}
        </p>
      )}
    </div>
  );
}

interface MobileSliderRatingProps {
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  showValue?: boolean;
  showLabels?: boolean;
  minLabel?: string;
  maxLabel?: string;
  readonly?: boolean;
  className?: string;
}

export function MobileSliderRating({
  value = 50,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  showValue = true,
  showLabels = true,
  minLabel = 'Low',
  maxLabel = 'High',
  readonly = false,
  className,
}: MobileSliderRatingProps) {
  const percentage = ((value - min) / (max - min)) * 100;

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (readonly) return;
    hapticPresets.selection();
    onChange?.(Number(e.target.value));
  }, [readonly, onChange]);

  return (
    <div className={cn("", className)} data-testid="slider-rating">
      {showValue && (
        <div className="flex justify-center mb-2">
          <span className="text-2xl font-bold text-black dark:text-white">
            {value}
          </span>
        </div>
      )}

      <div className="relative">
        <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full bg-black dark:bg-white transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={readonly}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          data-testid="slider-input"
        />

        <div
          className="absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black dark:bg-white shadow-lg pointer-events-none"
          style={{ left: `calc(${percentage}% - 12px)` }}
        />
      </div>

      {showLabels && (
        <div className="flex justify-between mt-2">
          <span className="text-xs text-black/40 dark:text-white/40">{minLabel}</span>
          <span className="text-xs text-black/40 dark:text-white/40">{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

interface RatingDisplayProps {
  rating: number;
  maxRating?: number;
  reviewCount?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function RatingDisplay({
  rating,
  maxRating = 5,
  reviewCount,
  size = 'md',
  className,
}: RatingDisplayProps) {
  const sizeClasses = {
    sm: { star: 'h-3.5 w-3.5', text: 'text-xs', gap: 'gap-0.5' },
    md: { star: 'h-4 w-4', text: 'text-sm', gap: 'gap-1' },
    lg: { star: 'h-5 w-5', text: 'text-base', gap: 'gap-1' },
  };

  return (
    <div 
      className={cn("flex items-center", sizeClasses[size].gap, className)}
      data-testid="rating-display"
    >
      <Star className={cn(sizeClasses[size].star, "text-black dark:text-white fill-current")} />
      <span className={cn(sizeClasses[size].text, "font-semibold text-black dark:text-white")}>
        {rating.toFixed(1)}
      </span>
      {reviewCount !== undefined && (
        <span className={cn(sizeClasses[size].text, "text-black/40 dark:text-white/40")}>
          ({reviewCount})
        </span>
      )}
    </div>
  );
}
