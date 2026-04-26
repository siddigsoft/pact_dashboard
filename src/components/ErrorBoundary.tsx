import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

function clearSessionAndReload() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('sb-') ||
        key.startsWith('supabase') ||
        key.startsWith('PACT') ||
        key === 'theme'
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    sessionStorage.clear();
  } catch (_) {}
  window.location.href = '/auth';
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Error caught by ErrorBoundary:", error, errorInfo);
    this.setState({ errorInfo });

    // Hot-reload / provider initialization race: auto-reload once so the user
    // never sees a broken screen after Vite HMR injects updated modules.
    const msg = error?.message ?? '';
    const isProviderRace = /must be used within/i.test(msg);
    if (isProviderRace) {
      const key = 'eb_provider_race_reloaded';
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const msg = this.state.error?.message ?? '';
      const isChunkError = /loading chunk|failed to fetch|dynamically imported module/i.test(msg);
      const isAuthError = /jwt|auth|session|token|unauthorized|forbidden/i.test(msg);

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-lg w-full bg-card border rounded-lg p-6 text-center shadow-lg">
            <h2 className="text-xl font-semibold text-destructive mb-2">Something went wrong</h2>

            {isChunkError && (
              <p className="text-muted-foreground text-sm mb-3">
                A page resource failed to load (stale cache). Click <strong>Refresh</strong> to fix it.
              </p>
            )}
            {isAuthError && (
              <p className="text-muted-foreground text-sm mb-3">
                Your session appears to be invalid or expired. Click <strong>Clear Session</strong> to sign in again.
              </p>
            )}
            {!isChunkError && !isAuthError && (
              <p className="text-muted-foreground text-sm mb-3">
                The application encountered an unexpected error.
              </p>
            )}

            {msg && (
              <div className="mb-4 p-3 bg-muted rounded text-left text-xs overflow-auto max-h-28">
                <p className="font-mono text-destructive break-all">{msg}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors text-sm"
                data-testid="button-refresh-page"
              >
                Refresh Page
              </button>
              <button
                onClick={clearSessionAndReload}
                className="px-4 py-2 bg-destructive/10 text-destructive border border-destructive/20 rounded hover:bg-destructive/20 transition-colors text-sm"
                data-testid="button-clear-session"
              >
                Clear Session &amp; Sign In Again
              </button>
            </div>

            {this.state.errorInfo && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  Show technical details
                </summary>
                <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40 font-mono whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
