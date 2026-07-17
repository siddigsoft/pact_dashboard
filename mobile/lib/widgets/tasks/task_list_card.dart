import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/personal_task.dart';
import 'tasks_design.dart';

class TaskListCard extends StatelessWidget {
  final PersonalTask task;
  final VoidCallback onTap;
  final bool showAckBadge;

  const TaskListCard({
    super.key,
    required this.task,
    required this.onTap,
    this.showAckBadge = false,
  });

  @override
  Widget build(BuildContext context) {
    final statusColor = PersonalTask.statusColor(task.status);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(14),
          decoration: TasksDesign.card(
            borderColor: task.isOverdue ? const Color(0xFFFCA5A5) : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 4,
                    height: 44,
                    decoration: BoxDecoration(
                      color: PersonalTask.priorityColor(task.priority),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          task.title,
                          style: TasksDesign.titleMd(context),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (task.assignedToName != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            task.assignedToName!,
                            style: TasksDesign.caption(context),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
              if (task.description != null && task.description!.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  task.description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TasksDesign.caption(context),
                ),
              ],
              const SizedBox(height: 10),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  _Tag(
                    label: PersonalTask.statusLabel(task.status),
                    bg: TasksDesign.statusTint(task.status),
                    fg: statusColor,
                  ),
                  if (task.isProjectAdapter)
                    const _Tag(
                      label: 'Project',
                      bg: Color(0xFFE0E7FF),
                      fg: Color(0xFF3730A3),
                    ),
                  if (task.isRecurring)
                    const _Tag(
                      label: 'Recurring',
                      bg: Color(0xFFF3E8FF),
                      fg: Color(0xFF7C3AED),
                    ),
                  _Tag(
                    label: PersonalTask.priorityLabel(task.priority),
                    bg: PersonalTask.priorityColor(task.priority)
                        .withValues(alpha: 0.12),
                    fg: PersonalTask.priorityColor(task.priority),
                  ),
                  if (task.dueDate != null)
                    _Tag(
                      label: task.isDueToday
                          ? 'Due today'
                          : DateFormat.MMMd().format(task.dueDate!),
                      bg: task.isOverdue
                          ? const Color(0xFFFEE2E2)
                          : TasksDesign.line.withValues(alpha: 0.5),
                      fg: task.isOverdue
                          ? const Color(0xFFB91C1C)
                          : TasksDesign.muted,
                    ),
                  if (showAckBadge)
                    const _Tag(
                      label: 'Needs ack',
                      bg: Color(0xFFFFF7ED),
                      fg: Color(0xFFC2410C),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  final String label;
  final Color bg;
  final Color fg;

  const _Tag({required this.label, required this.bg, required this.fg});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TasksDesign.caption(context).copyWith(
          color: fg,
          fontWeight: FontWeight.w600,
          fontSize: 11,
        ),
      ),
    );
  }
}
