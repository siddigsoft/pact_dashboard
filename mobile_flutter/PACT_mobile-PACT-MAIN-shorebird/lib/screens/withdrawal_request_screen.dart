import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../providers/wallet_provider.dart';
import '../providers/profile_provider.dart';
import '../providers/payment_method_provider.dart';

/// Enhanced Withdrawal Request Screen
/// Follows constraints: Two-step approval, status tracking, RLS policies, minimum withdrawal amounts
/// Integrates with PaymentMethod system for saved payment methods
class WithdrawalRequestScreen extends ConsumerStatefulWidget {
  const WithdrawalRequestScreen({super.key});

  @override
  ConsumerState<WithdrawalRequestScreen> createState() =>
      _WithdrawalRequestScreenState();
}

class _WithdrawalRequestScreenState
    extends ConsumerState<WithdrawalRequestScreen> {
  final _formKey = GlobalKey<FormState>();
  final _amountController = TextEditingController();
  final _reasonController = TextEditingController();
  String? _selectedPaymentMethodId; // Now stores the PaymentMethod ID
  bool _isSubmitting = false;

  @override
  void dispose() {
    _amountController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  Future<void> _submitWithdrawalRequest() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedPaymentMethodId == null) {
      _showError('Please select a payment method');
      return;
    }

    final walletAsync = ref.read(walletProvider);
    final wallet = walletAsync.valueOrNull;

    if (wallet == null) {
      _showError('Wallet not found');
      return;
    }

    final amount = double.tryParse(_amountController.text);
    if (amount == null || amount <= 0) {
      _showError('Please enter a valid amount');
      return;
    }

    // CONSTRAINT: Check role-based minimum withdrawal amounts
    final profile = ref.read(currentUserProfileProvider);
    final userRole = profile?.role ?? 'dataCollector';

    double minimumAmount = 0;
    String roleName = 'your role';

    switch (userRole.toLowerCase()) {
      case 'datacollector':
      case 'data collector':
        minimumAmount = 500; // SDG 500 for data collectors
        roleName = 'Data Collectors';
        break;
      case 'supervisor':
        minimumAmount = 1500; // SDG 1500 for supervisors
        roleName = 'Supervisors';
        break;
      case 'coordinator':
        minimumAmount = 1500; // SDG 1500 for coordinators
        roleName = 'Coordinators';
        break;
      case 'admin':
      case 'financeadmin':
      case 'ict':
      case 'fom':
        minimumAmount = 0; // No minimum for admin roles
        break;
      default:
        minimumAmount = 500; // Default minimum
        roleName = 'users';
    }

    if (amount < minimumAmount) {
      _showError(
        'Minimum withdrawal for $roleName is ${minimumAmount.toStringAsFixed(0)} ${wallet.currency}',
      );
      return;
    }

    // Check balance
    if (amount > wallet.currentBalance) {
      _showError(
        'Insufficient balance. Available: ${wallet.currentBalance.toStringAsFixed(2)} ${wallet.currency}',
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      await ref
          .read(walletServiceProvider)
          .createWithdrawalRequest(
            amount: amount,
            requestReason: _reasonController.text.trim(),
            paymentMethod:
                _selectedPaymentMethodId!, // Pass the payment method ID
          );

      if (mounted) {
        // Refresh wallet and withdrawal requests
        ref.invalidate(walletProvider);
        ref.invalidate(withdrawalRequestsProvider);

        _showSuccess(
          'Withdrawal request submitted successfully!\n'
          'You will be notified when it\'s processed.',
        );

        Navigator.pop(context);
      }
    } catch (e) {
      _showError('Failed to submit request: $e');
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        duration: const Duration(seconds: 4),
      ),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.green,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final walletAsync = ref.watch(walletProvider);

    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: AppBar(
        title: const Text(
          'Request Withdrawal',
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1976D2),
        foregroundColor: Colors.white,
        elevation: 0,
      ),
      body: walletAsync.when(
        data: (wallet) {
          if (wallet == null) {
            return const Center(child: Text('Wallet not found'));
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Balance Card
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFF1976D2), Color(0xFF1565C0)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFF1976D2).withOpacity(0.3),
                          blurRadius: 8,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Available Balance',
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.9),
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          '${wallet.currentBalance.toStringAsFixed(2)} ${wallet.currency}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Amount Input
                  const Text(
                    'Withdrawal Amount',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF263238),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _amountController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    inputFormatters: [
                      FilteringTextInputFormatter.allow(
                        RegExp(r'^\d+\.?\d{0,2}'),
                      ),
                    ],
                    decoration: InputDecoration(
                      hintText: 'Enter amount',
                      prefixIcon: const Icon(
                        Icons.attach_money,
                        color: Color(0xFF1976D2),
                      ),
                      suffixText: wallet.currency,
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: Color(0xFF1976D2),
                          width: 2,
                        ),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter an amount';
                      }
                      final amount = double.tryParse(value);
                      if (amount == null || amount <= 0) {
                        return 'Please enter a valid amount';
                      }
                      if (amount > wallet.currentBalance) {
                        return 'Amount exceeds available balance';
                      }
                      return null;
                    },
                  ),

                  // Minimum amount helper text
                  Builder(
                    builder: (context) {
                      final profile = ref.watch(currentUserProfileProvider);
                      final userRole = profile?.role ?? 'dataCollector';

                      double minimumAmount = 500;
                      String roleName = 'your role';

                      switch (userRole.toLowerCase()) {
                        case 'datacollector':
                        case 'data collector':
                          minimumAmount = 500;
                          roleName = 'Data Collectors';
                          break;
                        case 'supervisor':
                        case 'coordinator':
                          minimumAmount = 1500;
                          roleName = userRole.toLowerCase() == 'supervisor'
                              ? 'Supervisors'
                              : 'Coordinators';
                          break;
                        case 'admin':
                        case 'financeadmin':
                        case 'ict':
                        case 'fom':
                          return const SizedBox.shrink(); // No minimum for admin roles
                        default:
                          minimumAmount = 500;
                      }

                      return Padding(
                        padding: const EdgeInsets.only(top: 8, left: 4),
                        child: Text(
                          'Minimum withdrawal for $roleName: ${minimumAmount.toStringAsFixed(0)} ${wallet.currency}',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      );
                    },
                  ),

                  const SizedBox(height: 24),

                  // Payment Method Selection
                  const Text(
                    'Payment Method',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF263238),
                    ),
                  ),
                  const SizedBox(height: 12),
                  _buildPaymentMethodSelector(),

                  const SizedBox(height: 24),

                  // Reason Input
                  const Text(
                    'Reason for Withdrawal',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Color(0xFF263238),
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _reasonController,
                    maxLines: 3,
                    maxLength: 200,
                    decoration: InputDecoration(
                      hintText: 'Enter reason (optional)',
                      filled: true,
                      fillColor: Colors.white,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide(color: Colors.grey.shade300),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: const BorderSide(
                          color: Color(0xFF1976D2),
                          width: 2,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Info Box
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: const Color(0xFFE3F2FD),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: const Color(0xFF1976D2).withOpacity(0.3),
                      ),
                    ),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.info_outline,
                          color: Color(0xFF1976D2),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: const [
                              Text(
                                'Approval Process',
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF1976D2),
                                ),
                              ),
                              SizedBox(height: 4),
                              Text(
                                '1. Supervisor approval\n'
                                '2. Finance processing\n'
                                '3. Payment released',
                                style: TextStyle(
                                  fontSize: 13,
                                  color: Color(0xFF263238),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 32),

                  // Submit Button
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: _isSubmitting
                          ? null
                          : _submitWithdrawalRequest,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFFF9800),
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: Colors.grey.shade300,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: _isSubmitting
                          ? const SizedBox(
                              height: 24,
                              width: 24,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.white,
                                ),
                              ),
                            )
                          : const Text(
                              'Submit Request',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 64, color: Colors.red),
              const SizedBox(height: 16),
              Text('Error: $error'),
            ],
          ),
        ),
      ),
    );
  }

  /// Build payment method selector with saved payment methods
  Widget _buildPaymentMethodSelector() {
    final paymentMethodsAsync = ref.watch(paymentMethodsProvider);

    return paymentMethodsAsync.when(
      data: (methods) {
        if (methods.isEmpty) {
          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: const Color(0xFFFFF3E0),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: const Color(0xFFFF9800).withOpacity(0.3),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.warning_amber, color: Color(0xFFFF9800)),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'No payment methods added',
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: Color(0xFFFF9800),
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'Please add a payment method in the Payment Methods section before requesting a withdrawal.',
                  style: TextStyle(fontSize: 13, color: Color(0xFF263238)),
                ),
              ],
            ),
          );
        }

        return Column(
          children: methods.map((method) {
            final isSelected = _selectedPaymentMethodId == method.id;
            return GestureDetector(
              onTap: () {
                setState(() {
                  _selectedPaymentMethodId = method.id;
                });
              },
              child: Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isSelected
                        ? const Color(0xFF1976D2)
                        : Colors.grey.shade300,
                    width: isSelected ? 2 : 1,
                  ),
                  boxShadow: isSelected
                      ? [
                          BoxShadow(
                            color: const Color(0xFF1976D2).withOpacity(0.2),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ]
                      : null,
                ),
                child: Row(
                  children: [
                    Icon(
                      method.paymentType.icon,
                      color: isSelected
                          ? const Color(0xFF1976D2)
                          : Colors.grey[600],
                      size: 24,
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            method.name,
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                              color: isSelected
                                  ? const Color(0xFF1976D2)
                                  : const Color(0xFF263238),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            method.maskedDetails,
                            style: TextStyle(
                              fontSize: 13,
                              color: Colors.grey[600],
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (method.isDefault)
                      Container(
                        margin: const EdgeInsets.only(left: 8, right: 8),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: const Color(0xFF4CAF50).withOpacity(0.1),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: const Text(
                          'Default',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF4CAF50),
                          ),
                        ),
                      ),
                    if (isSelected)
                      const Icon(Icons.check_circle, color: Color(0xFF1976D2)),
                  ],
                ),
              ),
            );
          }).toList(),
        );
      },
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: CircularProgressIndicator(),
      ),
      error: (error, stack) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFFFFEBEE),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFE53935).withOpacity(0.3)),
        ),
        child: Row(
          children: [
            const Icon(Icons.error_outline, color: Color(0xFFE53935)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'Error loading payment methods: $error',
                style: const TextStyle(color: Color(0xFFE53935), fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
