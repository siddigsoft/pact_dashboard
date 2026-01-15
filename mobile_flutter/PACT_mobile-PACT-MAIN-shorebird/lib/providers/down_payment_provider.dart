import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/down_payment_request.dart';
import '../../repositories/wallet_repository.dart';

/// Provider for wallet repository
final walletRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository();
});

/// State for down payment requests
class DownPaymentState {
  final List<DownPaymentRequest> requests;
  final bool isLoading;
  final String? error;

  const DownPaymentState({
    this.requests = const [],
    this.isLoading = false,
    this.error,
  });

  DownPaymentState copyWith({
    List<DownPaymentRequest>? requests,
    bool? isLoading,
    String? error,
  }) {
    return DownPaymentState(
      requests: requests ?? this.requests,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

/// Notifier for down payment requests
class DownPaymentNotifier extends StateNotifier<DownPaymentState> {
  final WalletRepository _repository;
  final String _userId;

  DownPaymentNotifier(this._repository, this._userId)
      : super(const DownPaymentState()) {
    _loadRequests();
  }

  /// Load user's down payment requests
  Future<void> _loadRequests() async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final requests = await _repository.getUserDownPaymentRequests(_userId);
      state = state.copyWith(requests: requests, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  /// Create a new down payment request
  Future<void> createRequest({
    required String siteVisitId,
    required String mmpSiteEntryId,
    required String siteName,
    required String requesterRole,
    String? hubId,
    String? hubName,
    required double totalTransportationBudget,
    required double requestedAmount,
    required String paymentType,
    List<InstallmentPlan>? installmentPlan,
    required String justification,
    List<String>? supportingDocuments,
  }) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final newRequest = await _repository.createDownPaymentRequest(
        userId: _userId,
        siteVisitId: siteVisitId,
        mmpSiteEntryId: mmpSiteEntryId,
        siteName: siteName,
        requesterRole: requesterRole,
        hubId: hubId,
        hubName: hubName,
        totalTransportationBudget: totalTransportationBudget,
        requestedAmount: requestedAmount,
        paymentType: paymentType,
        installmentPlan: installmentPlan,
        justification: justification,
        supportingDocuments: supportingDocuments,
      );

      final updatedRequests = [newRequest, ...state.requests];
      state = state.copyWith(requests: updatedRequests, isLoading: false);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
      rethrow;
    }
  }

  /// Cancel a request
  Future<void> cancelRequest(String requestId) async {
    try {
      final updatedRequest = await _repository.cancelDownPaymentRequest(
        requestId: requestId,
        userId: _userId,
      );

      final updatedRequests = state.requests.map((request) {
        return request.id == requestId ? updatedRequest : request;
      }).toList();

      state = state.copyWith(requests: updatedRequests);
    } catch (e) {
      state = state.copyWith(error: e.toString());
      rethrow;
    }
  }

  /// Refresh requests
  Future<void> refresh() async {
    await _loadRequests();
  }
}

/// Provider for user's down payment requests
final downPaymentProvider = StateNotifierProvider.family<DownPaymentNotifier, DownPaymentState, String>(
  (ref, userId) {
    final repository = ref.watch(walletRepositoryProvider);
    return DownPaymentNotifier(repository, userId);
  },
);

/// Provider for supervisor's pending requests
final supervisorDownPaymentProvider = StreamProvider.family<List<DownPaymentRequest>, String>(
  (ref, supervisorId) {
    final repository = ref.watch(walletRepositoryProvider);
    return repository.watchSupervisorDownPaymentRequests(supervisorId);
  },
);

/// Provider for admin's pending requests
final adminDownPaymentProvider = StreamProvider<List<DownPaymentRequest>>(
  (ref) {
    final repository = ref.watch(walletRepositoryProvider);
    return repository.watchAdminDownPaymentRequests();
  },
);

/// Provider for real-time user requests stream
final userDownPaymentStreamProvider = StreamProvider.family<List<DownPaymentRequest>, String>(
  (ref, userId) {
    final repository = ref.watch(walletRepositoryProvider);
    return repository.watchUserDownPaymentRequests(userId);
  },
);