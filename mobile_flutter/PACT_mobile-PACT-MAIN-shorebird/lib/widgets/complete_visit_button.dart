import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_colors.dart';
import '../providers/active_visit_provider.dart';
import '../models/site_visit.dart';
import '../screens/complete_visit_screen.dart';

class CompleteVisitButton extends ConsumerStatefulWidget {
  final SiteVisit visit;
  final VoidCallback? onCompleteSuccess;
  final VoidCallback? onCompleteError;

  const CompleteVisitButton({
    super.key,
    required this.visit,
    this.onCompleteSuccess,
    this.onCompleteError,
  });

  @override
  ConsumerState<CompleteVisitButton> createState() =>
      _CompleteVisitButtonState();
}

class _CompleteVisitButtonState extends ConsumerState<CompleteVisitButton> {
  @override
  Widget build(BuildContext context) {
    final hasActiveVisit = ref.watch(hasActiveVisitProvider);
    final currentVisit = ref.watch(currentActiveVisitProvider);

    // Only show if this is the active visit
    if (!hasActiveVisit || currentVisit?.id != widget.visit.id) {
      return const SizedBox.shrink();
    }

    return SizedBox(
      width: double.infinity,
      height: 50,
      child: ElevatedButton.icon(
        onPressed: _navigateToCompleteScreen,
        icon: const Icon(Icons.check_circle),
        label: const Text('Complete Visit'),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.success,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
    );
  }

  Future<void> _navigateToCompleteScreen() async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => CompleteVisitScreen(
          visit: widget.visit,
          onCompleteSuccess: widget.onCompleteSuccess,
        ),
      ),
    );

    if (result == true) {
      // Visit was completed successfully
      widget.onCompleteSuccess?.call();
    }
  }
}
