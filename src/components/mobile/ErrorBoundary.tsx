import { Component, ErrorInfo, ReactNode, useState } from 'react';
import { AlertCircle, RefreshCw, Bug, ChevronDown, ChevronUp, Copy, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { getDiagnosticLogs, addDiagnosticLog } from './MobileAppShell';
import { syncManager } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  showDiagnostics: boolean;
  isRetrying: boolean;
  retryCount: number;
  isOnline: boolean;
  syncStats: {
    pendingActions: number;
    unsyncedVisits: number;
    unsyncedLocations: number;
    cachedItems: number;
  };
}

export class MobileErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      showDiagnostics: false,
      isRetrying: false,
      retryCount: 0,
      isOnline: navigator.onLine,
      syncStats: {
        pendingActions: 0,
        unsyncedVisits: 0,
        unsyncedLocations: 0,
        cachedItems: 0,
      },
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    addDiagnosticLog('error', 'React error boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });

    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    const stats = await getOfflineStats();
    this.setState({ syncStats: stats });

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  componentWillUnmount() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  handleOnline = () => {
    this.setState({ isOnline: true });
  };

  handleOffline = () => {
    this.setState({ isOnline: false });
  };

  handleRetry = async () => {
    this.setState({ isRetrying: true, retryCount: this.state.retryCount + 1 });
    addDiagnosticLog('info', 'User initiated retry', { retryCount: this.state.retryCount + 1 });

    try {
      if (navigator.onLine) {
        await syncManager.syncAll();
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        isRetrying: false,
      });
    } catch (retryError) {
      addDiagnosticLog('error', 'Retry failed', retryError);
      this.setState({ isRetrying: false });
    }
  };

  handleCopyDiagnostics = () => {
    const logs = getDiagnosticLogs();
    const { error, errorInfo, syncStats, retryCount } = this.state;

    const diagnosticData = {
      timestamp: new Date().toISOString(),
      error: {
        message: error?.message,
        stack: error?.stack,
        componentStack: errorInfo?.componentStack,
      },
      retryCount,
      syncStats,
      isOnline: navigator.onLine,
      userAgent: navigator.userAgent,
      recentLogs: logs.slice(-20),
    };

    navigator.clipboard.writeText(JSON.stringify(diagnosticData, null, 2));
  };

  handleForceSync = async () => {
    this.setState({ isRetrying: true });
    try {
      await syncManager.syncAll();
      const stats = await getOfflineStats();
      this.setState({ syncStats: stats, isRetrying: false });
    } catch (error) {
      addDiagnosticLog('error', 'Force sync failed', error);
      this.setState({ isRetrying: false });
    }
  };

  render() {
    const {
      hasError,
      error,
      errorInfo,
      showDetails,
      showDiagnostics,
      isRetrying,
      retryCount,
      isOnline,
      syncStats,
    } = this.state;

    if (hasError) {
      const logs = getDiagnosticLogs();
      const hasPendingData = syncStats.pendingActions > 0 || syncStats.unsyncedVisits > 0;

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <CardTitle>Something Went Wrong</CardTitle>
              <CardDescription>
                {retryCount > 0 
                  ? `Retry attempt ${retryCount} failed. Please try again.`
                  : 'An unexpected error occurred. You can try again or report the issue.'
                }
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-2">
                  {isOnline ? (
                    <Wifi className="h-4 w-4 text-green-500" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-destructive" />
                  )}
                  <span className="text-sm">{isOnline ? 'Online' : 'Offline'}</span>
                </div>
                {hasPendingData && (
                  <Badge variant="secondary">
                    {syncStats.pendingActions + syncStats.unsyncedVisits} pending
                  </Badge>
                )}
              </div>

              {hasPendingData && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Unsynced Data</AlertTitle>
                  <AlertDescription>
                    You have {syncStats.pendingActions} pending actions and {syncStats.unsyncedVisits} unsynced visits.
                    {isOnline && ' Click "Sync Now" to upload them.'}
                  </AlertDescription>
                </Alert>
              )}

              <Collapsible open={showDetails} onOpenChange={(open) => this.setState({ showDetails: open })}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span>Error Details</span>
                    {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 rounded-lg bg-muted text-sm font-mono">
                    <p className="text-destructive font-semibold">{error?.message}</p>
                    {error?.stack && (
                      <ScrollArea className="h-32 mt-2">
                        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {error.stack}
                        </pre>
                      </ScrollArea>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              <Collapsible open={showDiagnostics} onOpenChange={(open) => this.setState({ showDiagnostics: open })}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Bug className="h-4 w-4" />
                      Diagnostic Logs ({logs.length})
                    </span>
                    {showDiagnostics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ScrollArea className="h-48 rounded-lg border p-2">
                    {logs.slice(-20).reverse().map((log, index) => (
                      <div 
                        key={index} 
                        className={`text-xs p-1 border-b last:border-0 ${
                          log.level === 'error' ? 'text-destructive' :
                          log.level === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-muted-foreground'
                        }`}
                      >
                        <span className="font-mono">
                          [{log.timestamp.toLocaleTimeString()}] {log.message}
                        </span>
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <p className="text-center text-muted-foreground text-sm py-4">
                        No diagnostic logs available
                      </p>
                    )}
                  </ScrollArea>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>

            <CardFooter className="flex flex-col gap-2">
              <div className="flex gap-2 w-full">
                <Button 
                  onClick={this.handleRetry} 
                  disabled={isRetrying}
                  className="flex-1"
                  data-testid="button-retry"
                >
                  {isRetrying ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Try Again
                </Button>
                {isOnline && hasPendingData && (
                  <Button 
                    variant="outline" 
                    onClick={this.handleForceSync}
                    disabled={isRetrying}
                    data-testid="button-sync"
                  >
                    Sync Now
                  </Button>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={this.handleCopyDiagnostics}
                className="w-full"
                data-testid="button-copy-diagnostics"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Diagnostic Report
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

interface RetryButtonProps {
  onRetry: () => Promise<void>;
  error?: string;
  className?: string;
}

export function RetryButton({ onRetry, error, className }: RetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryCount(prev => prev + 1);
    addDiagnosticLog('info', 'Retry button clicked', { retryCount: retryCount + 1 });
    
    try {
      await onRetry();
    } catch (err) {
      addDiagnosticLog('error', 'Retry failed', err);
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
      <Button 
        onClick={handleRetry} 
        disabled={isRetrying}
        variant="outline"
        data-testid="button-retry-action"
      >
        {isRetrying ? (
          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        {retryCount > 0 ? `Retry (${retryCount})` : 'Retry'}
      </Button>
    </div>
  );
}
