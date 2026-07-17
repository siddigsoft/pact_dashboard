import 'package:flutter/material.dart';

import '../../models/personal_task.dart';
import '../../models/task_dependency.dart';
import '../../services/task_dependencies_service.dart';
import 'task_dependency_graph.dart';
import 'tasks_design.dart';

class TaskDependenciesPanel extends StatefulWidget {
  final String taskId;
  final String taskTitle;
  final List<PersonalTask> myTasks;
  final String? projectId;

  const TaskDependenciesPanel({
    super.key,
    required this.taskId,
    required this.taskTitle,
    this.myTasks = const [],
    this.projectId,
  });

  @override
  State<TaskDependenciesPanel> createState() => _TaskDependenciesPanelState();
}

class _TaskDependenciesPanelState extends State<TaskDependenciesPanel> {
  final _service = TaskDependenciesService();
  List<TaskDependency> _deps = [];
  List<BlockingTaskInfo> _blocking = [];
  Map<String, dynamic> _criticalPath = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final deps = await _service.fetchForTask(widget.taskId);
      final blocking = await _service.blockingTasks(widget.taskId);
      final critical = await _service.findCriticalPath(
        projectId: widget.projectId,
      );
      if (mounted) {
        setState(() {
          _deps = deps;
          _blocking = blocking;
          _criticalPath = critical;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _addDependency() async {
    final parentId = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _LinkTaskPicker(
        title: 'This task is blocked by…',
        excludeId: widget.taskId,
        myTasks: widget.myTasks,
        service: _service,
      ),
    );
    if (parentId == null) return;
    final err = await _service.addDependency(
      parentTaskId: parentId,
      dependentTaskId: widget.taskId,
    );
    if (!mounted) return;
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    } else {
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_criticalPath.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: TasksDesign.card(
                borderColor: TasksDesign.accent.withValues(alpha: 0.4),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.route, color: TasksDesign.accent),
                      const SizedBox(width: 8),
                      Text('Critical path', style: TasksDesign.titleMd(context)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_criticalPath['total_duration'] != null)
                    Text(
                      'Duration: ${_criticalPath['total_duration']}',
                      style: TasksDesign.body(context),
                    ),
                  if (_criticalPath['tasks'] is List)
                    ...(_criticalPath['tasks'] as List).map((t) {
                      final m = t is Map
                          ? Map<String, dynamic>.from(t)
                          : <String, dynamic>{};
                      return Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          '• ${m['title'] ?? m['id'] ?? 'Task'}',
                          style: TasksDesign.caption(context),
                        ),
                      );
                    }),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          if (_blocking.isNotEmpty) ...[
            Container(
              padding: const EdgeInsets.all(14),
              decoration: TasksDesign.card(
                borderColor: const Color(0xFFFCA5A5),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.lock_outline, color: Color(0xFFB91C1C)),
                      const SizedBox(width: 8),
                      Text('Blocking tasks', style: TasksDesign.titleMd(context)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ..._blocking.map(
                    (b) => Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: Text(
                        '• ${b.title} (${b.status})',
                        style: TasksDesign.body(context),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],
          TaskDependencyGraph(
            taskId: widget.taskId,
            taskTitle: widget.taskTitle,
            dependencies: _deps,
            myTasks: widget.myTasks,
          ),
          const SizedBox(height: 16),
          Text('All links', style: TasksDesign.titleMd(context)),
          const SizedBox(height: 8),
          if (_deps.isEmpty)
            Text('No dependencies yet', style: TasksDesign.caption(context))
          else
            ..._deps.map((d) {
              final isParent = d.parentTaskId == widget.taskId;
              final otherId =
                  isParent ? d.dependentTaskId : d.parentTaskId;
              final label = isParent
                  ? 'Blocks task $otherId'
                  : 'Blocked by task $otherId';
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                decoration: TasksDesign.card(),
                child: ListTile(
                  title: Text(label, style: TasksDesign.body(context)),
                  subtitle: Text(
                    d.dependencyType,
                    style: TasksDesign.caption(context),
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () async {
                      final err = await _service.removeDependency(d.id);
                      if (!mounted) return;
                      if (err != null) {
                        ScaffoldMessenger.of(context)
                            .showSnackBar(SnackBar(content: Text(err)));
                      } else {
                        await _load();
                      }
                    },
                  ),
                ),
              );
            }),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _addDependency,
            icon: const Icon(Icons.add_link),
            label: const Text('Add blocker'),
            style: OutlinedButton.styleFrom(
              foregroundColor: TasksDesign.accent,
              side: const BorderSide(color: TasksDesign.accent),
            ),
          ),
        ],
      ),
    );
  }
}

class _LinkTaskPicker extends StatefulWidget {
  final String title;
  final String excludeId;
  final List<PersonalTask> myTasks;
  final TaskDependenciesService service;

  const _LinkTaskPicker({
    required this.title,
    required this.excludeId,
    required this.myTasks,
    required this.service,
  });

  @override
  State<_LinkTaskPicker> createState() => _LinkTaskPickerState();
}

class _LinkTaskPickerState extends State<_LinkTaskPicker> {
  final _query = TextEditingController();
  List<PersonalTask> _results = [];

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    if (q.trim().length < 2) {
      setState(() => _results = widget.myTasks
          .where((t) => t.id != widget.excludeId && t.title.toLowerCase().contains(q.toLowerCase()))
          .take(10)
          .toList());
      return;
    }
    final remote = await widget.service.searchTasksForLink(q);
    setState(() {
      _results = remote
          .where((t) => t.id != widget.excludeId)
          .toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(widget.title, style: TasksDesign.titleMd(context)),
          const SizedBox(height: 12),
          TextField(
            controller: _query,
            decoration: TasksDesign.fieldDecoration('Search tasks'),
            onChanged: _search,
          ),
          const SizedBox(height: 8),
          Flexible(
            child: ListView(
              shrinkWrap: true,
              children: _results
                  .map(
                    (t) => ListTile(
                      title: Text(t.title),
                      subtitle: Text(PersonalTask.statusLabel(t.status)),
                      onTap: () => Navigator.pop(context, t.id),
                    ),
                  )
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }
}
