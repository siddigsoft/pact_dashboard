import 'package:flutter/material.dart';

import '../../models/personal_task.dart';
import 'task_list_card.dart';
import 'tasks_design.dart';

class TaskKanbanBoard extends StatelessWidget {
  final List<PersonalTask> tasks;
  final void Function(PersonalTask task) onTaskTap;
  final void Function(PersonalTask task, PersonalTaskStatus newStatus)?
      onStatusChange;
  final bool Function(PersonalTask task)? showAck;

  const TaskKanbanBoard({
    super.key,
    required this.tasks,
    required this.onTaskTap,
    this.onStatusChange,
    this.showAck,
  });

  static const _columns = [
    (PersonalTaskStatus.todo, 'To do'),
    (PersonalTaskStatus.inprogress, 'In progress'),
    (PersonalTaskStatus.onHold, 'On hold'),
    (PersonalTaskStatus.done, 'Done'),
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 88),
      children: _columns.map((col) {
        final status = col.$1;
        final label = col.$2;
        final columnTasks =
            tasks.where((t) => t.status == status && !t.isProjectAdapter).toList();
        return SizedBox(
          width: 280,
          child: Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Text(label, style: TasksDesign.titleMd(context)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: TasksDesign.line,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '${columnTasks.length}',
                        style: TasksDesign.caption(context).copyWith(
                          fontWeight: FontWeight.w700,
                          color: TasksDesign.ink,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: DragTarget<PersonalTask>(
                    onWillAcceptWithDetails: (_) => onStatusChange != null,
                    onAcceptWithDetails: (d) =>
                        onStatusChange?.call(d.data, status),
                    builder: (context, candidate, rejected) {
                      return AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: candidate.isNotEmpty
                              ? Border.all(
                                  color: TasksDesign.accent,
                                  width: 2,
                                )
                              : null,
                        ),
                        child: columnTasks.isEmpty
                            ? Center(
                                child: Text(
                                  candidate.isNotEmpty
                                      ? 'Drop here'
                                      : 'No tasks',
                                  style: TasksDesign.caption(context),
                                ),
                              )
                            : ListView.builder(
                                itemCount: columnTasks.length,
                                itemBuilder: (_, i) {
                                  final t = columnTasks[i];
                                  return LongPressDraggable<PersonalTask>(
                                    data: t,
                                    feedback: Material(
                                      elevation: 4,
                                      borderRadius: BorderRadius.circular(14),
                                      child: SizedBox(
                                        width: 260,
                                        child: Opacity(
                                          opacity: 0.9,
                                          child: TaskListCard(
                                            task: t,
                                            onTap: () {},
                                            showAckBadge:
                                                showAck?.call(t) ?? false,
                                          ),
                                        ),
                                      ),
                                    ),
                                    childWhenDragging: Opacity(
                                      opacity: 0.35,
                                      child: TaskListCard(
                                        task: t,
                                        onTap: () => onTaskTap(t),
                                        showAckBadge:
                                            showAck?.call(t) ?? false,
                                      ),
                                    ),
                                    child: TaskListCard(
                                      task: t,
                                      onTap: () => onTaskTap(t),
                                      showAckBadge: showAck?.call(t) ?? false,
                                    ),
                                  );
                                },
                              ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}
