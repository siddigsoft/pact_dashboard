import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// Search and filter options for transactions
class TransactionSearchFilter {
  final String? searchQuery;
  final String? filterType; // 'all', 'earning', 'cost', 'advance'
  final DateTime? startDate;
  final DateTime? endDate;
  final double? minAmount;
  final double? maxAmount;
  final String? status; // 'completed', 'pending'

  TransactionSearchFilter({
    this.searchQuery,
    this.filterType,
    this.startDate,
    this.endDate,
    this.minAmount,
    this.maxAmount,
    this.status,
  });

  bool matches(Map<String, dynamic> transaction) {
    // Check search query
    if (searchQuery != null && searchQuery!.isNotEmpty) {
      final query = searchQuery!.toLowerCase();
      final desc = (transaction['description'] ?? '').toString().toLowerCase();
      if (!desc.contains(query)) return false;
    }

    // Check filter type
    if (filterType != null && filterType != 'all') {
      final txType = transaction['type'] ?? '';
      if (txType != filterType) return false;
    }

    // Check date range
    if (startDate != null || endDate != null) {
      final txDate = transaction['created_at'];
      if (txDate != null) {
        final date = DateTime.parse(txDate.toString());
        if (startDate != null && date.isBefore(startDate!)) return false;
        if (endDate != null && date.isAfter(endDate!)) return false;
      }
    }

    // Check amount range
    final amount = (transaction['amount'] ?? 0) as num;
    if (minAmount != null && amount < minAmount!) return false;
    if (maxAmount != null && amount > maxAmount!) return false;

    // Check status
    if (status != null && status!.isNotEmpty) {
      final txStatus = transaction['status'] ?? '';
      if (txStatus != status) return false;
    }

    return true;
  }
}

/// Search bar widget
class TransactionSearchBar extends StatefulWidget {
  final ValueChanged<String> onSearch;
  final bool isArabic;

  const TransactionSearchBar({
    super.key,
    required this.onSearch,
    this.isArabic = false,
  });

  @override
  State<TransactionSearchBar> createState() => _TransactionSearchBarState();
}

class _TransactionSearchBarState extends State<TransactionSearchBar> {
  late TextEditingController _controller;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: TextField(
        controller: _controller,
        onChanged: widget.onSearch,
        decoration: InputDecoration(
          hintText: widget.isArabic
              ? 'ابحث عن معاملة...'
              : 'Search transactions...',
          hintStyle: GoogleFonts.poppins(
            fontSize: 13,
            color: Colors.grey.shade500,
          ),
          prefixIcon: Icon(Icons.search_rounded, color: Colors.grey.shade500),
          suffixIcon: _controller.text.isNotEmpty
              ? IconButton(
                  icon: const Icon(Icons.clear_rounded),
                  onPressed: () {
                    _controller.clear();
                    widget.onSearch('');
                  },
                )
              : null,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.grey.shade300),
          ),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 12,
          ),
          fillColor: Colors.grey.shade50,
          filled: true,
        ),
        style: GoogleFonts.poppins(fontSize: 13),
      ),
    );
  }
}

/// Advanced filter bottom sheet
class AdvancedFilterSheet extends StatefulWidget {
  final TransactionSearchFilter initialFilter;
  final ValueChanged<TransactionSearchFilter> onFilterChanged;
  final bool isArabic;

  const AdvancedFilterSheet({
    super.key,
    required this.initialFilter,
    required this.onFilterChanged,
    this.isArabic = false,
  });

  @override
  State<AdvancedFilterSheet> createState() => _AdvancedFilterSheetState();
}

class _AdvancedFilterSheetState extends State<AdvancedFilterSheet> {
  late String _filterType;
  late DateTime? _startDate;
  late DateTime? _endDate;
  late double? _minAmount;
  late double? _maxAmount;
  late String? _status;

  @override
  void initState() {
    super.initState();
    _filterType = widget.initialFilter.filterType ?? 'all';
    _startDate = widget.initialFilter.startDate;
    _endDate = widget.initialFilter.endDate;
    _minAmount = widget.initialFilter.minAmount;
    _maxAmount = widget.initialFilter.maxAmount;
    _status = widget.initialFilter.status;
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.all(20),
            children: [
              // Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    widget.isArabic ? 'تصفية متقدمة' : 'Advanced Filters',
                    style: GoogleFonts.poppins(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Transaction type filter
              Text(
                widget.isArabic ? 'نوع المعاملة' : 'Transaction Type',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 10),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: ['all', 'earning', 'cost', 'advance']
                      .map(
                        (type) => _buildFilterButton(
                          type,
                          _filterType == type,
                          () => setState(() => _filterType = type),
                        ),
                      )
                      .toList(),
                ),
              ),
              const SizedBox(height: 20),

              // Date range
              Text(
                widget.isArabic ? 'نطاق التاريخ' : 'Date Range',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _buildDateField(
                      label: widget.isArabic ? 'من' : 'From',
                      date: _startDate,
                      onChanged: (date) => setState(() => _startDate = date),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildDateField(
                      label: widget.isArabic ? 'إلى' : 'To',
                      date: _endDate,
                      onChanged: (date) => setState(() => _endDate = date),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Amount range
              Text(
                widget.isArabic ? 'الحد الأدنى للمبلغ' : 'Minimum Amount',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  hintText: '0 SDG',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                onChanged: (val) =>
                    setState(() => _minAmount = double.tryParse(val)),
              ),
              const SizedBox(height: 16),

              Text(
                widget.isArabic ? 'الحد الأقصى للمبلغ' : 'Maximum Amount',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  hintText: '10000 SDG',
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                  ),
                ),
                onChanged: (val) =>
                    setState(() => _maxAmount = double.tryParse(val)),
              ),
              const SizedBox(height: 24),

              // Apply button
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () {
                        setState(() {
                          _filterType = 'all';
                          _startDate = null;
                          _endDate = null;
                          _minAmount = null;
                          _maxAmount = null;
                          _status = null;
                        });
                      },
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: Text(
                        widget.isArabic ? 'إعادة تعيين' : 'Reset',
                        style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        widget.onFilterChanged(
                          TransactionSearchFilter(
                            filterType: _filterType == 'all'
                                ? null
                                : _filterType,
                            startDate: _startDate,
                            endDate: _endDate,
                            minAmount: _minAmount,
                            maxAmount: _maxAmount,
                            status: _status,
                          ),
                        );
                        Navigator.pop(context);
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryBlue,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                      ),
                      child: Text(
                        widget.isArabic ? 'تطبيق' : 'Apply',
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildFilterButton(String label, bool isSelected, VoidCallback onTap) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(
          label,
          style: GoogleFonts.poppins(
            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
        selected: isSelected,
        onSelected: (_) => onTap(),
        backgroundColor: Colors.grey.shade200,
        selectedColor: AppColors.primaryBlue.withValues(alpha: 0.2),
        side: BorderSide(
          color: isSelected ? AppColors.primaryBlue : Colors.transparent,
        ),
      ),
    );
  }

  Widget _buildDateField({
    required String label,
    required DateTime? date,
    required ValueChanged<DateTime?> onChanged,
  }) {
    return GestureDetector(
      onTap: () async {
        final picked = await showDatePicker(
          context: context,
          initialDate: date ?? DateTime.now(),
          firstDate: DateTime(2020),
          lastDate: DateTime.now(),
        );
        if (picked != null) onChanged(picked);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          border: Border.all(color: Colors.grey.shade300),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          children: [
            Icon(
              Icons.calendar_today_rounded,
              size: 16,
              color: Colors.grey.shade600,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                date != null
                    ? '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}'
                    : label,
                style: GoogleFonts.poppins(fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
