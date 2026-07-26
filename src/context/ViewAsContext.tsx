import React, { createContext, useContext, useState } from 'react';

export interface ViewAsTarget {
  mode: 'role' | 'user';
  role: string;
  userId?: string;
  displayName: string;
}

interface ViewAsContextType {
  viewAs: ViewAsTarget | null;
  setViewAs: (target: ViewAsTarget | null) => void;
  clearViewAs: () => void;
  openPickerRequest: boolean;
  requestOpenPicker: () => void;
  clearOpenPickerRequest: () => void;
}

const ViewAsContext = createContext<ViewAsContextType>({
  viewAs: null,
  setViewAs: () => {},
  clearViewAs: () => {},
  openPickerRequest: false,
  requestOpenPicker: () => {},
  clearOpenPickerRequest: () => {},
});

export const ViewAsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // viewAs is intentionally NOT persisted to sessionStorage.
  // It is an SA-only in-session preview tool. Persisting it caused stale "View As"
  // state to contaminate non-SA users who opened the app in the same browser tab,
  // making them inherit the wrong role and see empty data pages.
  const [viewAs, setViewAsState] = useState<ViewAsTarget | null>(null);
  const [openPickerRequest, setOpenPickerRequest] = useState(false);

  const setViewAs = (target: ViewAsTarget | null) => {
    setViewAsState(target);
    // Also clear any legacy persisted viewAs keys left over from before this fix
    if (!target) sessionStorage.removeItem('pact-view-as');
  };

  const clearViewAs = () => setViewAs(null);
  const requestOpenPicker = () => setOpenPickerRequest(true);
  const clearOpenPickerRequest = () => setOpenPickerRequest(false);

  return (
    <ViewAsContext.Provider value={{ viewAs, setViewAs, clearViewAs, openPickerRequest, requestOpenPicker, clearOpenPickerRequest }}>
      {children}
    </ViewAsContext.Provider>
  );
};

export const useViewAs = () => useContext(ViewAsContext);
