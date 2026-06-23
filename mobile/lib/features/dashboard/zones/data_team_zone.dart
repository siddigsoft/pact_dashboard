import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../auth/services/auth_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/constants/app_constants.dart';
import '../../../shared/widgets/app_stat_card.dart';

class DataTeamZone extends ConsumerWidget {
  const DataTeamZone({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('Data Team Dashboard', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        Text('${user?.displayName ?? ''}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13)),
        const SizedBox(height: 24),
        const Text('Quick Access', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        const SizedBox(height: 12),
        _QuickTile(Icons.check_circle_outline, 'My Tasks', AppRoutes.myTasks, context),
        _QuickTile(Icons.list_alt_outlined, 'MMP Management', AppRoutes.mmp, context),
        _QuickTile(Icons.map_outlined, 'Field Ops Hub', AppRoutes.fieldOps, context),
        _QuickTile(Icons.bar_chart, 'Analytics Hub', AppRoutes.analytics, context),
        _QuickTile(Icons.chat_outlined, 'Communication', AppRoutes.communication, context),
        _QuickTile(Icons.calendar_today_outlined, 'Calendar', AppRoutes.calendar, context),
        _QuickTile(Icons.notifications_outlined, 'Notifications', AppRoutes.notifications, context),
        _QuickTile(Icons.receipt_outlined, 'Cost Submission (Own)', AppRoutes.costSubmission, context),
      ],
    );
  }
}

Widget _QuickTile(IconData icon, String title, String route, BuildContext context) {
  return Card(
    margin: const EdgeInsets.only(bottom: 10),
    child: ListTile(
      leading: Icon(icon, color: AppColors.dataTeamColor),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
      trailing: const Icon(Icons.arrow_forward_ios, size: 14, color: AppColors.textSecondary),
      onTap: () => context.go(route),
    ),
  );
}
