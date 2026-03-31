import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

type GradientColor = 'blue' | 'green' | 'purple' | 'orange' | 'cyan' | 'pink' | 'indigo' | 'teal' | 'red';
type CardSize = 'sm' | 'default';

const colorConfig: Record<GradientColor, { icon: string; value: string; border: string; bg: string }> = {
  blue:   { icon: 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400',    value: 'text-blue-700 dark:text-blue-300',    border: 'border-l-blue-500',   bg: 'bg-blue-50/50 dark:bg-blue-900/10' },
  green:  { icon: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400', value: 'text-green-700 dark:text-green-300',  border: 'border-l-green-500',  bg: 'bg-green-50/50 dark:bg-green-900/10' },
  cyan:   { icon: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400',     value: 'text-cyan-700 dark:text-cyan-300',    border: 'border-l-cyan-500',   bg: 'bg-cyan-50/50 dark:bg-cyan-900/10' },
  orange: { icon: 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400', value: 'text-orange-700 dark:text-orange-300', border: 'border-l-orange-500', bg: 'bg-orange-50/50 dark:bg-orange-900/10' },
  purple: { icon: 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400', value: 'text-purple-700 dark:text-purple-300', border: 'border-l-purple-500', bg: 'bg-purple-50/50 dark:bg-purple-900/10' },
  pink:   { icon: 'bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-400',     value: 'text-pink-700 dark:text-pink-300',    border: 'border-l-pink-500',   bg: 'bg-pink-50/50 dark:bg-pink-900/10' },
  indigo: { icon: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400', value: 'text-indigo-700 dark:text-indigo-300', border: 'border-l-indigo-500', bg: 'bg-indigo-50/50 dark:bg-indigo-900/10' },
  teal:   { icon: 'bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400',     value: 'text-teal-700 dark:text-teal-300',    border: 'border-l-teal-500',   bg: 'bg-teal-50/50 dark:bg-teal-900/10' },
  red:    { icon: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',         value: 'text-red-700 dark:text-red-300',      border: 'border-l-red-500',    bg: 'bg-red-50/50 dark:bg-red-900/10' },
};

interface GradientStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  color?: GradientColor;
  size?: CardSize;
  onClick?: () => void;
  className?: string;
  'data-testid'?: string;
}

export function GradientStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  size = 'default',
  onClick,
  className = '',
  'data-testid': testId,
}: GradientStatCardProps) {
  const cfg = colorConfig[color];
  const isClickable = !!onClick;
  const isSmall = size === 'sm';

  return (
    <Card
      className={`
        border border-gray-200 dark:border-gray-800
        border-l-4 ${cfg.border}
        bg-white dark:bg-gray-900
        overflow-hidden
        shadow-none
        ${isClickable ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200' : ''}
        ${className}
      `}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent className={isSmall ? 'p-3' : 'p-4'}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className={`font-medium text-gray-500 dark:text-gray-400 truncate ${isSmall ? 'text-xs' : 'text-sm'}`}>
              {title}
            </p>
            <p className={`font-bold text-gray-900 dark:text-white mt-1 ${isSmall ? 'text-xl' : 'text-2xl'}`}>
              {value}
            </p>
            {subtitle && (
              <p className={`text-gray-500 dark:text-gray-400 mt-1 ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
                {subtitle}
              </p>
            )}
          </div>
          <div className={`rounded-lg p-2 shrink-0 ${cfg.icon} ${isSmall ? 'p-1.5' : 'p-2'}`}>
            <Icon className={isSmall ? 'h-4 w-4' : 'h-5 w-5'} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
