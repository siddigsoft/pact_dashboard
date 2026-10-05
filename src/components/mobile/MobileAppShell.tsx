import { useEffect, useCallback, useState, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getOfflineStats } from '@/lib/offline-db';
import { setupAutoSync, type SyncResult } from '@/lib/sync-manager';
import { OfflineBanner } from './SyncStatusBar';
import { UberSyncIndicator } from './UberSyncIndicator';
import { ActiveVisitOverlay } from './ActiveVisitOverlay';
import { SyncProgressToast } from './SyncProgressToast';
import { EmergencySOS } from './EmergencySOS';
import { FloatingMobileToolbar } from './FloatingMobileToolbar';

interface MobileAppShellProps {
  children: React.ReactNode;
  onNetworkChange?: (isOnline: boolean) => void;
  onLocationUpdate?: (position: GeolocationPosition) => void;
  onPushReceived?: (notification: { title?: string; body?: string; data?: any }) => void;
  showSyncStatus?: boolean;
}

interface DiagnosticLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
}

export function MobileAppShell({
  children,
  onNetworkChange,
  showSyncStatus = true,
}: MobileAppShellProps) {
  const { toast } = useToast();
  const [showOfflineBanner, setShowOfflineBanner] = useState(false);
  const [showEmergencySOS, setShowEmergencySOS] = useState(false);
  const diagnosticLogs = useRef<DiagnosticLog[]>([]);
  const autoSyncCleanup = useRef<(() => void) | null>(null);

  const log = useCallback((level: DiagnosticLog['level'], message: string, details?: any) => {
    const logEntry: DiagnosticLog = {
      timestamp: new Date(),
      level,
      message,
      details
    };
    diagnosticLogs.current.push(logEntry);
    if (diagnosticLogs.current.length > 100) {
      diagnosticLogs.current.shift();
    }
    console[level](`[MobileAppShell] ${message}`, details || '');
  }, []);

  const handleNetworkChange = useCallback(async (connected: boolean) => {
    onNetworkChange?.(connected);

    if (connected) {
      setShowOfflineBanner(true);
      const stats = await getOfflineStats();
      const pendingCount = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;

      if (pendingCount > 0) {
        toast({
          title: 'Back Online',
          description: `${pendingCount} items ready to sync. Tap "Sync Now" to sync.`,
        });
      } else {
        toast({
          title: 'Back Online',
          description: 'Connection restored.',
        });
      }
      setTimeout(() => setShowOfflineBanner(false), 5000);
    } else {
      setShowOfflineBanner(true);
      toast({
        title: 'Offline Mode',
        description: 'Your changes will be saved locally and synced when back online.',
        variant: 'destructive',
      });
    }
  }, [onNetworkChange, toast]);

  const handleSyncComplete = useCallback((result: SyncResult) => {
    if (result.success && result.synced > 0) {
      toast({
        title: 'Sync Complete',
        description: `Successfully synced ${result.synced} items.`,
      });
    } else if (!result.success && result.errors.length > 0) {
      toast({
        title: 'Sync Issues',
        description: `${result.failed} items failed to sync. Will retry automatically.`,
        variant: 'destructive',
      });
    }
  }, [toast]);

  useEffect(() => {
    log('info', 'Initializing mobile app shell...');

    const handleOnline = () => handleNetworkChange(true);
    const handleOffline = () => handleNetworkChange(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    autoSyncCleanup.current = setupAutoSync(60000);
    log('info', 'Mobile app shell initialized');

    return () => {
      autoSyncCleanup.current?.();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleNetworkChange, log]);

  return (
    <div className="flex flex-col h-full">
      <SyncProgressToast />
      {showOfflineBanner && <OfflineBanner />}
      <div className="flex-1 overflow-auto">
        {children}
      </div>
      {showSyncStatus && (
        <UberSyncIndicator
          autoSyncInterval={30000}
          onSyncComplete={handleSyncComplete}
        />
      )}
      <ActiveVisitOverlay />
      <FloatingMobileToolbar
        position="bottom-right"
        showEmergency={true}
        onSOS={() => setShowEmergencySOS(true)}
      />
      <EmergencySOS
        isVisible={showEmergencySOS}
        onClose={() => setShowEmergencySOS(false)}
      />
    </div>
  );
}

export function useDiagnosticLogs() {
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);

  const refresh = useCallback(() => {
    setLogs([...diagnosticLogs]);
  }, []);

  const clear = useCallback(() => {
    diagnosticLogs.length = 0;
    setLogs([]);
  }, []);

  return { logs, refresh, clear };
}

const diagnosticLogs: DiagnosticLog[] = [];

export function addDiagnosticLog(level: DiagnosticLog['level'], message: string, details?: any) {
  const logEntry: DiagnosticLog = {
    timestamp: new Date(),
    level,
    message,
    details
  };
  diagnosticLogs.push(logEntry);
  if (diagnosticLogs.length > 100) {
    diagnosticLogs.shift();
  }
  console[level](`[PACT] ${message}`, details || '');
}

export function getDiagnosticLogs(): DiagnosticLog[] {
  return [...diagnosticLogs];
}
