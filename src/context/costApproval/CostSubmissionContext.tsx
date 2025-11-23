/**
 * Cost Submission Context
 * 
 * Provides React Query hooks and state management for cost submission system.
 * Handles enumerator submissions, admin/finance approvals, and payment workflow.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import {
  SiteVisitCostSubmission,
  CostApprovalHistory,
  PendingCostApproval,
  UserCostSubmissionSummary,
  MmpCostSubmissionSummary,
  CreateCostSubmissionRequest,
  UpdateCostSubmissionRequest,
  ReviewCostSubmissionRequest
} from '@/types/cost-submission';
import * as supabaseApi from './supabase';

interface CostSubmissionContextValue {
  // Query hooks
  useAllSubmissions: () => {
    submissions: SiteVisitCostSubmission[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  };
  
  useSubmissionById: (id: string) => {
    submission: SiteVisitCostSubmission | undefined;
    isLoading: boolean;
    error: Error | null;
  };
  
  useUserSubmissions: (userId: string) => {
    submissions: SiteVisitCostSubmission[];
    isLoading: boolean;
    error: Error | null;
  };
  
  usePendingApprovals: () => {
    approvals: PendingCostApproval[];
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
  };
  
  useSubmissionHistory: (submissionId: string) => {
    history: CostApprovalHistory[];
    isLoading: boolean;
    error: Error | null;
  };
  
  useUserSummary: (userId: string) => {
    summary: UserCostSubmissionSummary | undefined;
    isLoading: boolean;
    error: Error | null;
  };
  
  useMMPSummary: (mmpFileId: string) => {
    summary: MmpCostSubmissionSummary | undefined;
    isLoading: boolean;
    error: Error | null;
  };
  
  // Mutation hooks
  useCreateSubmission: () => {
    mutate: (request: CreateCostSubmissionRequest) => Promise<void>;
    isPending: boolean;
  };
  
  useUpdateSubmission: () => {
    mutate: (params: { id: string; request: UpdateCostSubmissionRequest }) => Promise<void>;
    isPending: boolean;
  };
  
  useReviewSubmission: () => {
    mutate: (request: ReviewCostSubmissionRequest) => Promise<void>;
    isPending: boolean;
  };
  
  useMarkPaid: () => {
    mutate: (params: { submissionId: string; walletTransactionId: string; paidAmountCents?: number }) => Promise<void>;
    isPending: boolean;
  };
  
  useCancelSubmission: () => {
    mutate: (id: string) => Promise<void>;
    isPending: boolean;
  };
  
  useDeleteSubmission: () => {
    mutate: (id: string) => Promise<void>;
    isPending: boolean;
  };
}

const CostSubmissionContext = createContext<CostSubmissionContextValue | undefined>(undefined);

export const useCostSubmissionContext = () => {
  const context = useContext(CostSubmissionContext);
  if (!context) {
    throw new Error('useCostSubmissionContext must be used within CostSubmissionProvider');
  }
  return context;
};

interface CostSubmissionProviderProps {
  children: ReactNode;
}

export const CostSubmissionProvider: React.FC<CostSubmissionProviderProps> = ({ children }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query hook: All submissions
  const useAllSubmissions = () => {
    const { data, isLoading, error, refetch } = useQuery({
      queryKey: ['cost-submissions'],
      queryFn: supabaseApi.fetchCostSubmissions,
      staleTime: 1000 * 60 * 5 // 5 minutes
    });

    return {
      submissions: data || [],
      isLoading,
      error: error as Error | null,
      refetch
    };
  };

  // Query hook: Submission by ID
  const useSubmissionById = (id: string) => {
    const { data, isLoading, error } = useQuery({
      queryKey: ['cost-submissions', id],
      queryFn: () => supabaseApi.fetchCostSubmissionById(id),
      enabled: !!id,
      staleTime: 1000 * 60 * 5
    });

    return {
      submission: data,
      isLoading,
      error: error as Error | null
    };
  };

  // Query hook: User submissions
  const useUserSubmissions = (userId: string) => {
    const { data, isLoading, error } = useQuery({
      queryKey: ['cost-submissions', 'user', userId],
      queryFn: () => supabaseApi.fetchUserCostSubmissions(userId),
      enabled: !!userId,
      staleTime: 1000 * 60 * 5
    });

    return {
      submissions: data || [],
      isLoading,
      error: error as Error | null
    };
  };

  // Query hook: Pending approvals
  const usePendingApprovals = () => {
    const { data, isLoading, error, refetch } = useQuery({
      queryKey: ['cost-approvals', 'pending'],
      queryFn: supabaseApi.fetchPendingApprovals,
      staleTime: 1000 * 60 * 2 // 2 minutes (more frequent for approval queue)
    });

    return {
      approvals: data || [],
      isLoading,
      error: error as Error | null,
      refetch
    };
  };

  // Query hook: Submission history
  const useSubmissionHistory = (submissionId: string) => {
    const { data, isLoading, error } = useQuery({
      queryKey: ['cost-submissions', submissionId, 'history'],
      queryFn: () => supabaseApi.fetchSubmissionHistory(submissionId),
      enabled: !!submissionId,
      staleTime: 1000 * 60 * 5
    });

    return {
      history: data || [],
      isLoading,
      error: error as Error | null
    };
  };

  // Query hook: User summary
  const useUserSummary = (userId: string) => {
    const { data, isLoading, error } = useQuery({
      queryKey: ['cost-submissions', 'summary', 'user', userId],
      queryFn: () => supabaseApi.fetchUserSummary(userId),
      enabled: !!userId,
      staleTime: 1000 * 60 * 10 // 10 minutes
    });

    return {
      summary: data,
      isLoading,
      error: error as Error | null
    };
  };

  // Query hook: MMP summary
  const useMMPSummary = (mmpFileId: string) => {
    const { data, isLoading, error } = useQuery({
      queryKey: ['cost-submissions', 'summary', 'mmp', mmpFileId],
      queryFn: () => supabaseApi.fetchMMPSummary(mmpFileId),
      enabled: !!mmpFileId,
      staleTime: 1000 * 60 * 10
    });

    return {
      summary: data,
      isLoading,
      error: error as Error | null
    };
  };

  // Mutation hook: Create submission
  const useCreateSubmission = () => {
    const mutation = useMutation({
      mutationFn: async (request: CreateCostSubmissionRequest) => {
        const user = await queryClient.fetchQuery({
          queryKey: ['user'],
          staleTime: 1000 * 60 * 5
        }) as any;
        
        if (!user?.id) {
          throw new Error('User not authenticated');
        }

        await supabaseApi.createCostSubmission(request, user.id);
      },
      onSuccess: (_, request) => {
        // Invalidate all relevant caches
        queryClient.invalidateQueries({ queryKey: ['cost-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['cost-approvals', 'pending'] });
        // Invalidate user-specific and site-specific caches
        queryClient.invalidateQueries({ queryKey: ['cost-submissions', 'user'] });
        queryClient.invalidateQueries({ queryKey: ['cost-submissions', 'summary'] });
        toast({
          title: 'Success',
          description: 'Cost submission created successfully'
        });
      },
      onError: (error: Error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to create cost submission',
          variant: 'destructive'
        });
      }
    });

    return {
      mutate: mutation.mutateAsync,
      isPending: mutation.isPending
    };
  };

  // Mutation hook: Update submission
  const useUpdateSubmission = () => {
    const mutation = useMutation({
      mutationFn: async (params: { id: string; request: UpdateCostSubmissionRequest }) => {
        await supabaseApi.updateCostSubmission(params.id, params.request);
      },
      onSuccess: (_, params) => {
        // Invalidate all relevant caches including specific submission
        queryClient.invalidateQueries({ queryKey: ['cost-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['cost-submissions', params.id] });
        queryClient.invalidateQueries({ queryKey: ['cost-approvals', 'pending'] });
        toast({
          title: 'Success',
          description: 'Cost submission updated successfully'
        });
      },
      onError: (error: Error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update cost submission',
          variant: 'destructive'
        });
      }
    });

    return {
      mutate: mutation.mutateAsync,
      isPending: mutation.isPending
    };
  };

  // Mutation hook: Review submission
  const useReviewSubmission = () => {
    const mutation = useMutation({
      mutationFn: async (request: ReviewCostSubmissionRequest) => {
        const user = await queryClient.fetchQuery({
          queryKey: ['user'],
          staleTime: 1000 * 60 * 5
        }) as any;
        
        if (!user?.id) {
          throw new Error('User not authenticated');
        }

        await supabaseApi.reviewCostSubmission(request, user.id);
      },
      onSuccess: (_, request) => {
        // Invalidate all relevant caches
        queryClient.invalidateQueries({ queryKey: ['cost-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['cost-submissions', request.submissionId] });
        queryClient.invalidateQueries({ queryKey: ['cost-approvals', 'pending'] });
        queryClient.invalidateQueries({ queryKey: ['cost-submissions', 'summary'] });
        toast({
          title: 'Success',
          description: 'Cost submission reviewed successfully'
        });
      },
      onError: (error: Error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to review cost submission',
          variant: 'destructive'
        });
      }
    });

    return {
      mutate: mutation.mutateAsync,
      isPending: mutation.isPending
    };
  };

  // Mutation hook: Mark paid
  const useMarkPaid = () => {
    const mutation = useMutation({
      mutationFn: async (params: { submissionId: string; walletTransactionId: string; paidAmountCents?: number }) => {
        await supabaseApi.markCostSubmissionPaid(params.submissionId, params.walletTransactionId, params.paidAmountCents);
      },
      onSuccess: (_, params) => {
        // Invalidate all relevant caches including wallet
        queryClient.invalidateQueries({ queryKey: ['cost-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['cost-submissions', params.submissionId] });
        queryClient.invalidateQueries({ queryKey: ['cost-approvals', 'pending'] });
        queryClient.invalidateQueries({ queryKey: ['cost-submissions', 'summary'] });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        queryClient.invalidateQueries({ queryKey: ['walletTransactions'] });
        toast({
          title: 'Success',
          description: 'Payment processed successfully'
        });
      },
      onError: (error: Error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to process payment',
          variant: 'destructive'
        });
      }
    });

    return {
      mutate: mutation.mutateAsync,
      isPending: mutation.isPending
    };
  };

  // Mutation hook: Cancel submission
  const useCancelSubmission = () => {
    const mutation = useMutation({
      mutationFn: async (id: string) => {
        const user = await queryClient.fetchQuery({
          queryKey: ['user'],
          staleTime: 1000 * 60 * 5
        }) as any;
        
        if (!user?.id) {
          throw new Error('User not authenticated');
        }

        await supabaseApi.cancelCostSubmission(id, user.id);
      },
      onSuccess: async (_, id) => {
        // Get user ID for user-specific cache invalidation
        const user = await queryClient.fetchQuery({
          queryKey: ['user'],
          staleTime: 1000 * 60 * 5
        }) as any;
        
        // Invalidate all relevant caches including user-specific
        queryClient.invalidateQueries({ queryKey: ['cost-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['cost-submissions', id] });
        queryClient.invalidateQueries({ queryKey: ['cost-approvals', 'pending'] });
        if (user?.id) {
          queryClient.invalidateQueries({ queryKey: ['cost-submissions', 'user', user.id] });
          queryClient.invalidateQueries({ queryKey: ['cost-submissions', 'summary', 'user', user.id] });
        }
        toast({
          title: 'Success',
          description: 'Cost submission cancelled'
        });
      },
      onError: (error: Error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to cancel cost submission',
          variant: 'destructive'
        });
      }
    });

    return {
      mutate: mutation.mutateAsync,
      isPending: mutation.isPending
    };
  };

  // Mutation hook: Delete submission
  const useDeleteSubmission = () => {
    const mutation = useMutation({
      mutationFn: async (id: string) => {
        const user = await queryClient.fetchQuery({
          queryKey: ['user'],
          staleTime: 1000 * 60 * 5
        }) as any;
        
        if (!user?.id) {
          throw new Error('User not authenticated');
        }

        await supabaseApi.deleteCostSubmission(id, user.id);
      },
      onSuccess: async (_, id) => {
        // Get user ID for user-specific cache invalidation
        const user = await queryClient.fetchQuery({
          queryKey: ['user'],
          staleTime: 1000 * 60 * 5
        }) as any;
        
        // Invalidate all relevant caches including user-specific
        queryClient.invalidateQueries({ queryKey: ['cost-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['cost-approvals', 'pending'] });
        if (user?.id) {
          queryClient.invalidateQueries({ queryKey: ['cost-submissions', 'user', user.id] });
          queryClient.invalidateQueries({ queryKey: ['cost-submissions', 'summary', 'user', user.id] });
        }
        toast({
          title: 'Success',
          description: 'Cost submission deleted'
        });
      },
      onError: (error: Error) => {
        toast({
          title: 'Error',
          description: error.message || 'Failed to delete cost submission',
          variant: 'destructive'
        });
      }
    });

    return {
      mutate: mutation.mutateAsync,
      isPending: mutation.isPending
    };
  };

  const value: CostSubmissionContextValue = {
    useAllSubmissions,
    useSubmissionById,
    useUserSubmissions,
    usePendingApprovals,
    useSubmissionHistory,
    useUserSummary,
    useMMPSummary,
    useCreateSubmission,
    useUpdateSubmission,
    useReviewSubmission,
    useMarkPaid,
    useCancelSubmission,
    useDeleteSubmission
  };

  return (
    <CostSubmissionContext.Provider value={value}>
      {children}
    </CostSubmissionContext.Provider>
  );
};

// Export convenience hooks for direct use
export const useCostSubmissions = () => {
  const context = useCostSubmissionContext();
  return context.useAllSubmissions();
};

export const useCostSubmission = (id: string) => {
  const context = useCostSubmissionContext();
  return context.useSubmissionById(id);
};

export const useUserCostSubmissions = (userId: string) => {
  const context = useCostSubmissionContext();
  return context.useUserSubmissions(userId);
};

export const usePendingCostApprovals = () => {
  const context = useCostSubmissionContext();
  return context.usePendingApprovals();
};

export const useCostSubmissionHistory = (submissionId: string) => {
  const context = useCostSubmissionContext();
  return context.useSubmissionHistory(submissionId);
};

export const useUserCostSummary = (userId: string) => {
  const context = useCostSubmissionContext();
  return context.useUserSummary(userId);
};

export const useMMPCostSummary = (mmpFileId: string) => {
  const context = useCostSubmissionContext();
  return context.useMMPSummary(mmpFileId);
};
