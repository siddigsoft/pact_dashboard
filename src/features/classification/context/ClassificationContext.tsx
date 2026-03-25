import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/shared/hooks/use-toast';
import { useUser } from '@/features/user/context/UserContext';
import {
  useUserClassificationsQuery,
  useFeeStructuresQuery,
  useInvalidateClassificationQueries,
  classificationQueryKeys,
} from './classificationQueries';
import {
  transformUserClassificationFromDB,
  transformFeeStructureFromDB,
  insertUserClassification as dbInsertUserClassification,
  updateUserClassificationRecord as dbUpdateUserClassification,
  deactivateUserClassificationRecord as dbDeactivateUserClassification,
  deactivateClassificationForAssign as dbDeactivateForAssign,
  insertFeeStructure as dbInsertFeeStructure,
  updateFeeStructureRecord as dbUpdateFeeStructure,
  deactivateFeeStructureRecord as dbDeactivateFeeStructure,
  fetchClassificationHistory as dbFetchClassificationHistory,
  fetchCurrentUserClassifications as dbFetchCurrentUserClassifications,
} from '@/features/classification/repository/classificationRepository';
import type {
  UserClassification,
  ClassificationFeeStructure,
  ClassificationHistory,
  CreateClassificationRequest,
  UpdateClassificationRequest,
  CreateFeeStructureRequest,
  UpdateFeeStructureRequest,
  CurrentUserClassification,
  ClassificationFeeResult,
} from '@/types/classification';
import type { ClassificationFormData } from '@/features/admin/components/ManageClassificationDialog';

interface ClassificationContextType {
  // State
  userClassifications: UserClassification[];
  feeStructures: ClassificationFeeStructure[];
  classificationHistory: Record<string, ClassificationHistory[]>;
  loading: boolean;
  
  // User Classification Operations
  refreshUserClassifications: () => Promise<void>;
  getUserClassification: (userId: string) => UserClassification | null;
  createUserClassification: (data: CreateClassificationRequest) => Promise<UserClassification | null>;
  updateUserClassification: (id: string, data: UpdateClassificationRequest) => Promise<void>;
  deactivateUserClassification: (id: string, reason: string) => Promise<void>;
  
  // Fee Structure Operations
  refreshFeeStructures: () => Promise<void>;
  createFeeStructure: (data: CreateFeeStructureRequest) => Promise<ClassificationFeeStructure | null>;
  updateFeeStructure: (id: string, data: UpdateFeeStructureRequest) => Promise<void>;
  deactivateFeeStructure: (id: string, reason: string) => Promise<void>;
  getActiveFeeStructure: (level: string, roleScope: string) => ClassificationFeeStructure | null;
  
  // Classification History
  getClassificationHistory: (userId: string) => Promise<ClassificationHistory[]>;
  
  // Helper Functions
  calculateSiteVisitFee: (userId: string, siteVisitId: string) => Promise<ClassificationFeeResult | null>;
  
  // Current Classifications View
  getCurrentUserClassifications: () => Promise<CurrentUserClassification[]>;
  
  // Assign Classification (creates new or updates existing)
  assignClassification: (userId: string, data: ClassificationFormData | CreateClassificationRequest) => Promise<UserClassification | null>;
}

const ClassificationContext = createContext<ClassificationContextType | undefined>(undefined);

export const ClassificationProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient();
  const { invalidateUserClassifications, invalidateFeeStructures } = useInvalidateClassificationQueries();
  const [classificationHistory, setClassificationHistory] = useState<Record<string, ClassificationHistory[]>>({});
  const { toast } = useToast();
  const { currentUser } = useUser();

  const { data: userClassifications = [], isLoading: loadingClassifications } = useUserClassificationsQuery();
  const { data: feeStructures = [], isLoading: loadingFees } = useFeeStructuresQuery();
  const loading = loadingClassifications || loadingFees;

  const refreshUserClassifications = useCallback(async () => {
    await invalidateUserClassifications();
  }, [invalidateUserClassifications]);

  const refreshFeeStructures = useCallback(async () => {
    await invalidateFeeStructures();
  }, [invalidateFeeStructures]);

  // Realtime subscriptions for classification changes
  useEffect(() => {
    const classificationsChannel = supabase
      .channel('user_classifications_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_classifications' },
        () => {
          queryClient.invalidateQueries({ queryKey: classificationQueryKeys.userClassifications() });
          toast({
            title: 'Classification Updated',
            description: 'A team member classification has been changed',
          });
        }
      )
      .subscribe();

    const feesChannel = supabase
      .channel('fee_structures_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'classification_fee_structures' },
        () => {
          queryClient.invalidateQueries({ queryKey: classificationQueryKeys.feeStructures() });
          toast({
            title: 'Fee Structure Updated',
            description: 'Classification fee structures have been updated',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(classificationsChannel);
      supabase.removeChannel(feesChannel);
    };
  }, [queryClient, toast]);

  // Get user classification
  const getUserClassification = useCallback((userId: string): UserClassification | null => {
    const now = new Date().toISOString();
    const classification = userClassifications.find(
      (c) =>
        c.userId === userId &&
        c.isActive &&
        c.effectiveFrom <= now &&
        (!c.effectiveUntil || c.effectiveUntil > now)
    );
    return classification || null;
  }, [userClassifications]);

  // Create user classification
  const createUserClassification = useCallback(async (data: CreateClassificationRequest): Promise<UserClassification | null> => {
    try {
      const newClassification = await dbInsertUserClassification(data, currentUser?.id);
      queryClient.invalidateQueries({ queryKey: classificationQueryKeys.userClassifications() });
      toast({ title: 'Success', description: 'Classification assigned successfully' });
      return newClassification;
    } catch (error: any) {
      console.error('Error creating classification:', error);
      toast({ title: 'Error', description: error.message || 'Failed to create classification', variant: 'destructive' });
      return null;
    }
  }, [currentUser, toast, queryClient]);

  // Update user classification
  const updateUserClassification = useCallback(async (id: string, data: UpdateClassificationRequest): Promise<void> => {
    try {
      await dbUpdateUserClassification(id, data);
      queryClient.invalidateQueries({ queryKey: classificationQueryKeys.userClassifications() });
      toast({ title: 'Success', description: 'Classification updated successfully' });
    } catch (error: any) {
      console.error('Error updating classification:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update classification', variant: 'destructive' });
      throw error;
    }
  }, [toast, queryClient]);

  // Deactivate user classification
  const deactivateUserClassification = useCallback(async (id: string, reason: string): Promise<void> => {
    try {
      await dbDeactivateUserClassification(id, reason);
      queryClient.invalidateQueries({ queryKey: classificationQueryKeys.userClassifications() });
      toast({ title: 'Success', description: 'Classification deactivated successfully' });
    } catch (error: any) {
      console.error('Error deactivating classification:', error);
      toast({ title: 'Error', description: error.message || 'Failed to deactivate classification', variant: 'destructive' });
      throw error;
    }
  }, [toast, queryClient]);

  // Assign Classification - intelligently creates or updates
  // CONSTRAINT: Each user can only have ONE active classification at a time
  const assignClassification = useCallback(async (userId: string, data: ClassificationFormData | CreateClassificationRequest): Promise<UserClassification | null> => {
    console.log('[Classification] Starting assignment for user:', userId);
    console.log('[Classification] Form data:', JSON.stringify(data, null, 2));
    
    try {
      const now = new Date().toISOString();
      
      // Check if user has ANY active classification (one classification per user rule)
      // This enforces that a user can only have ONE active classification at a time
      const existingClassifications = userClassifications.filter(
        (c) =>
          c.userId === userId &&
          c.isActive &&
          c.effectiveFrom <= now &&
          (!c.effectiveUntil || c.effectiveUntil > now)
      );

      console.log('[Classification] Found existing classifications:', existingClassifications.length);
      existingClassifications.forEach(c => console.log(`  - ${c.id}: ${c.classificationLevel}/${c.roleScope}`));

      // Deactivate ALL existing active classifications for this user
      const effectiveFrom = data.effectiveFrom || now;
      for (const existingClassification of existingClassifications) {
        console.log('[Classification] Deactivating existing classification:', existingClassification.id);
        try {
          await dbDeactivateForAssign(
            existingClassification.id,
            `Replaced by new classification: ${data.changeReason || 'No reason provided'}`,
            effectiveFrom,
          );
        } catch (deactivateError) {
          console.error('[Classification] Failed to deactivate existing:', deactivateError);
        }
      }

      // Create new classification
      console.log('[Classification] Insert data:', JSON.stringify({ userId, ...data, effectiveFrom }, null, 2));
      const newClassification = await dbInsertUserClassification(
        { ...data, userId, effectiveFrom } as CreateClassificationRequest,
        currentUser?.id,
      );
      console.log('[Classification] Successfully inserted:', newClassification.id);
      queryClient.invalidateQueries({ queryKey: classificationQueryKeys.userClassifications() });

      toast({
        title: 'Success',
        description: existingClassifications.length > 0
          ? 'Classification updated successfully (previous classification deactivated)' 
          : 'Classification assigned successfully',
      });

      return newClassification;
    } catch (error: any) {
      console.error('[Classification] Error assigning classification:', {
        message: error.message,
        details: error.details || 'No details',
        hint: error.hint || 'No hint',
        code: error.code || 'No code',
        stack: error.stack,
      });
      toast({
        title: 'Error',
        description: error.message || 'Failed to assign classification',
        variant: 'destructive',
      });
      throw error;
    }
  }, [userClassifications, currentUser, toast, queryClient]);

  // Create fee structure
  const createFeeStructure = useCallback(async (data: CreateFeeStructureRequest): Promise<ClassificationFeeStructure | null> => {
    try {
      const newFeeStructure = await dbInsertFeeStructure(data, currentUser?.id);
      queryClient.invalidateQueries({ queryKey: classificationQueryKeys.feeStructures() });
      toast({ title: 'Success', description: 'Fee structure created successfully' });
      return newFeeStructure;
    } catch (error: any) {
      console.error('Error creating fee structure:', error);
      toast({ title: 'Error', description: error.message || 'Failed to create fee structure', variant: 'destructive' });
      return null;
    }
  }, [currentUser, toast, queryClient]);

  // Update fee structure
  const updateFeeStructure = useCallback(async (id: string, data: UpdateFeeStructureRequest): Promise<void> => {
    try {
      // AUTHORIZATION CHECK: Only admin and ICT roles can edit fee structures
      const userRole = currentUser?.role?.toLowerCase();
      const userRoles = currentUser?.roles?.map((r: string) => r.toLowerCase()) || [];
      const hasEditPermission =
        userRole === 'admin' || userRole === 'ict' ||
        userRoles.includes('admin') || userRoles.includes('ict');

      if (!hasEditPermission) {
        const errorMsg = 'Access Denied: Only administrators and ICT staff can edit fee structures';
        toast({ title: 'Authorization Error', description: errorMsg, variant: 'destructive' });
        throw new Error(errorMsg);
      }

      await dbUpdateFeeStructure(id, data, currentUser?.id);
      queryClient.invalidateQueries({ queryKey: classificationQueryKeys.feeStructures() });
      toast({ title: 'Success', description: 'Fee structure updated successfully' });
    } catch (error: any) {
      console.error('Error updating fee structure:', error);
      toast({ title: 'Error', description: error.message || 'Failed to update fee structure', variant: 'destructive' });
      throw error;
    }
  }, [currentUser, toast, queryClient]);

  // Deactivate fee structure
  const deactivateFeeStructure = useCallback(async (id: string, reason: string): Promise<void> => {
    try {
      await dbDeactivateFeeStructure(id, reason, currentUser?.id);
      queryClient.invalidateQueries({ queryKey: classificationQueryKeys.feeStructures() });
      toast({ title: 'Success', description: 'Fee structure deactivated successfully' });
    } catch (error: any) {
      console.error('Error deactivating fee structure:', error);
      toast({ title: 'Error', description: error.message || 'Failed to deactivate fee structure', variant: 'destructive' });
      throw error;
    }
  }, [currentUser, toast, queryClient]);

  // Get active fee structure
  const getActiveFeeStructure = useCallback((level: string, roleScope: string): ClassificationFeeStructure | null => {
    const now = new Date().toISOString();
    const structure = feeStructures.find(
      (fs) =>
        fs.classificationLevel === level &&
        fs.roleScope === roleScope &&
        fs.isActive &&
        fs.validFrom <= now &&
        (!fs.validUntil || fs.validUntil > now)
    );
    return structure || null;
  }, [feeStructures]);

  // Get classification history
  const getClassificationHistory = useCallback(async (userId: string): Promise<ClassificationHistory[]> => {
    try {
      const history = await dbFetchClassificationHistory(userId);
      setClassificationHistory((prev) => ({ ...prev, [userId]: history }));
      return history;
    } catch (error: any) {
      console.error('Error fetching classification history:', error);
      return [];
    }
  }, []);

  // Calculate site visit fee
  const calculateSiteVisitFee = useCallback(async (userId: string, siteVisitId: string): Promise<ClassificationFeeResult | null> => {
    const classification = getUserClassification(userId);
    if (!classification) {
      return null;
    }

    const feeStructure = getActiveFeeStructure(classification.classificationLevel, classification.roleScope);
    if (!feeStructure) {
      return null;
    }

    return {
      baseFeeCents: feeStructure.siteVisitBaseFeeCents,
      complexityMultiplier: feeStructure.complexityMultiplier,
    };
  }, [getUserClassification, getActiveFeeStructure]);

  // Get current user classifications with profile details
  const getCurrentUserClassifications = useCallback(async (): Promise<CurrentUserClassification[]> => {
    try {
      return await dbFetchCurrentUserClassifications();
    } catch (error: any) {
      console.error('Error fetching current user classifications:', error);
      return [];
    }
  }, []);

  const value: ClassificationContextType = {
    userClassifications,
    feeStructures,
    classificationHistory,
    loading,
    refreshUserClassifications,
    getUserClassification,
    createUserClassification,
    updateUserClassification,
    deactivateUserClassification,
    refreshFeeStructures,
    createFeeStructure,
    updateFeeStructure,
    deactivateFeeStructure,
    getActiveFeeStructure,
    getClassificationHistory,
    calculateSiteVisitFee,
    getCurrentUserClassifications,
    assignClassification,
  };

  return (
    <ClassificationContext.Provider value={value}>
      {children}
    </ClassificationContext.Provider>
  );
};

export const useClassification = () => {
  const context = useContext(ClassificationContext);
  if (!context) {
    throw new Error('useClassification must be used within a ClassificationProvider');
  }
  return context;
};
