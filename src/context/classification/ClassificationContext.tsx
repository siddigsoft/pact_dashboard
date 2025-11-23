import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
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
}

const ClassificationContext = createContext<ClassificationContextType | undefined>(undefined);

function transformUserClassificationFromDB(data: any): UserClassification {
  return {
    id: data.id,
    userId: data.user_id,
    classificationLevel: data.classification_level,
    roleScope: data.role_scope,
    effectiveFrom: data.effective_from,
    effectiveUntil: data.effective_until,
    hasRetainer: data.has_retainer,
    retainerAmountCents: parseInt(data.retainer_amount_cents || 0),
    retainerCurrency: data.retainer_currency,
    retainerFrequency: data.retainer_frequency,
    assignedBy: data.assigned_by,
    changeReason: data.change_reason,
    notes: data.notes,
    isActive: data.is_active,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function transformFeeStructureFromDB(data: any): ClassificationFeeStructure {
  return {
    id: data.id,
    classificationLevel: data.classification_level,
    roleScope: data.role_scope,
    siteVisitBaseFeeCents: parseInt(data.site_visit_base_fee_cents || 0),
    complexityMultiplier: parseFloat(data.complexity_multiplier || 1.0),
    currency: data.currency,
    validFrom: data.effective_from,
    validUntil: data.effective_until,
    metadata: data.metadata,
    isActive: data.is_active,
    createdBy: data.created_by,
    updatedBy: data.updated_by,
    changeNotes: data.change_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export const ClassificationProvider = ({ children }: { children: ReactNode }) => {
  const [userClassifications, setUserClassifications] = useState<UserClassification[]>([]);
  const [feeStructures, setFeeStructures] = useState<ClassificationFeeStructure[]>([]);
  const [classificationHistory, setClassificationHistory] = useState<Record<string, ClassificationHistory[]>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { currentUser } = useUser();

  // Fetch user classifications
  const refreshUserClassifications = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('user_classifications')
        .select('*')
        .order('effective_from', { ascending: false });

      if (error) throw error;

      if (data) {
        setUserClassifications(data.map(transformUserClassificationFromDB));
      }
    } catch (error: any) {
      console.error('Error fetching user classifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to load user classifications',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Fetch fee structures
  const refreshFeeStructures = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('classification_fee_structures')
        .select('*')
        .order('effective_from', { ascending: false });

      if (error) throw error;

      if (data) {
        setFeeStructures(data.map(transformFeeStructureFromDB));
      }
    } catch (error: any) {
      console.error('Error fetching fee structures:', error);
      toast({
        title: 'Error',
        description: 'Failed to load fee structures',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Initial data load
  useEffect(() => {
    refreshUserClassifications();
    refreshFeeStructures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime subscriptions for classification changes
  useEffect(() => {
    const classificationsChannel = supabase
      .channel('user_classifications_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_classifications' },
        (payload) => {
          console.log('Classification change:', payload);
          refreshUserClassifications();
          
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
        (payload) => {
          console.log('Fee structure change:', payload);
          refreshFeeStructures();
          
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const insertData = {
        user_id: data.userId,
        classification_level: data.classificationLevel,
        role_scope: data.roleScope,
        effective_from: data.effectiveFrom || new Date().toISOString(),
        effective_until: data.effectiveUntil,
        has_retainer: data.hasRetainer || false,
        retainer_amount_cents: data.retainerAmountCents || 0,
        retainer_currency: data.retainerCurrency || 'SDG',
        retainer_frequency: data.retainerFrequency || 'monthly',
        assigned_by: currentUser?.id,
        change_reason: data.changeReason,
        notes: data.notes,
        is_active: true,
      };

      const { data: result, error } = await supabase
        .from('user_classifications')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      const newClassification = transformUserClassificationFromDB(result);
      setUserClassifications((prev) => [newClassification, ...prev]);

      toast({
        title: 'Success',
        description: 'Classification assigned successfully',
      });

      return newClassification;
    } catch (error: any) {
      console.error('Error creating classification:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create classification',
        variant: 'destructive',
      });
      return null;
    }
  }, [currentUser, toast]);

  // Update user classification
  const updateUserClassification = useCallback(async (id: string, data: UpdateClassificationRequest): Promise<void> => {
    try {
      const updateData: any = {};
      
      if (data.classificationLevel !== undefined) updateData.classification_level = data.classificationLevel;
      if (data.roleScope !== undefined) updateData.role_scope = data.roleScope;
      if (data.effectiveFrom !== undefined) updateData.effective_from = data.effectiveFrom;
      if (data.effectiveUntil !== undefined) updateData.effective_until = data.effectiveUntil;
      if (data.hasRetainer !== undefined) updateData.has_retainer = data.hasRetainer;
      if (data.retainerAmountCents !== undefined) updateData.retainer_amount_cents = data.retainerAmountCents;
      if (data.retainerCurrency !== undefined) updateData.retainer_currency = data.retainerCurrency;
      if (data.retainerFrequency !== undefined) updateData.retainer_frequency = data.retainerFrequency;
      if (data.changeReason !== undefined) updateData.change_reason = data.changeReason;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;

      const { error } = await supabase
        .from('user_classifications')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      await refreshUserClassifications();

      toast({
        title: 'Success',
        description: 'Classification updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating classification:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update classification',
        variant: 'destructive',
      });
      throw error;
    }
  }, [refreshUserClassifications, toast]);

  // Deactivate user classification
  const deactivateUserClassification = useCallback(async (id: string, reason: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('user_classifications')
        .update({
          is_active: false,
          effective_until: new Date().toISOString(),
          change_reason: reason,
        })
        .eq('id', id);

      if (error) throw error;

      await refreshUserClassifications();

      toast({
        title: 'Success',
        description: 'Classification deactivated successfully',
      });
    } catch (error: any) {
      console.error('Error deactivating classification:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to deactivate classification',
        variant: 'destructive',
      });
      throw error;
    }
  }, [refreshUserClassifications, toast]);

  // Create fee structure
  const createFeeStructure = useCallback(async (data: CreateFeeStructureRequest): Promise<ClassificationFeeStructure | null> => {
    try {
      const insertData = {
        classification_level: data.classificationLevel,
        role_scope: data.roleScope,
        site_visit_base_fee_cents: data.siteVisitBaseFeeCents,
        complexity_multiplier: data.complexityMultiplier || 1.0,
        currency: data.currency || 'SDG',
        valid_from: data.validFrom || new Date().toISOString(),
        valid_until: data.validUntil,
        metadata: data.metadata,
        change_notes: data.changeNotes,
        created_by: currentUser?.id,
        is_active: true,
      };

      const { data: result, error } = await supabase
        .from('classification_fee_structures')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      const newFeeStructure = transformFeeStructureFromDB(result);
      setFeeStructures((prev) => [newFeeStructure, ...prev]);

      toast({
        title: 'Success',
        description: 'Fee structure created successfully',
      });

      return newFeeStructure;
    } catch (error: any) {
      console.error('Error creating fee structure:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create fee structure',
        variant: 'destructive',
      });
      return null;
    }
  }, [currentUser, toast]);

  // Update fee structure
  const updateFeeStructure = useCallback(async (id: string, data: UpdateFeeStructureRequest): Promise<void> => {
    try {
      // AUTHORIZATION CHECK: Only admin and ICT roles can edit fee structures
      const userRole = currentUser?.role?.toLowerCase();
      const userRoles = currentUser?.roles?.map((r: string) => r.toLowerCase()) || [];
      const hasEditPermission = 
        userRole === 'admin' || 
        userRole === 'ict' ||
        userRoles.includes('admin') ||
        userRoles.includes('ict');

      if (!hasEditPermission) {
        const errorMsg = 'Access Denied: Only administrators and ICT staff can edit fee structures';
        toast({
          title: 'Authorization Error',
          description: errorMsg,
          variant: 'destructive',
        });
        throw new Error(errorMsg);
      }

      const updateData: any = { updated_by: currentUser?.id };
      
      if (data.siteVisitBaseFeeCents !== undefined) updateData.site_visit_base_fee_cents = data.siteVisitBaseFeeCents;
      if (data.complexityMultiplier !== undefined) updateData.complexity_multiplier = data.complexityMultiplier;
      if (data.validFrom !== undefined) updateData.valid_from = data.validFrom;
      if (data.validUntil !== undefined) updateData.valid_until = data.validUntil;
      if (data.metadata !== undefined) updateData.metadata = data.metadata;
      if (data.changeNotes !== undefined) updateData.change_notes = data.changeNotes;
      if (data.isActive !== undefined) updateData.is_active = data.isActive;

      const { error } = await supabase
        .from('classification_fee_structures')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      await refreshFeeStructures();

      toast({
        title: 'Success',
        description: 'Fee structure updated successfully',
      });
    } catch (error: any) {
      console.error('Error updating fee structure:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update fee structure',
        variant: 'destructive',
      });
      throw error;
    }
  }, [currentUser, refreshFeeStructures, toast]);

  // Deactivate fee structure
  const deactivateFeeStructure = useCallback(async (id: string, reason: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('classification_fee_structures')
        .update({
          is_active: false,
          valid_until: new Date().toISOString(),
          change_notes: reason,
          updated_by: currentUser?.id,
        })
        .eq('id', id);

      if (error) throw error;

      await refreshFeeStructures();

      toast({
        title: 'Success',
        description: 'Fee structure deactivated successfully',
      });
    } catch (error: any) {
      console.error('Error deactivating fee structure:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to deactivate fee structure',
        variant: 'destructive',
      });
      throw error;
    }
  }, [currentUser, refreshFeeStructures, toast]);

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
      const { data, error } = await supabase
        .from('user_classifications')
        .select(`
          id,
          classification_level,
          role_scope,
          effective_from,
          effective_until,
          assigned_by,
          change_reason,
          created_at
        `)
        .eq('user_id', userId)
        .order('effective_from', { ascending: false });

      if (error) throw error;

      const history: ClassificationHistory[] = (data || []).map((item: any) => ({
        id: item.id,
        classificationLevel: item.classification_level,
        roleScope: item.role_scope,
        effectiveFrom: item.effective_from,
        effectiveUntil: item.effective_until,
        assignedBy: item.assigned_by,
        changeReason: item.change_reason,
        createdAt: item.created_at,
      }));

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
      const { data, error } = await supabase
        .from('user_classifications')
        .select(`
          *,
          profiles!user_classifications_user_id_fkey (
            full_name,
            email,
            role
          )
        `);

      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        userId: item.user_id,
        classificationLevel: item.classification_level,
        roleScope: item.role_scope,
        effectiveFrom: item.effective_from,
        effectiveUntil: item.effective_until,
        hasRetainer: item.has_retainer,
        retainerAmountCents: parseInt(item.retainer_amount_cents || 0),
        retainerCurrency: item.retainer_currency,
        retainerFrequency: item.retainer_frequency,
        assignedBy: item.assigned_by,
        changeReason: item.change_reason,
        notes: item.notes,
        isActive: item.is_active,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        fullName: item.profiles?.full_name || '',
        email: item.profiles?.email || '',
        userRole: item.profiles?.role || '',
      }));
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
