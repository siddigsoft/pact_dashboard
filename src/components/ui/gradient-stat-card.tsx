import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon, Sparkles } from 'lucide-react';

type GradientColor = 'blue' | 'green' | 'purple' | 'orange' | 'cyan' | 'pink' | 'indigo' | 'teal';
type CardSize = 'sm' | 'default';

const gradientClasses: Record<GradientColor, string> = {
  blue: 'bg-gradient-to-br from-blue-500 to-blue-700',
  green: 'bg-gradient-to-br from-green-500 to-emerald-700',
  purple: 'bg-gradient-to-br from-purple-500 to-purple-700',
  orange: 'bg-gradient-to-br from-orange-500 to-red-600',
  cyan: 'bg-gradient-to-br from-cyan-500 to-cyan-700',
  pink: 'bg-gradient-to-br from-pink-500 to-pink-700',
  indigo: 'bg-gradient-to-br from-indigo-500 to-indigo-700',
  teal: 'bg-gradient-to-br from-teal-500 to-teal-700',
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
  const gradientClass = gradientClasses[color];
  const isClickable = !!onClick;
  const isSmall = size === 'sm';

  return (
    <Card
      className={`
        ${gradientClass}
        text-white 
        border-0 
        overflow-hidden 
        relative
        ${isClickable ? 'hover-elevate active-elevate-2 cursor-pointer' : ''}
        ${className}
      `}
      onClick={onClick}
      data-testid={testId}
    >
      <CardHeader className={`flex flex-row items-center justify-between gap-2 space-y-0 ${isSmall ? 'p-2.5 pb-1' : 'pb-2'}`}>
        <CardTitle className={`font-medium text-white/90 ${isSmall ? 'text-xs' : 'text-sm'}`}>
          {title}
        </CardTitle>
        <Icon className={`text-white/80 ${isSmall ? 'h-4 w-4' : 'h-5 w-5'}`} />
      </CardHeader>
      <CardContent className={isSmall ? 'p-2.5 pt-0' : ''}>
        <div className={`font-bold text-white ${isSmall ? 'text-2xl' : 'text-3xl'}`}>{value}</div>
        {subtitle && (
          <p className={`text-white/80 ${isSmall ? 'text-[10px] mt-0.5' : 'text-xs mt-1'}`}>
            {subtitle}
          </p>
        )}
      </CardContent>
      <Sparkles className={`absolute text-white/10 ${isSmall ? '-right-3 -bottom-3 h-16 w-16' : '-right-4 -bottom-4 h-24 w-24'}`} />
    </Card>
  );
}
