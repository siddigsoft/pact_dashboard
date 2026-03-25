
import React from 'react';
import FloatingMessenger from './FloatingMessenger';

/**
 * PersistentMessenger component that renders the FloatingMessenger
 * This component can be added to individual pages to ensure the messenger is visible
 */
const PersistentMessenger: React.FC = () => {
  return <FloatingMessenger />;
};

export default PersistentMessenger;
