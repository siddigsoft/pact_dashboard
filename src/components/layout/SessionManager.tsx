import React from 'react';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import SessionTimeoutWarning from '@/components/auth/SessionTimeoutWarning';
import SessionIndicator from '@/components/ui/SessionIndicator';
import { useAppContext } from '@/context/AppContext';

interface SessionManagerProps {
  children: React.ReactNode;
}

const SessionManager: React.FC<SessionManagerProps> = ({ children }) => {
  const { currentUser } = useAppContext();

  const {
    isWarningVisible,
    timeLeft,
    extendSession,
    logout,
    formatTimeLeft,
  } = useSessionTimeout({
    warningTime: 60, // warn after 60s of inactivity
    sessionDuration: 90, // auto-logout after 90s total (60s warning + 30s countdown)
    checkInterval: 1000, // check every second
  });

  if (!currentUser) return <>{children}</>;

  return (
    <>
      {children}

      <div className="fixed bottom-6 right-6 z-50">
        <SessionIndicator
          timeLeft={timeLeft}
          extendSession={extendSession}
          formatTimeLeft={formatTimeLeft}
          small
        />
      </div>

      <SessionTimeoutWarning
        isVisible={isWarningVisible}
        timeLeft={timeLeft}
        onExtendSession={extendSession}
        onLogout={logout}
        formatTimeLeft={formatTimeLeft}
      />
    </>
  );
};

export default SessionManager;
