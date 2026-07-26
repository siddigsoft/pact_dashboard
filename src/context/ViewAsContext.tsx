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
  const [viewAs, setViewAsState] = useState<ViewAsTarget | null>(() => {
    try {
      const stored = sessionStorage.getItem('pact-view-as');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [openPickerRequest, setOpenPickerRequest] = useState(false);

  const setViewAs = (target: ViewAsTarget | null) => {
    setViewAsState(target);
    if (target) sessionStorage.setItem('pact-view-as', JSON.stringify(target));
    else sessionStorage.removeItem('pact-view-as');
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
