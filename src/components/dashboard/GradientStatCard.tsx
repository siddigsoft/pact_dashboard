import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface GradientStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  gradient: string;
  onClick?: () => void;
  trend?: {
    value: number;
    label: string;
  };
  className?: string;
  testId?: string;
}

export function GradientStatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  gradient,
  onClick,
  trend,
  className,
  testId
}: GradientStatCardProps) {
  const isClickable = !!onClick;

  return (
    <Card
      className={cn(
        "overflow-hidden relative border-0 text-white transition-all duration-300",
        gradient,
        isClickable && "hover-elevate active-elevate-2 cursor-pointer",
        className
      )}
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
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            {trend.value > 0 ? (
              <TrendingUp className="h-3 w-3 text-white/90" />
            ) : (
              <TrendingDown className="h-3 w-3 text-white/90" />
            )}
            <span className="text-xs text-white/90 font-medium">
              {Math.abs(trend.value)}% {trend.label}
            </span>
          </div>
        )}
      </CardContent>
      <Sparkles className="absolute -right-4 -bottom-4 h-24 w-24 text-white/10" />
    </Card>
  );
}

// Preset gradient configurations for consistency
export const GRADIENT_PRESETS = {
  blue: "bg-gradient-to-br from-blue-500 to-blue-700",
  green: "bg-gradient-to-br from-green-500 to-emerald-700",
  purple: "bg-gradient-to-br from-purple-500 to-purple-700",
  orange: "bg-gradient-to-br from-orange-500 to-orange-700",
  pink: "bg-gradient-to-br from-pink-500 to-pink-700",
  teal: "bg-gradient-to-br from-teal-500 to-cyan-700",
  indigo: "bg-gradient-to-br from-indigo-500 to-indigo-700",
  red: "bg-gradient-to-br from-red-500 to-red-700",
  emerald: "bg-gradient-to-br from-emerald-500 to-teal-700",
  sky: "bg-gradient-to-br from-sky-500 to-blue-700",
};
