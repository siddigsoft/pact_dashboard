import 'package:flutter/material.dart';

import '../../models/personal_task.dart';
import '../../models/task_dependency.dart';
import 'tasks_design.dart';

/// Lightweight dependency visualization (no graph package).
class TaskDependencyGraph extends StatelessWidget {
  final String taskId;
  final String taskTitle;
  final List<TaskDependency> dependencies;
  final List<PersonalTask> myTasks;

  const TaskDependencyGraph({
    super.key,
    required this.taskId,
    required this.taskTitle,
    required this.dependencies,
    this.myTasks = const [],
  });

  String _titleFor(String id) {
    for (final t in myTasks) {
      if (t.id == id) return t.title;
    }
    return id.length > 8 ? id.substring(0, 8) : id;
  }

  @override
  Widget build(BuildContext context) {
    final parents = dependencies
        .where((d) => d.dependentTaskId == taskId)
        .map((d) => d.parentTaskId)
        .toList();
    final children = dependencies
        .where((d) => d.parentTaskId == taskId)
        .map((d) => d.dependentTaskId)
        .toList();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: TasksDesign.card(),
      child: Column(
        children: [
          if (parents.isNotEmpty) ...[
            ...parents.map(
              (id) => _Node(
                label: _titleFor(id),
                subtitle: 'Must finish first',
                align: _NodeAlign.top,
              ),
            ),
            _connector(),
          ],
          _Node(
            label: taskTitle,
            subtitle: 'This task',
            align: _NodeAlign.center,
            highlight: true,
          ),
          if (children.isNotEmpty) ...[
            _connector(),
            ...children.map(
              (id) => _Node(
                label: _titleFor(id),
                subtitle: 'Waiting on this',
                align: _NodeAlign.bottom,
              ),
            ),
          ],
          if (parents.isEmpty && children.isEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                'No links in the graph yet',
                style: TasksDesign.caption(context),
              ),
            ),
        ],
      ),
    );
  }

  Widget _connector() {
    return Column(
      children: [
        Container(width: 2, height: 16, color: TasksDesign.line),
        const Icon(Icons.arrow_downward, size: 16, color: TasksDesign.muted),
        Container(width: 2, height: 16, color: TasksDesign.line),
      ],
    );
  }
}

enum _NodeAlign { top, center, bottom }

class _Node extends StatelessWidget {
  final String label;
  final String subtitle;
  final _NodeAlign align;
  final bool highlight;

  const _Node({
    required this.label,
    required this.subtitle,
    required this.align,
    this.highlight = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.symmetric(vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: highlight ? TasksDesign.accentSoft : const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: highlight ? TasksDesign.accent : TasksDesign.line,
        ),
      ),
      child: Column(
        children: [
          Text(
            label,
            textAlign: TextAlign.center,
            style: TasksDesign.body(context).copyWith(
              fontWeight: highlight ? FontWeight.w700 : FontWeight.w500,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(subtitle, style: TasksDesign.caption(context)),
        ],
      ),
    );
  }
}
