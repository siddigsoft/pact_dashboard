import 'package:flutter/material.dart';

import '../../models/personal_task.dart';
import '../../utils/task_quadrant.dart';
import 'tasks_design.dart';

class TaskPlanningView extends StatelessWidget {
  final List<PersonalTask> tasks;
  final void Function(PersonalTask task) onTaskTap;
  final void Function(PersonalTask task, TaskQuadrant q)? onQuadrantSet;

  const TaskPlanningView({
    super.key,
    required this.tasks,
    required this.onTaskTap,
    this.onQuadrantSet,
  });

  Map<TaskQuadrant, List<PersonalTask>> _group() {
    final active = tasks.where((t) => t.isActive && !t.isProjectAdapter);
    final map = {
      for (final q in TaskQuadrant.values) q: <PersonalTask>[],
    };
    for (final t in active) {
      map[TaskQuadrantHelper.classify(t)]!.add(t);
    }
    return map;
  }

  @override
  Widget build(BuildContext context) {
    final groups = _group();
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
      children: [
        Text(
          'Eisenhower matrix',
          style: TasksDesign.titleLg(context),
        ),
        const SizedBox(height: 4),
        Text(
          'Prioritize by urgency and importance',
          style: TasksDesign.caption(context),
        ),
        const SizedBox(height: 16),
        ...TaskQuadrant.values.map((q) {
          final items = groups[q]!;
          return Container(
            margin: const EdgeInsets.only(bottom: 12),
            decoration: TasksDesign.card(),
            child: ExpansionTile(
              initiallyExpanded: q == TaskQuadrant.doFirst,
              title: Text(
                '${TaskQuadrantHelper.label(q)} (${items.length})',
                style: TasksDesign.titleMd(context),
              ),
              children: items.isEmpty
                  ? [
                      Padding(
                        padding: const EdgeInsets.all(14),
                        child: Text(
                          'No tasks',
                          style: TasksDesign.caption(context),
                        ),
                      ),
                    ]
                  : items
                      .map(
                        (t) => ListTile(
                          title: Text(t.title),
                          subtitle: Text(
                            PersonalTask.priorityLabel(t.priority),
                          ),
                          trailing: onQuadrantSet != null
                              ? PopupMenuButton<TaskQuadrant>(
                                  icon: const Icon(Icons.tune, size: 20),
                                  onSelected: (nq) => onQuadrantSet!(t, nq),
                                  itemBuilder: (_) => TaskQuadrant.values
                                      .map(
                                        (nq) => PopupMenuItem(
                                          value: nq,
                                          child: Text(
                                            TaskQuadrantHelper.label(nq),
                                          ),
                                        ),
                                      )
                                      .toList(),
                                )
                              : null,
                          onTap: () => onTaskTap(t),
                        ),
                      )
                      .toList(),
            ),
          );
        }),
      ],
    );
  }
}
