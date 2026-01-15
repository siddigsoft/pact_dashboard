import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/payment_method_models.dart';
import '../providers/payment_method_provider.dart';

class PaymentMethodsScreen extends ConsumerWidget {
  const PaymentMethodsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final paymentMethodsAsync = ref.watch(paymentMethodsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment Methods'),
        backgroundColor: const Color(0xFF1976D2),
      ),
      body: paymentMethodsAsync.when(
        data: (methods) => methods.isEmpty
            ? _buildEmptyState(context)
            : _buildMethodsList(context, ref, methods),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, stack) => _buildErrorState(context, error),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddPaymentMethodDialog(context, ref),
        backgroundColor: const Color(0xFF1976D2),
        icon: const Icon(Icons.add),
        label: const Text('Add Payment Method'),
      ),
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.account_balance_wallet_outlined,
            size: 100,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'No Payment Methods',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          Text(
            'Add a payment method to receive funds',
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: Colors.grey[600]),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, Object error) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.error_outline, size: 64, color: Colors.red),
          const SizedBox(height: 16),
          Text(
            'Error loading payment methods',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          Text(
            error.toString(),
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }

  Widget _buildMethodsList(
    BuildContext context,
    WidgetRef ref,
    List<PaymentMethod> methods,
  ) {
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(paymentMethodsProvider);
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: methods.length,
        itemBuilder: (context, index) {
          final method = methods[index];
          return _buildPaymentMethodCard(context, ref, method);
        },
      ),
    );
  }

  Widget _buildPaymentMethodCard(
    BuildContext context,
    WidgetRef ref,
    PaymentMethod method,
  ) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1976D2).withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(
                    method.paymentType.icon,
                    color: const Color(0xFF1976D2),
                    size: 24,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            method.name,
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          if (method.isDefault) ...[
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 8,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: const Color(0xFF4CAF50),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Text(
                                'DEFAULT',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          ],
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        method.paymentType.displayName,
                        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
                      ),
                    ],
                  ),
                ),
                PopupMenuButton<String>(
                  onSelected: (value) {
                    if (value == 'set_default') {
                      _setAsDefault(context, ref, method);
                    } else if (value == 'delete') {
                      _confirmDelete(context, ref, method);
                    }
                  },
                  itemBuilder: (context) => [
                    if (!method.isDefault)
                      const PopupMenuItem(
                        value: 'set_default',
                        child: Row(
                          children: [
                            Icon(Icons.check_circle, size: 20),
                            SizedBox(width: 8),
                            Text('Set as Default'),
                          ],
                        ),
                      ),
                    const PopupMenuItem(
                      value: 'delete',
                      child: Row(
                        children: [
                          Icon(Icons.delete, size: 20, color: Colors.red),
                          SizedBox(width: 8),
                          Text('Delete', style: TextStyle(color: Colors.red)),
                        ],
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.grey[100],
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: Colors.grey[700]),
                  const SizedBox(width: 8),
                  Text(
                    method.maskedDetails,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[700],
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _setAsDefault(
    BuildContext context,
    WidgetRef ref,
    PaymentMethod method,
  ) async {
    try {
      final notifier = ref.read(paymentMethodsProvider.notifier);
      await notifier.setDefaultPaymentMethod(method.id);

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${method.name} set as default'),
            backgroundColor: const Color(0xFF4CAF50),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    PaymentMethod method,
  ) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Payment Method'),
        content: Text('Are you sure you want to delete ${method.name}?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              _deletePaymentMethod(context, ref, method);
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
  }

  void _deletePaymentMethod(
    BuildContext context,
    WidgetRef ref,
    PaymentMethod method,
  ) async {
    try {
      final notifier = ref.read(paymentMethodsProvider.notifier);
      await notifier.removePaymentMethod(method.id);

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment method deleted'),
            backgroundColor: Color(0xFF4CAF50),
          ),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  void _showAddPaymentMethodDialog(BuildContext context, WidgetRef ref) {
    showDialog(
      context: context,
      builder: (context) => AddPaymentMethodDialog(ref: ref),
    );
  }
}

class AddPaymentMethodDialog extends StatefulWidget {
  const AddPaymentMethodDialog({super.key, required this.ref});

  final WidgetRef ref;

  @override
  State<AddPaymentMethodDialog> createState() => _AddPaymentMethodDialogState();
}

class _AddPaymentMethodDialogState extends State<AddPaymentMethodDialog> {
  final _formKey = GlobalKey<FormState>();
  PaymentType _selectedType = PaymentType.bank;
  bool _isLoading = false;

  // Bank fields
  final _bankNameController = TextEditingController();
  final _accountNumberController = TextEditingController();

  // Mobile money fields
  final _providerNameController = TextEditingController();
  final _phoneNumberController = TextEditingController();

  // Card fields
  final _cardholderNameController = TextEditingController();
  final _cardNumberController = TextEditingController();

  @override
  void dispose() {
    _bankNameController.dispose();
    _accountNumberController.dispose();
    _providerNameController.dispose();
    _phoneNumberController.dispose();
    _cardholderNameController.dispose();
    _cardNumberController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Add Payment Method'),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DropdownButtonFormField<PaymentType>(
                initialValue: _selectedType,
                decoration: const InputDecoration(
                  labelText: 'Payment Type',
                  border: OutlineInputBorder(),
                ),
                items: PaymentType.values.map((type) {
                  return DropdownMenuItem(
                    value: type,
                    child: Row(
                      children: [
                        Icon(type.icon, size: 20),
                        const SizedBox(width: 8),
                        Text(type.displayName),
                      ],
                    ),
                  );
                }).toList(),
                onChanged: (value) {
                  if (value != null) {
                    setState(() {
                      _selectedType = value;
                    });
                  }
                },
              ),
              const SizedBox(height: 16),
              _buildTypeSpecificFields(),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.pop(context),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _addPaymentMethod,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF1976D2),
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Add'),
        ),
      ],
    );
  }

  Widget _buildTypeSpecificFields() {
    switch (_selectedType) {
      case PaymentType.bank:
        return Column(
          children: [
            TextFormField(
              controller: _bankNameController,
              decoration: const InputDecoration(
                labelText: 'Bank Name',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.account_balance),
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Bank name is required';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _accountNumberController,
              decoration: const InputDecoration(
                labelText: 'Account Number',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.numbers),
              ),
              keyboardType: TextInputType.number,
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Account number is required';
                }
                if (value.length < 8) {
                  return 'Account number must be at least 8 digits';
                }
                return null;
              },
            ),
          ],
        );

      case PaymentType.mobileMoney:
        return Column(
          children: [
            TextFormField(
              controller: _providerNameController,
              decoration: const InputDecoration(
                labelText: 'Provider Name',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.mobile_friendly),
                hintText: 'e.g., MTN, Zain, Sudani',
              ),
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Provider name is required';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _phoneNumberController,
              decoration: const InputDecoration(
                labelText: 'Phone Number',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.phone),
                hintText: '+249 XXX XXX XXX',
              ),
              keyboardType: TextInputType.phone,
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Phone number is required';
                }
                return null;
              },
            ),
          ],
        );

      case PaymentType.card:
        return Column(
          children: [
            TextFormField(
              controller: _cardholderNameController,
              decoration: const InputDecoration(
                labelText: 'Cardholder Name',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.person),
              ),
              textCapitalization: TextCapitalization.words,
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Cardholder name is required';
                }
                return null;
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _cardNumberController,
              decoration: const InputDecoration(
                labelText: 'Card Number',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.credit_card),
                hintText: 'XXXX XXXX XXXX XXXX',
              ),
              keyboardType: TextInputType.number,
              maxLength: 16,
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return 'Card number is required';
                }
                final clean = value.replaceAll(RegExp(r'\s+'), '');
                if (clean.length != 16) {
                  return 'Card number must be 16 digits';
                }
                return null;
              },
            ),
          ],
        );
    }
  }

  void _addPaymentMethod() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    setState(() {
      _isLoading = true;
    });

    try {
      final request = CreatePaymentMethodRequest(
        type: _selectedType,
        // Map provider name or cardholder name to 'name' field based on type
        name: _selectedType == PaymentType.bank
            ? _bankNameController.text
            : _selectedType == PaymentType.mobileMoney
            ? _providerNameController.text
            : _cardholderNameController.text,
        bankName: _selectedType == PaymentType.bank
            ? _bankNameController.text
            : null,
        accountNumber: _selectedType == PaymentType.bank
            ? _accountNumberController.text
            : null,
        phoneNumber: _selectedType == PaymentType.mobileMoney
            ? _phoneNumberController.text
            : null,
        cardNumber: _selectedType == PaymentType.card
            ? _cardNumberController.text
            : null,
      );

      final notifier = widget.ref.read(paymentMethodsProvider.notifier);
      await notifier.addPaymentMethod(request);

      if (mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Payment method added successfully'),
            backgroundColor: Color(0xFF4CAF50),
          ),
        );
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }
}
