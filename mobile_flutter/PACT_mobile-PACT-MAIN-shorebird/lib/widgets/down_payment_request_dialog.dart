import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/site_visit.dart';
import '../providers/down_payment_provider.dart';
import '../providers/site_visit_provider.dart';
import '../utils/currency_utils.dart';

class DownPaymentRequestDialog extends ConsumerStatefulWidget {
  final String userId;

  const DownPaymentRequestDialog({super.key, required this.userId});

  @override
  ConsumerState<DownPaymentRequestDialog> createState() =>
      _DownPaymentRequestDialogState();
}

class _DownPaymentRequestDialogState
    extends ConsumerState<DownPaymentRequestDialog> {
  SiteVisit? _selectedSiteVisit;
  final _amountController = TextEditingController();
  final _justificationController = TextEditingController();
  String _paymentType = 'full_advance';
  bool _isLoading = false;

  @override
  void dispose() {
    _amountController.dispose();
    _justificationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final siteVisitsAsync = ref.watch(acceptedSiteVisitsStreamProvider);

    return AlertDialog(
      title: const Text('Request Down Payment'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Select an accepted site visit to request transportation advance for:',
              style: TextStyle(fontWeight: FontWeight.w500),
            ),
            const SizedBox(height: 16),

            // Site visit selection
            siteVisitsAsync.when(
              data: (siteVisits) {
                // Filter for accepted status (case-insensitive to handle 'Accepted', 'Accept', 'accepted')
                final acceptedVisits = siteVisits
                    .where(
                      (visit) =>
                          visit.status.toLowerCase().startsWith('accept'),
                    )
                    .toList();

                if (acceptedVisits.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text(
                      'No accepted site visits available for down payment requests.',
                      style: TextStyle(color: Colors.red),
                    ),
                  );
                }

                return DropdownButtonFormField<SiteVisit>(
                  initialValue: _selectedSiteVisit,
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Select Site Visit',
                    border: OutlineInputBorder(),
                  ),
                  items: acceptedVisits.map((visit) {
                    return DropdownMenuItem(
                      value: visit,
                      child: Text(
                        '${visit.siteName} - ${formatCurrency((visit.transportFee ?? 0) * 100)} budget',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    );
                  }).toList(),
                  onChanged: (value) {
                    setState(() {
                      _selectedSiteVisit = value;
                      if (value != null) {
                        _amountController.text =
                            ((value.transportFee ?? 0) * 100).toString();
                      }
                    });
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, stack) =>
                  Text('Error loading site visits: $error'),
            ),

            const SizedBox(height: 16),

            // Amount field
            TextFormField(
              controller: _amountController,
              decoration: const InputDecoration(
                labelText: 'Requested Amount (SDG)',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.attach_money),
              ),
              keyboardType: TextInputType.number,
              enabled: _selectedSiteVisit != null,
            ),

            const SizedBox(height: 16),

            // Payment type
            DropdownButtonFormField<String>(
              initialValue: _paymentType,
              decoration: const InputDecoration(
                labelText: 'Payment Type',
                border: OutlineInputBorder(),
              ),
              items: const [
                DropdownMenuItem(
                  value: 'full_advance',
                  child: Text('Full Advance'),
                ),
                DropdownMenuItem(
                  value: 'installments',
                  child: Text('Installments'),
                ),
              ],
              onChanged: (value) {
                setState(() {
                  _paymentType = value ?? 'full_advance';
                });
              },
            ),

            const SizedBox(height: 16),

            // Justification
            TextFormField(
              controller: _justificationController,
              decoration: const InputDecoration(
                labelText: 'Justification',
                border: OutlineInputBorder(),
                hintText: 'Explain why you need this advance...',
              ),
              maxLines: 3,
              maxLength: 500,
            ),

            const SizedBox(height: 16),

            // Budget info
            if (_selectedSiteVisit != null) ...[
              Card(
                color: Colors.blue.shade50,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Budget Information',
                        style: TextStyle(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Total Transportation Budget: ${formatCurrency((_selectedSiteVisit!.transportFee ?? 0) * 100)}',
                      ),
                      Text(
                        'Requested Amount: ${formatCurrency(double.tryParse(_amountController.text) ?? 0)}',
                      ),
                      if (((_selectedSiteVisit!.transportFee ?? 0) * 100) <
                          (double.tryParse(_amountController.text) ?? 0))
                        const Text(
                          '⚠️ Requested amount exceeds budget!',
                          style: TextStyle(
                            color: Colors.red,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : () => Navigator.of(context).pop(),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: _isLoading || _selectedSiteVisit == null
              ? null
              : _submitRequest,
          child: _isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Text('Submit Request'),
        ),
      ],
    );
  }

  Future<void> _submitRequest() async {
    if (_selectedSiteVisit == null) return;

    final amount = double.tryParse(_amountController.text);
    if (amount == null || amount <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please enter a valid amount')),
      );
      return;
    }

    final budget = (_selectedSiteVisit!.transportFee ?? 0) * 100;
    if (amount > budget) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Requested amount cannot exceed transportation budget'),
        ),
      );
      return;
    }

    if (_justificationController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please provide a justification')),
      );
      return;
    }

    setState(() => _isLoading = true);

    try {
      await ref
          .read(downPaymentProvider(widget.userId).notifier)
          .createRequest(
            siteVisitId: _selectedSiteVisit!.id,
            mmpSiteEntryId: _selectedSiteVisit!.mmpId ?? '',
            siteName: _selectedSiteVisit!.siteName,
            requesterRole:
                'dataCollector', // This should come from user profile
            hubId: null, // Hub info not available in current SiteVisit model
            hubName: null, // Hub info not available in current SiteVisit model
            totalTransportationBudget:
                (_selectedSiteVisit!.transportFee ?? 0) * 100,
            requestedAmount: amount,
            paymentType: _paymentType,
            justification: _justificationController.text.trim(),
          );

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Down payment request submitted successfully'),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Failed to submit request: $e')));
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }
}
