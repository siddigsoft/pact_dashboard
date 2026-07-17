import 'package:flutter/material.dart';

import '../../models/personal_task.dart';
import '../../utils/task_html_utils.dart';
import 'tasks_design.dart';

class TaskInboxView extends StatefulWidget {
  final List<PersonalTask> tasks;
  final void Function(PersonalTask task) onTaskTap;
  final bool Function(PersonalTask task)? showAck;

  const TaskInboxView({
    super.key,
    required this.tasks,
    required this.onTaskTap,
    this.showAck,
  });

  @override
  State<TaskInboxView> createState() => _TaskInboxViewState();
}

class _TaskInboxViewState extends State<TaskInboxView> {
  PersonalTask? _selected;

  @override
  Widget build(BuildContext context) {
    final active = widget.tasks.where((t) => t.isActive).toList();
    if (active.isEmpty) {
      return Center(
        child: Text('Inbox empty', style: TasksDesign.caption(context)),
      );
    }

    _selected ??= active.first;

    return Row(
      children: [
        SizedBox(
          width: MediaQuery.of(context).size.width * 0.42,
          child: ListView.builder(
            itemCount: active.length,
            itemBuilder: (_, i) {
              final t = active[i];
              final sel = _selected?.id == t.id;
              return Material(
                color: sel ? TasksDesign.accentSoft : Colors.transparent,
                child: ListTile(
                  dense: true,
                  title: Text(
                    t.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TasksDesign.body(context).copyWith(
                      fontWeight: sel ? FontWeight.w700 : FontWeight.w400,
                    ),
                  ),
                  subtitle: Text(PersonalTask.statusLabel(t.status)),
                  trailing: widget.showAck?.call(t) == true
                      ? const Icon(Icons.circle, size: 8, color: Color(0xFFC2410C))
                      : null,
                  onTap: () => setState(() => _selected = t),
                ),
              );
            },
          ),
        ),
        const VerticalDivider(width: 1),
        Expanded(child: _buildDetail(_selected!)),
      ],
    );
  }

  Widget _buildDetail(PersonalTask task) {
    final desc = TaskHtmlUtils.toPlainText(task.displayDescription);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(task.title, style: TasksDesign.titleMd(context)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            children: [
              Chip(
                label: Text(PersonalTask.statusLabel(task.status)),
                visualDensity: VisualDensity.compact,
              ),
              Chip(
                label: Text(PersonalTask.priorityLabel(task.priority)),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          if (desc.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(desc, style: TasksDesign.body(context)),
          ],
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () => widget.onTaskTap(task),
            child: const Text('Open full detail'),
          ),
        ],
      ),
    );
  }
}
