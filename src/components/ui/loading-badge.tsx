import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingBadgeProps {
  message?: string;
  variant?: "default" | "gradient" | "pulse" | "minimal";
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

export function LoadingBadge({ 
  message = "Loading...", 
  variant = "gradient",
  size = "md",
  showIcon = true,
  className 
}: LoadingBadgeProps) {
  const sizeClasses = {
    sm: "text-xs py-1 px-2",
    md: "text-sm py-1.5 px-3",
    lg: "text-base py-2 px-4"
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5"
  };

  const variants = {
    default: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-700",
    gradient: "bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white border-0 shadow-lg shadow-blue-500/30 dark:shadow-purple-500/30",
    pulse: "bg-gradient-to-r from-emerald-500 to-cyan-500 text-white border-0 animate-pulse shadow-lg shadow-emerald-500/40",
    minimal: "bg-muted text-muted-foreground border-muted"
  };

  return (
    <Badge 
      className={cn(
        "inline-flex items-center gap-2 font-medium transition-all duration-300",
        sizeClasses[size],
        variants[variant],
        variant === "gradient" && "animate-shimmer bg-[length:200%_100%]",
        className
      )}
      data-testid="loading-badge"
    >
      {showIcon && (
        variant === "gradient" || variant === "pulse" ? (
          <Sparkles className={cn(iconSizes[size], "animate-spin")} />
        ) : (
          <Loader2 className={cn(iconSizes[size], "animate-spin")} />
        )
      )}
      <span className="animate-pulse">{message}</span>
    </Badge>
  );
}

export function LoadingCard({ message = "Loading data..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 space-y-4" data-testid="loading-card">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-[spin_3s_linear_infinite]"></div>
        <div className="absolute inset-[6px] rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent animate-[spin_1.5s_linear_infinite]"></div>
        <div className="absolute inset-3 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-30 blur-sm animate-pulse"></div>
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-muted-foreground animate-pulse">{message}</p>
        <LoadingBadge message="Please wait" variant="gradient" size="sm" />
      </div>
    </div>
  );
}

export function PageLoader({ message = "Loading page..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen" data-testid="page-loader">
      <div className="text-center space-y-6">
        <div className="relative w-20 h-20 mx-auto">
          <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-[spin_3s_linear_infinite]"></div>
          <div className="absolute inset-[6px] rounded-full border-4 border-t-primary animate-[spin_2s_linear_infinite]"></div>
          <div className="absolute inset-3 rounded-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 opacity-40 blur-md animate-pulse"></div>
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-foreground animate-pulse">{message}</p>
          <LoadingBadge message="Fetching data" variant="gradient" size="md" />
        </div>
      </div>
    </div>
  );
}
