import { useMemo } from 'react';
import { Check, X, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface PasswordStrengthIndicatorProps {
  password: string;
  showRequirements?: boolean;
  className?: string;
}

type StrengthLevel = 'weak' | 'fair' | 'good' | 'strong';

interface PasswordRequirement {
  label: string;
  met: boolean;
}

function getPasswordStrength(password: string): {
  level: StrengthLevel;
  score: number;
  requirements: PasswordRequirement[];
} {
  const requirements: PasswordRequirement[] = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'Contains lowercase letter', met: /[a-z]/.test(password) },
    { label: 'Contains a number', met: /[0-9]/.test(password) },
    { label: 'Contains special character', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  const metCount = requirements.filter(r => r.met).length;
  const score = (metCount / requirements.length) * 100;

  let level: StrengthLevel;
  if (score <= 25) level = 'weak';
  else if (score <= 50) level = 'fair';
  else if (score <= 75) level = 'good';
  else level = 'strong';

  return { level, score, requirements };
}

const strengthConfig: Record<StrengthLevel, { label: string; color: string; bgColor: string }> = {
  weak: { label: 'Weak', color: 'text-destructive', bgColor: 'bg-destructive' },
  fair: { label: 'Fair', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500' },
  good: { label: 'Good', color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-500' },
  strong: { label: 'Strong', color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-500' },
};

export function PasswordStrengthIndicator({
  password,
  showRequirements = false,
  className,
}: PasswordStrengthIndicatorProps) {
  const { level, score, requirements } = useMemo(
    () => getPasswordStrength(password),
    [password]
  );

  const config = strengthConfig[level];

  if (!password) return null;

  return (
    <div className={cn("space-y-2", className)} data-testid="password-strength">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 flex-1">
          {[...Array(4)].map((_, i) => (
            <motion.div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full",
                score > i * 25 ? config.bgColor : "bg-black/10 dark:bg-white/10"
              )}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.2, delay: i * 0.05 }}
            />
          ))}
        </div>
        <span className={cn("text-xs font-medium ml-3", config.color)}>
          {config.label}
        </span>
      </div>

      <AnimatePresence>
        {showRequirements && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 pt-1">
              {requirements.map((req, index) => (
                <motion.div
                  key={req.label}
                  initial={{ x: -10, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-2 text-xs"
                >
                  {req.met ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <X className="h-3 w-3 text-black/30 dark:text-white/30" />
                  )}
                  <span className={cn(
                    req.met ? "text-black/80 dark:text-white/80" : "text-black/40 dark:text-white/40"
                  )}>
                    {req.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface PasswordStrengthMeterProps {
  password: string;
  className?: string;
}

export function PasswordStrengthMeter({ password, className }: PasswordStrengthMeterProps) {
  const { level, score } = useMemo(() => getPasswordStrength(password), [password]);
  const config = strengthConfig[level];

  if (!password) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", config.bgColor)}
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className={cn("text-xs font-medium", config.color)}>
          {config.label}
        </span>
        <span className="text-xs text-black/40 dark:text-white/40">
          {Math.round(score)}%
        </span>
      </div>
    </div>
  );
}

export function usePasswordStrength(password: string) {
  return useMemo(() => getPasswordStrength(password), [password]);
}
