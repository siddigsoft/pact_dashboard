import { useState } from 'react';
import { AppRole } from '@/types/roles';
import { useToast } from '@/hooks/toast';

export const useRoles = (userId?: string) => {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading] = useState(false);
  const { toast } = useToast();

  // Roles are already fetched in setUserFromAuthUser (UserContext) and passed down.
  // Fetching them here again would create a duplicate DB call on every auth event.
  // This hook retains the interface for addRole/removeRole UI actions only.

  const hasRole = (role: AppRole) => roles.includes(role);

  const addRole = async (userId: string, role: AppRole) => {
    toast({
      title: 'Use Role Management',
      description: 'Assign roles from the Role Management screen only.',
    });
    return false;
  };

  const removeRole = async (userId: string, role: AppRole) => {
    toast({
      title: 'Use Role Management',
      description: 'Remove roles from the Role Management screen only.',
    });
    return false;
  };

  return {
    roles,
    isLoading,
    hasRole,
    addRole,
    removeRole
  };
};
