import React from 'react';

interface SessionManagerProps {
  children: React.ReactNode;
}

const SessionManager: React.FC<SessionManagerProps> = ({ children }) => {
  return <>{children}</>;
};

export default SessionManager;
