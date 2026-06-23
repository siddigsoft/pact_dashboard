import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';

class StatusBadge extends StatelessWidget {
  final String status;
  final double fontSize;

  const StatusBadge({super.key, required this.status, this.fontSize = 11});

  Color get _bgColor {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'draft':
        return AppColors.statusPending.withOpacity(0.12);
      case 'approved':
      case 'completed':
      case 'done':
      case 'paid':
        return AppColors.statusApproved.withOpacity(0.12);
      case 'rejected':
      case 'overdue':
      case 'failed':
        return AppColors.statusRejected.withOpacity(0.12);
      case 'inprogress':
      case 'in_progress':
      case 'under_review':
      case 'assigned':
        return AppColors.statusInProgress.withOpacity(0.12);
      case 'reconciled':
        return AppColors.primary.withOpacity(0.12);
      default:
        return AppColors.textSecondary.withOpacity(0.12);
    }
  }

  Color get _textColor {
    switch (status.toLowerCase()) {
      case 'pending':
      case 'draft':
        return AppColors.statusPending;
      case 'approved':
      case 'completed':
      case 'done':
      case 'paid':
        return AppColors.statusApproved;
      case 'rejected':
      case 'overdue':
      case 'failed':
        return AppColors.statusRejected;
      case 'inprogress':
      case 'in_progress':
      case 'under_review':
      case 'assigned':
        return AppColors.statusInProgress;
      case 'reconciled':
        return AppColors.primary;
      default:
        return AppColors.textSecondary;
    }
  }

  String get _label {
    switch (status.toLowerCase()) {
      case 'inprogress':
      case 'in_progress':
        return 'In Progress';
      case 'under_review':
        return 'Under Review';
      default:
        return status[0].toUpperCase() + status.substring(1);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: _bgColor,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        _label,
        style: TextStyle(
          color: _textColor,
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
