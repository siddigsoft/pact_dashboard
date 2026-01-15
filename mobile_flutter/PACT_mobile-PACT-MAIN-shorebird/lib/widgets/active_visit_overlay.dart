import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_colors.dart';
import '../theme/app_design_system.dart';
import '../widgets/app_widgets.dart';
import '../providers/active_visit_provider.dart';
import '../screens/complete_visit_screen.dart';

/// Provider to track if the overlay is expanded or minimized (persists across navigation)
final overlayExpandedProvider = StateProvider<bool>((ref) => true);

class ActiveVisitOverlay extends ConsumerWidget {
  const ActiveVisitOverlay({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeVisitState = ref.watch(activeVisitProvider);
    final hasActiveVisit = activeVisitState.hasActiveVisit;

    if (!hasActiveVisit) return const SizedBox.shrink();

    final isExpanded = ref.watch(overlayExpandedProvider);

    return Positioned(
      bottom: 100,
      left: 16,
      right: 16,
      child: GestureDetector(
        onTap: () {
          ref.read(overlayExpandedProvider.notifier).state = !isExpanded;
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
          padding: EdgeInsets.all(isExpanded ? 16 : 12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: AppColors.shadow.withOpacity(0.3),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
            border: Border.all(
              color: AppColors.primaryOrange.withOpacity(0.3),
              width: 2,
            ),
          ),
          child: isExpanded
              ? _ExpandedOverlay(state: activeVisitState)
              : _MinimizedOverlay(state: activeVisitState),
        ),
      ),
    );
  }
}

/// Minimized view - just shows timer and site name
class _MinimizedOverlay extends StatelessWidget {
  final ActiveVisitState state;

  const _MinimizedOverlay({required this.state});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Pulsing indicator
        Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: AppColors.success,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: AppColors.success.withOpacity(0.5),
                blurRadius: 8,
                spreadRadius: 2,
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),

        // Site name (truncated)
        Expanded(
          child: Text(
            state.visit?.siteName ?? 'Active Visit',
            style: AppTextStyles.bodyMedium.copyWith(
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),

        // Timer
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.primaryOrange.withOpacity(0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.timer, size: 16, color: AppColors.primaryOrange),
              const SizedBox(width: 4),
              Text(
                state.formattedElapsedTime,
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.bold,
                  color: AppColors.primaryOrange,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
        ),

        // Expand icon
        const SizedBox(width: 8),
        Icon(Icons.expand_less, color: AppColors.textSecondary, size: 20),
      ],
    );
  }
}

/// Expanded view - shows full site details and actions
class _ExpandedOverlay extends ConsumerWidget {
  final ActiveVisitState state;

  const _ExpandedOverlay({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final visit = state.visit;
    if (visit == null) return const SizedBox.shrink();

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header with timer and collapse button
        Row(
          children: [
            // Pulsing indicator
            Container(
              width: 12,
              height: 12,
              decoration: BoxDecoration(
                color: AppColors.success,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.success.withOpacity(0.5),
                    blurRadius: 8,
                    spreadRadius: 2,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              'VISIT IN PROGRESS',
              style: AppTextStyles.labelSmall.copyWith(
                color: AppColors.success,
                fontWeight: FontWeight.bold,
                letterSpacing: 1,
              ),
            ),
            const Spacer(),
            // Timer
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.primaryOrange.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.timer, size: 18, color: AppColors.primaryOrange),
                  const SizedBox(width: 6),
                  Text(
                    state.formattedElapsedTime,
                    style: AppTextStyles.titleMedium.copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.primaryOrange,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(Icons.expand_more, color: AppColors.textSecondary),
          ],
        ),

        const SizedBox(height: 16),
        const Divider(height: 1),
        const SizedBox(height: 16),

        // Site name
        Text(
          visit.siteName,
          style: AppTextStyles.headlineSmall.copyWith(
            fontWeight: FontWeight.bold,
            color: AppColors.textPrimary,
          ),
        ),

        const SizedBox(height: 8),

        // Site code
        if (visit.siteCode.isNotEmpty)
          _buildInfoRow(Icons.qr_code, 'Code', visit.siteCode),

        // Location
        _buildInfoRow(
          Icons.location_on,
          'Location',
          '${visit.state}${visit.locality.isNotEmpty ? ', ${visit.locality}' : ''}',
        ),

        // Activity
        if (visit.activity.isNotEmpty)
          _buildInfoRow(Icons.work, 'Activity', visit.activity),

        // Due date
        if (visit.dueDate != null)
          _buildInfoRow(
            Icons.calendar_today,
            'Scheduled',
            _formatDate(visit.dueDate!),
          ),

        // GPS Status
        if (state.currentLocation != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.success.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.success.withOpacity(0.3)),
            ),
            child: Row(
              children: [
                Icon(Icons.gps_fixed, size: 16, color: AppColors.success),
                const SizedBox(width: 8),
                Text(
                  'GPS Tracking Active',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.success,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const Spacer(),
                Text(
                  'Accuracy: ${state.currentLocation!.accuracy.toStringAsFixed(0)}m',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.success,
                  ),
                ),
              ],
            ),
          ),
        ],

        // Cost info if available
        if (visit.cost != null && visit.cost! > 0) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.blue.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Icon(Icons.payments, size: 16, color: Colors.blue),
                const SizedBox(width: 8),
                Text(
                  'Total Payout:',
                  style: AppTextStyles.bodySmall.copyWith(color: Colors.blue),
                ),
                const Spacer(),
                Text(
                  '${visit.cost!.toStringAsFixed(0)} SDG',
                  style: AppTextStyles.bodyMedium.copyWith(
                    color: Colors.blue,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ],

        const SizedBox(height: 16),

        // Hint text
        Text(
          'Tap anywhere to minimize • Photos & notes added at completion',
          style: AppTextStyles.bodySmall.copyWith(
            color: AppColors.textTertiary,
            fontStyle: FontStyle.italic,
          ),
          textAlign: TextAlign.center,
        ),

        const SizedBox(height: 16),

        // Complete button - opens photo/notes form
        SizedBox(
          width: double.infinity,
          height: 50,
          child: ElevatedButton.icon(
            onPressed: () => _navigateToCompleteScreen(context, ref, visit),
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
        ),
      ],
    );
  }

  Widget _buildInfoRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 16, color: AppColors.textSecondary),
          const SizedBox(width: 8),
          Text(
            '$label: ',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(DateTime date) {
    return '${date.day}/${date.month}/${date.year}';
  }

  Future<void> _navigateToCompleteScreen(
    BuildContext context,
    WidgetRef ref,
    dynamic visit,
  ) async {
    final result = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (context) => CompleteVisitScreen(
          visit: visit,
          onCompleteSuccess: () {
            // Overlay will hide automatically when visit is completed
          },
        ),
      ),
    );

    if (result == true && context.mounted) {
      AppSnackBar.show(
        context,
        message: 'Visit completed successfully!',
        type: SnackBarType.success,
      );
    }
  }
}
