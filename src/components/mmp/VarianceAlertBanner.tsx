import { AlertTriangle, AlertCircle, TrendingUp, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import type { VarianceAlert } from '@/services/costPrediction.service';

interface VarianceAlertBannerProps {
  alerts: VarianceAlert[];
  onDismiss?: () => void;
  collapsible?: boolean;
}

export function VarianceAlertBanner({ 
  alerts, 
  onDismiss,
  collapsible = true 
}: VarianceAlertBannerProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);

  if (alerts.length === 0 || isDismissed) return null;

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const hasCritical = criticalCount > 0;

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  return (
    <Alert 
      variant={hasCritical ? 'destructive' : 'default'}
      className={hasCritical ? 'border-red-500 bg-red-50 dark:bg-red-950' : 'border-amber-500 bg-amber-50 dark:bg-amber-950'}
      data-testid="alert-variance-banner"
    >
      <div className="flex items-start gap-3">
        {hasCritical ? (
          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
        )}
        
        <div className="flex-1">
          <AlertTitle className="flex items-center gap-2 flex-wrap">
            <span>Cost Variance Detected</span>
            {criticalCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {criticalCount} Critical
              </Badge>
            )}
            {warningCount > 0 && (
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-300">
                {warningCount} Warning{warningCount > 1 ? 's' : ''}
              </Badge>
            )}
          </AlertTitle>
          
          <AlertDescription className="mt-2">
            {!isExpanded ? (
              <button 
                onClick={() => setIsExpanded(true)}
                className="text-sm underline hover:no-underline"
                data-testid="button-expand-variance-details"
              >
                Show {alerts.length} variance alert{alerts.length > 1 ? 's' : ''}
              </button>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert, index) => (
                  <div 
                    key={alert.site_id || index} 
                    className="flex items-center gap-2 text-sm"
                    data-testid={`text-variance-alert-${alert.site_id}`}
                  >
                    {alert.severity === 'critical' ? (
                      <TrendingUp className="h-4 w-4 text-red-600 dark:text-red-400" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    )}
                    <span className="font-medium">{alert.site_name}:</span>
                    <span>{alert.message}</span>
                  </div>
                ))}
                
                {collapsible && alerts.length > 1 && (
                  <button 
                    onClick={() => setIsExpanded(false)}
                    className="text-xs text-muted-foreground underline hover:no-underline mt-1"
                    data-testid="button-collapse-variance-details"
                  >
                    Collapse
                  </button>
                )}
              </div>
            )}
          </AlertDescription>
        </div>

        {onDismiss && (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleDismiss}
            className="h-6 w-6"
            data-testid="button-dismiss-variance-alert"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </Alert>
  );
}
