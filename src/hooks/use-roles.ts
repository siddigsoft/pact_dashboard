import { useState, useEffect } from 'react';
import { AppRole } from '@/types/roles';
import { useToast } from '@/hooks/toast';
import { supabase } from '@/integrations/supabase/client';

export const useRoles = (userId?: string) => {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (userId) {
      fetchRoles(userId);
    }
  }, [userId]);

  const fetchRoles = async (uid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', uid);

      if (error) {
        throw error;
      }

      if (data) {
        const userRoles = data
          .map(item => item.role)
          .filter((r): r is AppRole => !!r);
        setRoles(userRoles);
      }
    } catch (error: any) {
      console.error('Error fetching roles:', error);
      toast({
        title: 'Error fetching roles',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

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
