import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/personal_task.dart';
import 'task_list_card.dart';
import 'tasks_design.dart';

/// Today-focused planner: due today, overdue, then in progress.
class TaskPlannerView extends StatelessWidget {
  final List<PersonalTask> tasks;
  final void Function(PersonalTask task) onTaskTap;
  final bool Function(PersonalTask task)? showAck;

  const TaskPlannerView({
    super.key,
    required this.tasks,
    required this.onTaskTap,
    this.showAck,
  });

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final active = tasks.where((t) => t.isActive).toList();
    final overdue = active.where((t) => t.isOverdue).toList();
    final dueToday = active
        .where((t) => t.isDueToday && !t.isOverdue)
        .toList();
    final inProgress = active
        .where((t) => t.status == PersonalTaskStatus.inprogress)
        .toList();

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
      children: [
        Text(
          DateFormat('EEEE, MMM d').format(now),
          style: TasksDesign.titleLg(context),
        ),
        const SizedBox(height: 16),
        _Section(
          title: 'Overdue',
          count: overdue.length,
          color: const Color(0xFFB91C1C),
          tasks: overdue,
          onTaskTap: onTaskTap,
          showAck: showAck,
        ),
        _Section(
          title: 'Due today',
          count: dueToday.length,
          color: TasksDesign.accent,
          tasks: dueToday,
          onTaskTap: onTaskTap,
          showAck: showAck,
        ),
        _Section(
          title: 'In progress',
          count: inProgress.length,
          color: const Color(0xFF059669),
          tasks: inProgress,
          onTaskTap: onTaskTap,
          showAck: showAck,
        ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final int count;
  final Color color;
  final List<PersonalTask> tasks;
  final void Function(PersonalTask task) onTaskTap;
  final bool Function(PersonalTask task)? showAck;

  const _Section({
    required this.title,
    required this.count,
    required this.color,
    required this.tasks,
    required this.onTaskTap,
    this.showAck,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 8),
            Text('$title ($count)', style: TasksDesign.titleMd(context)),
          ],
        ),
        const SizedBox(height: 8),
        if (tasks.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text('None', style: TasksDesign.caption(context)),
          )
        else
          ...tasks.map(
            (t) => TaskListCard(
              task: t,
              onTap: () => onTaskTap(t),
              showAckBadge: showAck?.call(t) ?? false,
            ),
          ),
        const SizedBox(height: 8),
      ],
    );
  }
}
