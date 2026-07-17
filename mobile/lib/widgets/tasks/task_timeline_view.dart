import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/personal_task.dart';
import 'tasks_design.dart';

class TaskTimelineView extends StatefulWidget {
  final List<PersonalTask> tasks;
  final void Function(PersonalTask task) onTaskTap;

  const TaskTimelineView({
    super.key,
    required this.tasks,
    required this.onTaskTap,
  });

  @override
  State<TaskTimelineView> createState() => _TaskTimelineViewState();
}

class _TaskTimelineViewState extends State<TaskTimelineView> {
  late DateTime _weekStart;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _weekStart = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));
  }

  void _shiftWeek(int delta) {
    setState(() {
      _weekStart = _weekStart.add(Duration(days: 7 * delta));
    });
  }

  List<DateTime> get _days => List.generate(
    7,
    (i) => _weekStart.add(Duration(days: i)),
  );

  List<PersonalTask> _tasksOnDay(DateTime day) {
    return widget.tasks.where((t) {
      if (t.dueDate == null) return false;
      final d = t.dueDate!;
      return d.year == day.year && d.month == day.month && d.day == day.day;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final weekEnd = _weekStart.add(const Duration(days: 6));
    final rangeLabel =
        '${DateFormat.MMMd().format(_weekStart)} – ${DateFormat.MMMd().format(weekEnd)}';

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: Row(
            children: [
              IconButton(
                onPressed: () => _shiftWeek(-1),
                icon: const Icon(Icons.chevron_left),
                color: TasksDesign.ink,
              ),
              Expanded(
                child: Text(
                  rangeLabel,
                  textAlign: TextAlign.center,
                  style: TasksDesign.titleMd(context),
                ),
              ),
              IconButton(
                onPressed: () => _shiftWeek(1),
                icon: const Icon(Icons.chevron_right),
                color: TasksDesign.ink,
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
            itemCount: _days.length,
            itemBuilder: (_, i) {
              final day = _days[i];
              final dayTasks = _tasksOnDay(day);
              final isToday = _isSameDay(day, DateTime.now());
              return Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Container(
                  decoration: TasksDesign.card(
                    borderColor: isToday ? TasksDesign.accent : null,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 14,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: isToday
                              ? TasksDesign.accentSoft
                              : const Color(0xFFF8FAFC),
                          borderRadius: const BorderRadius.vertical(
                            top: Radius.circular(14),
                          ),
                        ),
                        child: Row(
                          children: [
                            Text(
                              DateFormat.E().format(day),
                              style: TasksDesign.caption(context).copyWith(
                                fontWeight: FontWeight.w700,
                                color: TasksDesign.ink,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text(
                              DateFormat.MMMd().format(day),
                              style: TasksDesign.titleMd(context),
                            ),
                            const Spacer(),
                            Text(
                              '${dayTasks.length}',
                              style: TasksDesign.caption(context),
                            ),
                          ],
                        ),
                      ),
                      if (dayTasks.isEmpty)
                        Padding(
                          padding: const EdgeInsets.all(14),
                          child: Text(
                            'No due tasks',
                            style: TasksDesign.caption(context),
                          ),
                        )
                      else
                        ...dayTasks.map(
                          (t) => _TimelineTaskRow(
                            task: t,
                            onTap: () => widget.onTaskTap(t),
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  bool _isSameDay(DateTime a, DateTime b) =>
      a.year == b.year && a.month == b.month && a.day == b.day;
}

class _TimelineTaskRow extends StatelessWidget {
  final PersonalTask task;
  final VoidCallback onTap;

  const _TimelineTaskRow({required this.task, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: PersonalTask.priorityColor(task.priority),
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                task.title,
                style: TasksDesign.body(context),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              PersonalTask.statusLabel(task.status),
              style: TasksDesign.caption(context).copyWith(
                color: PersonalTask.statusColor(task.status),
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
