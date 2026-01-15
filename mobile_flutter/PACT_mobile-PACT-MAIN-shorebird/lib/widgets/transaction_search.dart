/// Advanced transaction search widget matching TSX TransactionSearch component
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../config/wallet_constants.dart';
import '../providers/wallet/wallet_notifier.dart';

class TransactionSearchWidget extends ConsumerStatefulWidget {
  final Function(TransactionSearchFilters)? onSearch;
  final Function()? onClear;
  final TransactionSearchFilters initialFilters;

  const TransactionSearchWidget({
    super.key,
    this.onSearch,
    this.onClear,
    this.initialFilters = const TransactionSearchFilters(),
  });

  @override
  ConsumerState<TransactionSearchWidget> createState() =>
      _TransactionSearchWidgetState();
}

class _TransactionSearchWidgetState
    extends ConsumerState<TransactionSearchWidget> {
  late TextEditingController _searchController;
  late TextEditingController _minAmountController;
  late TextEditingController _maxAmountController;
  DateTime? _startDate;
  DateTime? _endDate;
  String? _selectedType;
  bool _showAdvancedFilters = false;

  @override
  void initState() {
    super.initState();
    _searchController = TextEditingController(
      text: widget.initialFilters.searchTerm ?? '',
    );
    _minAmountController = TextEditingController(
      text: widget.initialFilters.minAmount?.toString() ?? '',
    );
    _maxAmountController = TextEditingController(
      text: widget.initialFilters.maxAmount?.toString() ?? '',
    );
    _startDate = widget.initialFilters.startDate;
    _endDate = widget.initialFilters.endDate;
    _selectedType = widget.initialFilters.type;
  }

  @override
  void dispose() {
    _searchController.dispose();
    _minAmountController.dispose();
    _maxAmountController.dispose();
    super.dispose();
  }

  void _applyFilters() {
    final filters = TransactionSearchFilters(
      searchTerm: _searchController.text.isEmpty
          ? null
          : _searchController.text,
      type: _selectedType,
      minAmount: _minAmountController.text.isEmpty
          ? null
          : double.tryParse(_minAmountController.text),
      maxAmount: _maxAmountController.text.isEmpty
          ? null
          : double.tryParse(_maxAmountController.text),
      startDate: _startDate,
      endDate: _endDate,
    );

    ref.read(transactionSearchFiltersProvider.notifier).state = filters;
    widget.onSearch?.call(filters);
  }

  void _clearFilters() {
    _searchController.clear();
    _minAmountController.clear();
    _maxAmountController.clear();
    setState(() {
      _selectedType = null;
      _startDate = null;
      _endDate = null;
    });

    ref.read(transactionSearchFiltersProvider.notifier).state =
        const TransactionSearchFilters();
    widget.onClear?.call();
  }

  Future<void> _selectStartDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _startDate ?? DateTime.now(),
      firstDate: DateTime(2000),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _startDate = picked);
    }
  }

  Future<void> _selectEndDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _endDate ?? DateTime.now(),
      firstDate: _startDate ?? DateTime(2000),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _endDate = picked);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isMobile = MediaQuery.of(context).size.width < 600;

    return Card(
      elevation: 2,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header with title and toggle
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Search & Filter',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                IconButton(
                  icon: Icon(
                    _showAdvancedFilters
                        ? Icons.expand_less
                        : Icons.expand_more,
                  ),
                  onPressed: () => setState(
                    () => _showAdvancedFilters = !_showAdvancedFilters,
                  ),
                  tooltip: _showAdvancedFilters
                      ? 'Hide advanced filters'
                      : 'Show advanced filters',
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Basic search
            TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Search by description, ID, or site visit ID',
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
              ),
              onChanged: (_) => _applyFilters(),
            ),

            if (_showAdvancedFilters) ...[
              const SizedBox(height: 16),
              // Type filter
              DropdownButtonFormField<String>(
                initialValue: _selectedType,
                hint: const Text('Transaction Type'),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.category),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                ),
                items: [
                  const DropdownMenuItem(value: null, child: Text('All Types')),
                  const DropdownMenuItem(
                    value: TRANSACTION_TYPE_EARNING,
                    child: Text('Earnings'),
                  ),
                  const DropdownMenuItem(
                    value: TRANSACTION_TYPE_SITE_VISIT_FEE,
                    child: Text('Site Visit Fees'),
                  ),
                  const DropdownMenuItem(
                    value: TRANSACTION_TYPE_WITHDRAWAL,
                    child: Text('Withdrawals'),
                  ),
                  const DropdownMenuItem(
                    value: TRANSACTION_TYPE_BONUS,
                    child: Text('Bonuses'),
                  ),
                  const DropdownMenuItem(
                    value: TRANSACTION_TYPE_PENALTY,
                    child: Text('Penalties'),
                  ),
                ],
                onChanged: (value) {
                  setState(() => _selectedType = value);
                  _applyFilters();
                },
              ),
              const SizedBox(height: 12),

              // Amount range filters
              if (isMobile)
                Column(
                  children: [
                    TextField(
                      controller: _minAmountController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        hintText: 'Min Amount',
                        prefixIcon: const Icon(Icons.money),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                      onChanged: (_) => _applyFilters(),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _maxAmountController,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                        hintText: 'Max Amount',
                        prefixIcon: const Icon(Icons.money),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 12,
                        ),
                      ),
                      onChanged: (_) => _applyFilters(),
                    ),
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _minAmountController,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          hintText: 'Min Amount',
                          prefixIcon: const Icon(Icons.money),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        onChanged: (_) => _applyFilters(),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _maxAmountController,
                        keyboardType: TextInputType.number,
                        decoration: InputDecoration(
                          hintText: 'Max Amount',
                          prefixIcon: const Icon(Icons.money),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        onChanged: (_) => _applyFilters(),
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: 12),

              // Date range filters
              if (isMobile)
                Column(
                  children: [
                    InkWell(
                      onTap: _selectStartDate,
                      child: InputDecorator(
                        decoration: InputDecoration(
                          labelText: 'Start Date',
                          prefixIcon: const Icon(Icons.calendar_today),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        child: Text(
                          _startDate == null
                              ? 'Select start date'
                              : DateFormat('MMM dd, yyyy').format(_startDate!),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: _selectEndDate,
                      child: InputDecorator(
                        decoration: InputDecoration(
                          labelText: 'End Date',
                          prefixIcon: const Icon(Icons.calendar_today),
                          border: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(8),
                          ),
                          contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16,
                            vertical: 12,
                          ),
                        ),
                        child: Text(
                          _endDate == null
                              ? 'Select end date'
                              : DateFormat('MMM dd, yyyy').format(_endDate!),
                        ),
                      ),
                    ),
                  ],
                )
              else
                Row(
                  children: [
                    Expanded(
                      child: InkWell(
                        onTap: _selectStartDate,
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: 'Start Date',
                            prefixIcon: const Icon(Icons.calendar_today),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                          ),
                          child: Text(
                            _startDate == null
                                ? 'Select start date'
                                : DateFormat(
                                    'MMM dd, yyyy',
                                  ).format(_startDate!),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: InkWell(
                        onTap: _selectEndDate,
                        child: InputDecorator(
                          decoration: InputDecoration(
                            labelText: 'End Date',
                            prefixIcon: const Icon(Icons.calendar_today),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 16,
                              vertical: 12,
                            ),
                          ),
                          child: Text(
                            _endDate == null
                                ? 'Select end date'
                                : DateFormat('MMM dd, yyyy').format(_endDate!),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: 16),
            ],

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _applyFilters,
                    icon: const Icon(Icons.search),
                    label: const Text('Apply Filters'),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton.icon(
                  onPressed: _clearFilters,
                  icon: const Icon(Icons.clear),
                  label: const Text('Clear'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
