import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_colors.dart';

/// A professional MMP filter bar widget that matches the blue gradient theme
/// of the withdrawal/advance request dialogs.
///
/// Shows a compact blue gradient bar displaying the current MMP selection.
/// Tapping it opens a styled bottom sheet with all MMP options listed.
class MmpFilterBar extends StatelessWidget {
  final List<Map<String, dynamic>> mmpOptions;
  final String? selectedMmpId;
  final ValueChanged<String?> onChanged;
  final int totalCount;
  final int filteredCount;

  const MmpFilterBar({
    super.key,
    required this.mmpOptions,
    required this.selectedMmpId,
    required this.onChanged,
    required this.totalCount,
    required this.filteredCount,
  });

  String get _selectedLabel {
    if (selectedMmpId == null) return 'All MMPs';
    final match = mmpOptions.firstWhere(
      (m) => m['id'] == selectedMmpId,
      orElse: () => {'name': 'All MMPs'},
    );
    return match['name'] as String? ?? 'All MMPs';
  }

  bool get _isFiltered => selectedMmpId != null;

  void _openSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _MmpPickerSheet(
        mmpOptions: mmpOptions,
        selectedMmpId: selectedMmpId,
        totalCount: totalCount,
        onSelected: (id) {
          Navigator.pop(context);
          onChanged(id);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Always show the filter bar, even with a single MMP
    // This provides consistent UI and allows users to see which MMP is active
    if (mmpOptions.isEmpty) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── Blue gradient tap target ──────────────────────────────────────
          GestureDetector(
            onTap: () => _openSheet(context),
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primaryBlue, AppColors.darkBlue],
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                ),
                borderRadius: BorderRadius.circular(12),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primaryBlue.withValues(alpha: 0.30),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              child: Row(
                children: [
                  // Icon
                  Container(
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Icon(
                      Icons.filter_list_rounded,
                      color: Colors.white,
                      size: 16,
                    ),
                  ),
                  const SizedBox(width: 10),

                  // Label
                  Expanded(
                    child: Text(
                      _selectedLabel,
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: Colors.white,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),

                  // Clear button (only when a filter is active)
                  if (_isFiltered) ...[
                    GestureDetector(
                      onTap: () => onChanged(null),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.22),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'Clear',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(width: 3),
                            const Icon(
                              Icons.close_rounded,
                              size: 12,
                              color: Colors.white,
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],

                  // Chevron
                  const Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                ],
              ),
            ),
          ),

          // ── Result count strip (only when filtered) ───────────────────────
          if (_isFiltered)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: const Color(0xFFF0F7FF),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: AppColors.primaryBlue.withValues(alpha: 0.18),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.info_outline_rounded,
                    size: 13,
                    color: AppColors.primaryBlue.withValues(alpha: 0.7),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    'Showing $filteredCount of $totalCount sites',
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: AppColors.darkBlue,
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Bottom-sheet picker for MMP selection
class _MmpPickerSheet extends StatelessWidget {
  final List<Map<String, dynamic>> mmpOptions;
  final String? selectedMmpId;
  final int totalCount;
  final ValueChanged<String?> onSelected;

  const _MmpPickerSheet({
    required this.mmpOptions,
    required this.selectedMmpId,
    required this.totalCount,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── Blue gradient header ─────────────────────────────────────────
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [AppColors.primaryBlue, AppColors.darkBlue],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
            ),
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
            child: Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.filter_list_rounded,
                    color: Colors.white,
                    size: 18,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Filter by MMP',
                        style: GoogleFonts.poppins(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      Text(
                        '${mmpOptions.length} MMPs · $totalCount total sites',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: Colors.white.withValues(alpha: 0.80),
                        ),
                      ),
                    ],
                  ),
                ),
                GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: Container(
                    width: 30,
                    height: 30,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.18),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Icon(
                      Icons.close_rounded,
                      color: Colors.white,
                      size: 16,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── MMP list ────────────────────────────────────────────────────
          ConstrainedBox(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(context).size.height * 0.65,
            ),
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 8),
              children: [
                // "All MMPs" option
                _MmpOption(
                  id: null,
                  name: 'All MMPs',
                  count: totalCount,
                  isSelected: selectedMmpId == null,
                  onTap: () => onSelected(null),
                ),
                const Divider(height: 1, indent: 20, endIndent: 20),
                // Individual MMPs
                ...mmpOptions.map((mmp) {
                  final id = mmp['id'] as String;
                  final name = mmp['name'] as String;
                  final count = mmp['count'] as int;
                  return _MmpOption(
                    id: id,
                    name: name,
                    count: count,
                    isSelected: selectedMmpId == id,
                    onTap: () => onSelected(id),
                  );
                }),
              ],
            ),
          ),

          SizedBox(height: MediaQuery.of(context).padding.bottom + 8),
        ],
      ),
    );
  }
}

class _MmpOption extends StatelessWidget {
  final String? id;
  final String name;
  final int count;
  final bool isSelected;
  final VoidCallback onTap;

  const _MmpOption({
    required this.id,
    required this.name,
    required this.count,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        color: isSelected
            ? AppColors.primaryBlue.withValues(alpha: 0.07)
            : Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
        child: Row(
          children: [
            // Radio indicator
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isSelected
                      ? AppColors.primaryBlue
                      : AppColors.borderColor,
                  width: isSelected ? 2 : 1.5,
                ),
                color: isSelected
                    ? AppColors.primaryBlue.withValues(alpha: 0.12)
                    : Colors.transparent,
              ),
              child: isSelected
                  ? const Center(
                      child: Icon(
                        Icons.circle,
                        size: 8,
                        color: AppColors.primaryBlue,
                      ),
                    )
                  : null,
            ),
            const SizedBox(width: 14),

            // Name
            Expanded(
              child: Text(
                name,
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: isSelected ? FontWeight.w600 : FontWeight.w500,
                  color: isSelected ? AppColors.darkBlue : AppColors.textDark,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),

            // Count badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.primaryBlue.withValues(alpha: 0.12)
                    : const Color(0xFFF0F0F0),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                '$count',
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: isSelected
                      ? AppColors.primaryBlue
                      : AppColors.textLight,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
