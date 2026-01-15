import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/payment_method_models.dart';
import '../services/payment_method_service.dart';

/// Provider for Supabase client
final supabaseProvider = Provider<SupabaseClient>((ref) {
  return Supabase.instance.client;
});

/// Provider for PaymentMethodService
final paymentMethodServiceProvider = Provider<PaymentMethodService>((ref) {
  final supabase = ref.watch(supabaseProvider);
  return PaymentMethodService(supabase);
});

/// Payment methods notifier
class PaymentMethodsNotifier extends StateNotifier<AsyncValue<List<PaymentMethod>>> {
  PaymentMethodsNotifier(this._service) : super(const AsyncValue.loading()) {
    loadPaymentMethods();
  }

  final PaymentMethodService _service;

  /// Load all payment methods for current user
  Future<void> loadPaymentMethods() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _service.fetchPaymentMethods());
  }

  /// Add a new payment method
  Future<void> addPaymentMethod(CreatePaymentMethodRequest request) async {
    try {
      await _service.createPaymentMethod(request);
      await loadPaymentMethods(); // Reload list
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }

  /// Remove a payment method
  Future<void> removePaymentMethod(String id) async {
    try {
      await _service.deletePaymentMethod(id);
      await loadPaymentMethods(); // Reload list
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }

  /// Set a payment method as default
  Future<void> setDefaultPaymentMethod(String id) async {
    try {
      await _service.setDefaultPaymentMethod(id);
      await loadPaymentMethods(); // Reload list
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
      rethrow;
    }
  }
}

/// Provider for payment methods list
final paymentMethodsProvider = StateNotifierProvider<PaymentMethodsNotifier, AsyncValue<List<PaymentMethod>>>((ref) {
  final service = ref.watch(paymentMethodServiceProvider);
  return PaymentMethodsNotifier(service);
});

/// Provider for default payment method
final defaultPaymentMethodProvider = Provider<PaymentMethod?>((ref) {
  final paymentMethodsAsync = ref.watch(paymentMethodsProvider);
  
  return paymentMethodsAsync.whenOrNull(
    data: (methods) {
      try {
        return methods.firstWhere((method) => method.isDefault);
      } catch (e) {
        return methods.isNotEmpty ? methods.first : null;
      }
    },
  );
});

/// Provider for payment methods by type
final paymentMethodsByTypeProvider = Provider.family<List<PaymentMethod>, PaymentType>((ref, type) {
  final paymentMethodsAsync = ref.watch(paymentMethodsProvider);
  
  return paymentMethodsAsync.whenOrNull(
    data: (methods) => methods.where((method) => method.type == type).toList(),
  ) ?? [];
});

/// Provider for checking if user has payment methods
final hasPaymentMethodsProvider = Provider<bool>((ref) {
  final paymentMethodsAsync = ref.watch(paymentMethodsProvider);
  
  return paymentMethodsAsync.whenOrNull(
    data: (methods) => methods.isNotEmpty,
  ) ?? false;
});

/// Provider for payment method count
final paymentMethodCountProvider = Provider<int>((ref) {
  final paymentMethodsAsync = ref.watch(paymentMethodsProvider);
  
  return paymentMethodsAsync.whenOrNull(
    data: (methods) => methods.length,
  ) ?? 0;
});

/// Create payment method action provider
final createPaymentMethodProvider = Provider.autoDispose.family<
    Future<void> Function(CreatePaymentMethodRequest), 
    void
>((ref, _) {
  return (CreatePaymentMethodRequest request) async {
    final notifier = ref.read(paymentMethodsProvider.notifier);
    await notifier.addPaymentMethod(request);
  };
});

/// Delete payment method action provider
final deletePaymentMethodProvider = Provider.autoDispose.family<
    Future<void> Function(String), 
    void
>((ref, _) {
  return (String id) async {
    final notifier = ref.read(paymentMethodsProvider.notifier);
    await notifier.removePaymentMethod(id);
  };
});

/// Set default payment method action provider
final setDefaultPaymentMethodActionProvider = Provider.autoDispose.family<
    Future<void> Function(String), 
    void
>((ref, _) {
  return (String id) async {
    final notifier = ref.read(paymentMethodsProvider.notifier);
    await notifier.setDefaultPaymentMethod(id);
  };
});
