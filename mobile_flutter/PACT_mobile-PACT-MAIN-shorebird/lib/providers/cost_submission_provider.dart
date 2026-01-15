import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../models/cost_submission_models.dart';
import '../repositories/cost_submission_repository.dart';
import '../services/cost_submission_service.dart';
import '../services/budget_restriction_service.dart';
import '../services/cache_service.dart';
import '../services/notification_service.dart';

// Supabase client provider
final supabaseClientProvider = Provider<SupabaseClient>((ref) {
  return Supabase.instance.client;
});

// Cost submission repository provider
final costSubmissionRepositoryProvider = Provider<CostSubmissionRepository>((ref) {
  final supabase = ref.watch(supabaseClientProvider);
  return CostSubmissionRepository(supabase);
});

// Cost submission service provider
final costSubmissionServiceProvider = Provider<CostSubmissionService>((ref) {
  return CostSubmissionService();
});

// Budget restriction service provider
final budgetRestrictionServiceProvider = Provider<BudgetRestrictionService>((ref) {
  return BudgetRestrictionService();
});

// Current user ID provider (assumes user is authenticated)
final currentUserIdProvider = Provider<String>((ref) {
  final supabase = ref.watch(supabaseClientProvider);
  return supabase.auth.currentUser?.id ?? '';
});

// Stream provider for user's cost submissions (real-time)
final userCostSubmissionsStreamProvider = StreamProvider.autoDispose<List<CostSubmission>>((ref) {
  final repository = ref.watch(costSubmissionRepositoryProvider);
  final userId = ref.watch(currentUserIdProvider);
  
  if (userId.isEmpty) {
    return Stream.value([]);
  }
  
  return repository.watchUserCostSubmissions(userId);
});

// Future provider for user's cost submissions
final userCostSubmissionsProvider = FutureProvider.autoDispose<List<CostSubmission>>((ref) async {
  final repository = ref.watch(costSubmissionRepositoryProvider);
  final userId = ref.watch(currentUserIdProvider);
  
  if (userId.isEmpty) {
    return [];
  }
  
  return repository.getUserCostSubmissions(userId);
});

// Provider for cost submissions filtered by status
final costSubmissionsByStatusProvider = FutureProvider.autoDispose.family<List<CostSubmission>, CostSubmissionStatus?>((ref, status) async {
  final repository = ref.watch(costSubmissionRepositoryProvider);
  final userId = ref.watch(currentUserIdProvider);
  
  if (userId.isEmpty) {
    return [];
  }
  
  if (status == null) {
    return repository.getUserCostSubmissions(userId);
  }
  
  return repository.getCostSubmissionsByStatus(userId, status);
});

// Provider for single cost submission by ID
final costSubmissionByIdProvider = FutureProvider.autoDispose.family<CostSubmission?, String>((ref, id) async {
  final repository = ref.watch(costSubmissionRepositoryProvider);
  return repository.getCostSubmissionById(id);
});

// Provider for cost submission statistics
final costSubmissionStatsProvider = FutureProvider.autoDispose<CostSubmissionStats>((ref) async {
  final repository = ref.watch(costSubmissionRepositoryProvider);
  final userId = ref.watch(currentUserIdProvider);
  
  if (userId.isEmpty) {
    return CostSubmissionStats();
  }
  
  return repository.getCostSubmissionStats(userId);
});

// State provider for selected status filter
final selectedStatusFilterProvider = StateProvider.autoDispose<CostSubmissionStatus?>((ref) => null);

// State provider for search query
final costSubmissionSearchQueryProvider = StateProvider.autoDispose<String>((ref) => '');

// Provider for filtered and searched cost submissions
final filteredCostSubmissionsProvider = FutureProvider.autoDispose<List<CostSubmission>>((ref) async {
  final submissions = await ref.watch(userCostSubmissionsProvider.future);
  final statusFilter = ref.watch(selectedStatusFilterProvider);
  final searchQuery = ref.watch(costSubmissionSearchQueryProvider);
  final service = ref.watch(costSubmissionServiceProvider);
  
  var filtered = submissions;
  
  // Apply status filter
  if (statusFilter != null) {
    filtered = service.filterByStatus(filtered, statusFilter);
  }
  
  // Apply search filter
  if (searchQuery.isNotEmpty) {
    filtered = filtered.where((submission) {
      final lowerQuery = searchQuery.toLowerCase();
      return submission.siteVisitId.toLowerCase().contains(lowerQuery) ||
             submission.submissionNotes?.toLowerCase().contains(lowerQuery) == true ||
             submission.transportationDetails?.toLowerCase().contains(lowerQuery) == true ||
             submission.accommodationDetails?.toLowerCase().contains(lowerQuery) == true;
    }).toList();
  }
  
  return filtered;
});

// State notifier for creating cost submission
class CreateCostSubmissionNotifier extends StateNotifier<AsyncValue<CostSubmission?>> {
  CreateCostSubmissionNotifier(this.ref) : super(const AsyncValue.data(null));

  final Ref ref;

  Future<void> create(CreateCostSubmissionRequest request) async {
    state = const AsyncValue.loading();

    try {
      final repository = ref.read(costSubmissionRepositoryProvider);
      final userId = ref.read(currentUserIdProvider);
      final budgetService = ref.read(budgetRestrictionServiceProvider);

      if (userId.isEmpty) {
        throw CostSubmissionException('User not authenticated');
      }

      // Calculate total cost
      final totalCostCents = request.transportationCostCents +
                           request.accommodationCostCents +
                           request.mealAllowanceCents +
                           request.otherCostsCents;

      // Check connectivity
      final connectivityResult = await Connectivity().checkConnectivity();
      final isOnline = connectivityResult != ConnectivityResult.none;

      if (isOnline) {
        // Online: Perform normal validation and submission
        // Check budget restrictions
        final budgetCheck = await budgetService.checkCostSubmissionBudget(
          siteVisitId: request.siteVisitId,
          totalCostCents: totalCostCents,
          userId: userId,
        );

        if (!budgetCheck.allowed) {
          throw CostSubmissionException(budgetCheck.message ?? 'Budget restriction violated');
        }

        // Check monthly submission limits
        final monthlyCheck = await budgetService.checkMonthlySubmissionLimit(
          userId: userId,
          totalCostCents: totalCostCents,
        );

        if (!monthlyCheck.allowed) {
          throw CostSubmissionException(monthlyCheck.message ?? 'Monthly limit exceeded');
        }

        final submission = await repository.createCostSubmission(request, userId);
        state = AsyncValue.data(submission);
      } else {
        // Offline: Cache submission for later sync
        final submissionData = {
          'siteVisitId': request.siteVisitId,
          'transportationCostCents': request.transportationCostCents,
          'accommodationCostCents': request.accommodationCostCents,
          'mealAllowanceCents': request.mealAllowanceCents,
          'otherCostsCents': request.otherCostsCents,
          'transportationDetails': request.transportationDetails,
          'accommodationDetails': request.accommodationDetails,
          'mealDetails': request.mealDetails,
          'otherCostsDetails': request.otherCostsDetails,
          'submissionNotes': request.submissionNotes,
          'currency': request.currency,
          'supportingDocuments': request.supportingDocuments?.map((doc) => doc.toJson()).toList(),
          'userId': userId,
          'totalCostCents': totalCostCents,
          'createdAt': DateTime.now().toIso8601String(),
        };

        await SubmissionCacheService.cacheSubmissionForOffline(submissionData);

        // Create a temporary offline submission object
        final offlineSubmission = CostSubmission(
          id: 'offline_${DateTime.now().millisecondsSinceEpoch}',
          siteVisitId: request.siteVisitId,
          mmpFileId: null,
          projectId: null,
          submittedBy: userId,
          submittedAt: DateTime.now(),
          transportationCostCents: request.transportationCostCents,
          accommodationCostCents: request.accommodationCostCents,
          mealAllowanceCents: request.mealAllowanceCents,
          otherCostsCents: request.otherCostsCents,
          totalCostCents: totalCostCents,
          currency: request.currency ?? 'UGX',
          transportationDetails: request.transportationDetails,
          accommodationDetails: request.accommodationDetails,
          mealDetails: request.mealDetails,
          otherCostsDetails: request.otherCostsDetails,
          submissionNotes: request.submissionNotes,
          supportingDocuments: request.supportingDocuments ?? [],
          status: CostSubmissionStatus.pending,
          reviewedBy: null,
          reviewedAt: null,
          reviewerNotes: null,
          approvalNotes: null,
          walletTransactionId: null,
          paidAt: null,
          paidAmountCents: null,
          paymentNotes: null,
          classificationLevel: null,
          roleScope: null,
          revisionRequested: false,
          revisionNotes: null,
          revisionCount: 0,
          createdAt: DateTime.now(),
          updatedAt: DateTime.now(),
        );

        state = AsyncValue.data(offlineSubmission);
      }

      // Invalidate related providers
      ref.invalidate(userCostSubmissionsProvider);
      ref.invalidate(userCostSubmissionsStreamProvider);
      ref.invalidate(costSubmissionStatsProvider);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final createCostSubmissionProvider = StateNotifierProvider.autoDispose<CreateCostSubmissionNotifier, AsyncValue<CostSubmission?>>((ref) {
  return CreateCostSubmissionNotifier(ref);
});

// Provider for offline submissions
final offlineSubmissionsProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  return SubmissionCacheService.getCachedSubmissions();
});

// Provider to check if there are offline submissions
final hasOfflineSubmissionsProvider = FutureProvider<bool>((ref) async {
  return SubmissionCacheService.hasOfflineSubmissions();
});

// State notifier for syncing offline submissions
class SyncOfflineSubmissionsNotifier extends StateNotifier<AsyncValue<int>> {
  SyncOfflineSubmissionsNotifier(this.ref) : super(const AsyncValue.data(0));

  final Ref ref;

  Future<void> syncOfflineSubmissions() async {
    state = const AsyncValue.loading();

    try {
      final cachedSubmissions = await SubmissionCacheService.getCachedSubmissions();
      if (cachedSubmissions.isEmpty) {
        state = const AsyncValue.data(0);
        return;
      }

      final repository = ref.read(costSubmissionRepositoryProvider);
      final budgetService = ref.read(budgetRestrictionServiceProvider);
      int syncedCount = 0;

      for (final cachedSubmission in cachedSubmissions) {
        try {
          final userId = cachedSubmission['userId'] as String;
          final totalCostCents = cachedSubmission['totalCostCents'] as int;

          // Re-validate budget when syncing (in case budget changed while offline)
          final budgetCheck = await budgetService.checkCostSubmissionBudget(
            siteVisitId: cachedSubmission['siteVisitId'] as String,
            totalCostCents: totalCostCents,
            userId: userId,
          );

          if (budgetCheck.allowed) {
            // Convert cached data back to request format
            final request = CreateCostSubmissionRequest(
              siteVisitId: cachedSubmission['siteVisitId'] as String,
              transportationCostCents: cachedSubmission['transportationCostCents'] as int,
              accommodationCostCents: cachedSubmission['accommodationCostCents'] as int,
              mealAllowanceCents: cachedSubmission['mealAllowanceCents'] as int,
              otherCostsCents: cachedSubmission['otherCostsCents'] as int,
              transportationDetails: cachedSubmission['transportationDetails'] as String?,
              accommodationDetails: cachedSubmission['accommodationDetails'] as String?,
              mealDetails: cachedSubmission['mealDetails'] as String?,
              otherCostsDetails: cachedSubmission['otherCostsDetails'] as String?,
              submissionNotes: cachedSubmission['submissionNotes'] as String?,
              currency: cachedSubmission['currency'] as String,
              supportingDocuments: (cachedSubmission['supportingDocuments'] as List<dynamic>?)
                  ?.map((doc) => SupportingDocument.fromJson(doc as Map<String, dynamic>))
                  .toList(),
            );

            await repository.createCostSubmission(request, userId);
            await SubmissionCacheService.removeCachedSubmission(cachedSubmission['id'] as String);
            syncedCount++;
          }
        } catch (e) {
          // Log error but continue with other submissions
          print('Failed to sync submission ${cachedSubmission['id']}: $e');
        }
      }

      state = AsyncValue.data(syncedCount);

      // Show notification for successful sync
      if (syncedCount > 0) {
        await NotificationService.showOfflineSyncCompletedNotification(
          syncedCount: syncedCount,
        );
      }

      // Invalidate related providers
      ref.invalidate(userCostSubmissionsProvider);
      ref.invalidate(userCostSubmissionsStreamProvider);
      ref.invalidate(costSubmissionStatsProvider);
      ref.invalidate(offlineSubmissionsProvider);
      ref.invalidate(hasOfflineSubmissionsProvider);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }
}

final syncOfflineSubmissionsProvider = StateNotifierProvider.autoDispose<SyncOfflineSubmissionsNotifier, AsyncValue<int>>((ref) {
  return SyncOfflineSubmissionsNotifier(ref);
});

// State notifier for updating cost submission
class UpdateCostSubmissionNotifier extends StateNotifier<AsyncValue<CostSubmission?>> {
  UpdateCostSubmissionNotifier(this.ref) : super(const AsyncValue.data(null));

  final Ref ref;

  Future<void> update(String id, UpdateCostSubmissionRequest request) async {
    state = const AsyncValue.loading();
    
    try {
      final repository = ref.read(costSubmissionRepositoryProvider);
      final submission = await repository.updateCostSubmission(id, request);
      state = AsyncValue.data(submission);
      
      // Invalidate related providers
      ref.invalidate(userCostSubmissionsProvider);
      ref.invalidate(userCostSubmissionsStreamProvider);
      ref.invalidate(costSubmissionStatsProvider);
      ref.invalidate(costSubmissionByIdProvider(id));
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final updateCostSubmissionProvider = StateNotifierProvider.autoDispose<UpdateCostSubmissionNotifier, AsyncValue<CostSubmission?>>((ref) {
  return UpdateCostSubmissionNotifier(ref);
});

// State notifier for cancelling cost submission
class CancelCostSubmissionNotifier extends StateNotifier<AsyncValue<CostSubmission?>> {
  CancelCostSubmissionNotifier(this.ref) : super(const AsyncValue.data(null));

  final Ref ref;

  Future<void> cancel(String id) async {
    state = const AsyncValue.loading();
    
    try {
      final repository = ref.read(costSubmissionRepositoryProvider);
      final submission = await repository.cancelCostSubmission(id);
      state = AsyncValue.data(submission);
      
      // Invalidate related providers
      ref.invalidate(userCostSubmissionsProvider);
      ref.invalidate(userCostSubmissionsStreamProvider);
      ref.invalidate(costSubmissionStatsProvider);
      ref.invalidate(costSubmissionByIdProvider(id));
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final cancelCostSubmissionProvider = StateNotifierProvider.autoDispose<CancelCostSubmissionNotifier, AsyncValue<CostSubmission?>>((ref) {
  return CancelCostSubmissionNotifier(ref);
});

// Provider for pending cost submissions count
final pendingCostSubmissionsCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final stats = await ref.watch(costSubmissionStatsProvider.future);
  return stats.pendingCount;
});

// Provider for total pending amount
final totalPendingAmountProvider = FutureProvider.autoDispose<int>((ref) async {
  final stats = await ref.watch(costSubmissionStatsProvider.future);
  return stats.totalPendingAmountCents;
});

// Provider for total approved amount
final totalApprovedAmountProvider = FutureProvider.autoDispose<int>((ref) async {
  final stats = await ref.watch(costSubmissionStatsProvider.future);
  return stats.totalApprovedAmountCents;
});

// Provider for total paid amount
final totalPaidAmountProvider = FutureProvider.autoDispose<int>((ref) async {
  final stats = await ref.watch(costSubmissionStatsProvider.future);
  return stats.totalPaidAmountCents;
});

// ============================================================================
// NEW PROVIDERS FOR IMPROVEMENTS
// ============================================================================

// Provider for revision requested submissions
final revisionRequestedProvider = FutureProvider.autoDispose<List<CostSubmission>>((ref) async {
  final repository = ref.watch(costSubmissionRepositoryProvider);
  final userId = ref.watch(currentUserIdProvider);
  
  if (userId.isEmpty) {
    return [];
  }
  
  return repository.getRevisionRequested(userId);
});

// Provider for approval history of a submission
final approvalHistoryProvider = FutureProvider.autoDispose.family<List<CostApprovalHistory>, String>((ref, submissionId) async {
  final repository = ref.watch(costSubmissionRepositoryProvider);
  return repository.getApprovalHistory(submissionId);
});

// Review cost submission notifier
class ReviewCostSubmissionNotifier extends StateNotifier<AsyncValue<CostSubmission?>> {
  final Ref ref;

  ReviewCostSubmissionNotifier(this.ref) : super(const AsyncValue.data(null));

  Future<void> reviewSubmission(ReviewCostSubmissionRequest request) async {
    state = const AsyncValue.loading();

    try {
      final repository = ref.read(costSubmissionRepositoryProvider);
      final userId = ref.read(currentUserIdProvider);

      if (userId.isEmpty) {
        throw CostSubmissionException('User not authenticated');
      }

      // Get the submission before review to send notifications
      final submissionBeforeReview = await repository.getCostSubmissionById(request.submissionId);

      final submission = await repository.reviewCostSubmission(request, userId);
      state = AsyncValue.data(submission);

      // Send notification to the submitter based on the review action
      if (submissionBeforeReview != null) {
        await _sendReviewNotification(submissionBeforeReview, request);
      }

      // Invalidate related providers
      ref.invalidate(userCostSubmissionsProvider);
      ref.invalidate(userCostSubmissionsStreamProvider);
      ref.invalidate(costSubmissionStatsProvider);
      ref.invalidate(costSubmissionByIdProvider(request.submissionId));
      ref.invalidate(approvalHistoryProvider(request.submissionId));
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }

  Future<void> _sendReviewNotification(CostSubmission submission, ReviewCostSubmissionRequest request) async {
    try {
      final amount = (submission.totalCostCents / 100).toDouble();

      switch (request.action) {
        case ReviewAction.approve:
          await NotificationService.showCostSubmissionApprovedNotification(
            submissionId: submission.id,
            siteVisitId: submission.siteVisitId,
            approvedAmount: amount,
            currency: submission.currency,
          );
          break;
        case ReviewAction.reject:
          await NotificationService.showCostSubmissionRejectedNotification(
            submissionId: submission.id,
            siteVisitId: submission.siteVisitId,
            rejectionReason: request.reviewerNotes ?? 'No reason provided',
          );
          break;
        case ReviewAction.requestRevision:
          await NotificationService.showCostSubmissionRevisionRequestedNotification(
            submissionId: submission.id,
            siteVisitId: submission.siteVisitId,
            revisionNotes: request.revisionNotes ?? request.reviewerNotes ?? 'Revision required',
          );
          break;
      }
    } catch (e) {
      // Log notification error but don't fail the review process
      print('Failed to send review notification: $e');
    }
  }

  Future<void> approveSubmission(String submissionId, String? notes) async {
    await reviewSubmission(ReviewCostSubmissionRequest(
      submissionId: submissionId,
      action: ReviewAction.approve,
      approvalNotes: notes,
      reviewerNotes: notes,
    ));
  }

  Future<void> rejectSubmission(String submissionId, String? notes) async {
    await reviewSubmission(ReviewCostSubmissionRequest(
      submissionId: submissionId,
      action: ReviewAction.reject,
      reviewerNotes: notes,
    ));
  }

  Future<void> requestRevision(String submissionId, String revisionNotes) async {
    await reviewSubmission(ReviewCostSubmissionRequest(
      submissionId: submissionId,
      action: ReviewAction.requestRevision,
      revisionNotes: revisionNotes,
      reviewerNotes: revisionNotes,
    ));
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final reviewCostSubmissionProvider = StateNotifierProvider.autoDispose<ReviewCostSubmissionNotifier, AsyncValue<CostSubmission?>>((ref) {
  return ReviewCostSubmissionNotifier(ref);
});

// Alias for backward compatibility
final costSubmissionApprovalProvider = reviewCostSubmissionProvider;
