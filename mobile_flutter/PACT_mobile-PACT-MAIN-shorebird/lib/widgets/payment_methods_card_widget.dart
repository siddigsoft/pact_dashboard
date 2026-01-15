import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/payment_method_models.dart';
import '../providers/payment_method_provider.dart';

/// Payment Methods Card Widget
/// Mirrors the PaymentMethodsCard component from the PACT dashboard
/// Manages payment methods with local state and Riverpod integration
class PaymentMethodsCardWidget extends ConsumerStatefulWidget {
  const PaymentMethodsCardWidget({super.key});

  @override
  ConsumerState<PaymentMethodsCardWidget> createState() =>
      _PaymentMethodsCardWidgetState();
}

class _PaymentMethodsCardWidgetState
    extends ConsumerState<PaymentMethodsCardWidget> {
  bool _showAddDialog = false;
  String _selectedType = 'bank';
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _bankNameController = TextEditingController();
  final _accountNumberController = TextEditingController();
  final _providerNameController = TextEditingController();
  final _phoneNumberController = TextEditingController();
  final _cardholderNameController = TextEditingController();
  final _cardNumberController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _nameController.dispose();
    _bankNameController.dispose();
    _accountNumberController.dispose();
    _providerNameController.dispose();
    _phoneNumberController.dispose();
    _cardholderNameController.dispose();
    _cardNumberController.dispose();
    super.dispose();
  }

  /// Clear form fields
  void _clearForm() {
    _selectedType = 'bank';
    _nameController.clear();
    _bankNameController.clear();
    _accountNumberController.clear();
    _providerNameController.clear();
    _phoneNumberController.clear();
    _cardholderNameController.clear();
    _cardNumberController.clear();
  }

  /// Handle adding a new payment method
  Future<void> _handleAddPaymentMethod() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      final paymentType = PaymentType.values.firstWhere(
        (type) => type.name == _selectedType,
      );

      final request = CreatePaymentMethodRequest(
        type: paymentType,
        // Map provider name or cardholder name to 'name' field based on type
        name: _selectedType == 'bank'
            ? (_nameController.text.trim().isNotEmpty
                  ? _nameController.text.trim()
                  : _bankNameController.text.trim())
            : _selectedType == 'mobile_money'
            ? (_nameController.text.trim().isNotEmpty
                  ? _nameController.text.trim()
                  : _providerNameController.text.trim())
            : (_nameController.text.trim().isNotEmpty
                  ? _nameController.text.trim()
                  : _cardholderNameController.text.trim()),
        bankName: _selectedType == 'bank'
            ? _bankNameController.text.trim()
            : null,
        accountNumber: _selectedType == 'bank'
            ? _accountNumberController.text.trim()
            : null,
        phoneNumber: _selectedType == 'mobile_money'
            ? _phoneNumberController.text.trim()
            : null,
        cardNumber: _selectedType == 'card'
            ? _cardNumberController.text.trim()
            : null,
      );

      await ref.read(paymentMethodsProvider.notifier).addPaymentMethod(request);

      if (mounted) {
        _clearForm();
        setState(() => _showAddDialog = false);

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment method added successfully'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error adding payment method: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  /// Handle removing a payment method
  Future<void> _handleRemovePaymentMethod(String id) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove Payment Method'),
        content: const Text(
          'Are you sure you want to remove this payment method?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Remove'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      try {
        await ref.read(paymentMethodsProvider.notifier).removePaymentMethod(id);

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment method removed'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 2),
          ),
        );
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error removing payment method: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  /// Handle setting default payment method
  Future<void> _handleSetDefault(String id) async {
    try {
      await ref
          .read(paymentMethodsProvider.notifier)
          .setDefaultPaymentMethod(id);

      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Default payment method updated'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 2),
        ),
      );
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error setting default: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final paymentMethodsAsync = ref.watch(paymentMethodsProvider);

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Icon(Icons.account_balance_wallet, color: Colors.grey[600]),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Payment Methods',
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: Color(0xFF263238),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Preferred withdrawal methods',
                        style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),

          // Payment methods list
          Padding(
            padding: const EdgeInsets.all(16),
            child: paymentMethodsAsync.when(
              data: (methods) {
                if (methods.isEmpty) {
                  return SizedBox(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.add_circle_outline,
                          size: 48,
                          color: Colors.grey[300],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          'No payment methods added',
                          style: TextStyle(
                            color: Colors.grey[600],
                            fontSize: 14,
                          ),
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: () =>
                              setState(() => _showAddDialog = true),
                          icon: const Icon(Icons.add),
                          label: const Text('Add First Method'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF1976D2),
                          ),
                        ),
                      ],
                    ),
                  );
                }

                return Column(
                  children: methods.asMap().entries.map((entry) {
                    final index = entry.key;
                    final method = entry.value;
                    final isLast = index == methods.length - 1;

                    return Column(
                      children: [
                        _buildPaymentMethodItem(method),
                        if (!isLast) const Divider(height: 24),
                      ],
                    );
                  }).toList(),
                );
              },
              loading: () => const SizedBox(
                height: 100,
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (error, stack) => Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEBEE),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: const Color(0xFFE53935).withOpacity(0.3),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(
                          Icons.error_outline,
                          color: Color(0xFFE53935),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Error loading payment methods',
                            style: TextStyle(
                              color: Colors.grey[800],
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      error.toString(),
                      style: const TextStyle(
                        fontSize: 12,
                        color: Color(0xFF263238),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Add button
          Padding(
            padding: const EdgeInsets.only(left: 16, right: 16, bottom: 16),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () => setState(() => _showAddDialog = true),
                icon: const Icon(Icons.add),
                label: const Text('Add Payment Method'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF1976D2),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  side: const BorderSide(color: Color(0xFF1976D2)),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Build individual payment method item
  Widget _buildPaymentMethodItem(PaymentMethod method) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              method.paymentType.icon,
              color: const Color(0xFF1976D2),
              size: 28,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          method.name,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF263238),
                          ),
                        ),
                      ),
                      if (method.isDefault)
                        Container(
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
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    method.maskedDetails,
                    style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Added ${_formatDate(method.createdAt)}',
                    style: TextStyle(fontSize: 12, color: Colors.grey[500]),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            if (!method.isDefault)
              TextButton(
                onPressed: () => _handleSetDefault(method.id),
                child: const Text('Set as Default'),
              ),
            const SizedBox(width: 8),
            TextButton(
              onPressed: () => _handleRemovePaymentMethod(method.id),
              style: TextButton.styleFrom(foregroundColor: Colors.red),
              child: const Text('Remove'),
            ),
          ],
        ),
      ],
    );
  }

  /// Format date to relative string
  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inDays == 0) {
      return 'today';
    } else if (difference.inDays == 1) {
      return 'yesterday';
    } else if (difference.inDays < 7) {
      return '${difference.inDays} days ago';
    } else if (difference.inDays < 30) {
      return '${(difference.inDays / 7).floor()} weeks ago';
    } else {
      return '${(difference.inDays / 30).floor()} months ago';
    }
  }

  /// Show add payment method dialog
  void _showAddDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add Payment Method'),
        content: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Payment type selector
                const SizedBox(height: 16),
                const Text(
                  'Payment Type',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                DropdownButton<String>(
                  value: _selectedType,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(
                      value: 'bank',
                      child: Text('Bank Transfer'),
                    ),
                    DropdownMenuItem(
                      value: 'mobile_money',
                      child: Text('Mobile Money'),
                    ),
                    DropdownMenuItem(
                      value: 'card',
                      child: Text('Debit/Credit Card'),
                    ),
                  ],
                  onChanged: (value) {
                    if (value != null) {
                      setState(() {
                        _selectedType = value;
                        _clearForm();
                      });
                    }
                  },
                ),

                const SizedBox(height: 16),
                const Text(
                  'Name',
                  style: TextStyle(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 8),
                TextFormField(
                  controller: _nameController,
                  decoration: InputDecoration(
                    hintText: 'e.g., My Bank Account',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Please enter a name';
                    }
                    return null;
                  },
                ),

                // Bank-specific fields
                if (_selectedType == 'bank') ...[
                  const SizedBox(height: 16),
                  const Text(
                    'Bank Name',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _bankNameController,
                    decoration: InputDecoration(
                      hintText: 'e.g., Bank of Khartoum',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter bank name';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Account Number',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _accountNumberController,
                    decoration: InputDecoration(
                      hintText: 'Enter your account number',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter account number';
                      }
                      return null;
                    },
                  ),
                ],

                // Mobile money fields
                if (_selectedType == 'mobile_money') ...[
                  const SizedBox(height: 16),
                  const Text(
                    'Provider',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    initialValue: _providerNameController.text.isEmpty
                        ? null
                        : _providerNameController.text,
                    items: const [
                      DropdownMenuItem(value: 'Zain', child: Text('Zain')),
                      DropdownMenuItem(value: 'MTN', child: Text('MTN')),
                      DropdownMenuItem(value: 'Sudani', child: Text('Sudani')),
                    ],
                    onChanged: (value) {
                      if (value != null) {
                        _providerNameController.text = value;
                      }
                    },
                    decoration: InputDecoration(
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please select provider';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Phone Number',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _phoneNumberController,
                    decoration: InputDecoration(
                      hintText: '+249 9xx xxx xxx',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    keyboardType: TextInputType.phone,
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter phone number';
                      }
                      return null;
                    },
                  ),
                ],

                // Card fields
                if (_selectedType == 'card') ...[
                  const SizedBox(height: 16),
                  const Text(
                    'Cardholder Name',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _cardholderNameController,
                    decoration: InputDecoration(
                      hintText: 'Name on card',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter cardholder name';
                      }
                      return null;
                    },
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Card Number',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _cardNumberController,
                    decoration: InputDecoration(
                      hintText: '1234 5678 9012 3456',
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    keyboardType: TextInputType.number,
                    validator: (value) {
                      if (value == null || value.isEmpty) {
                        return 'Please enter card number';
                      }
                      if (value.replaceAll(' ', '').length < 13) {
                        return 'Invalid card number';
                      }
                      return null;
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _clearForm();
            },
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: _isSubmitting ? null : _handleAddPaymentMethod,
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF1976D2),
            ),
            child: _isSubmitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Add'),
          ),
        ],
      ),
    );
  }
}
