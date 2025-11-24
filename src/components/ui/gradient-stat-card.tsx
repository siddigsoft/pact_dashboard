import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon, Sparkles } from 'lucide-react';

type GradientColor = 'blue' | 'green' | 'purple' | 'orange' | 'cyan' | 'pink' | 'indigo' | 'teal';

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
  onClick,
  className = '',
  'data-testid': testId,
}: GradientStatCardProps) {
  const gradientClass = gradientClasses[color];
  const isClickable = !!onClick;

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
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-white/90">
          {title}
        </CardTitle>
        <Icon className="h-5 w-5 text-white/80" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-white">{value}</div>
        {subtitle && (
          <p className="text-xs text-white/80 mt-1">
            {subtitle}
          </p>
        )}
      </CardContent>
      <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
    </Card>
  );
}
