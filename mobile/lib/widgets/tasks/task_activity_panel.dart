import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../services/task_activity_service.dart';
import 'tasks_design.dart';

class TaskActivityPanel extends StatefulWidget {
  final String taskId;

  const TaskActivityPanel({super.key, required this.taskId});

  @override
  State<TaskActivityPanel> createState() => _TaskActivityPanelState();
}

class _TaskActivityPanelState extends State<TaskActivityPanel> {
  final _service = TaskActivityService();
  List<TaskStatusHistoryEntry> _history = [];
  List<TaskActivityEntry> _activity = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    final history = await _service.fetchStatusHistory(widget.taskId);
    final activity = await _service.fetchActivity(widget.taskId);
    if (mounted) {
      setState(() {
        _history = history;
        _activity = activity;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_history.isEmpty && _activity.isEmpty) {
      return Center(
        child: Text('No activity yet', style: TasksDesign.caption(context)),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_history.isNotEmpty) ...[
            Text('Status history', style: TasksDesign.titleMd(context)),
            const SizedBox(height: 8),
            ..._history.map(_historyTile),
            const SizedBox(height: 20),
          ],
          if (_activity.isNotEmpty) ...[
            Text('Activity', style: TasksDesign.titleMd(context)),
            const SizedBox(height: 8),
            ..._activity.map(_activityTile),
          ],
        ],
      ),
    );
  }

  Widget _historyTile(TaskStatusHistoryEntry e) {
    final when = DateFormat.MMMd().add_jm().format(e.createdAt);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: TasksDesign.card(),
      child: ListTile(
        dense: true,
        title: Text(
          '${e.fromStatus ?? '—'} → ${e.toStatus}',
          style: TasksDesign.body(context),
        ),
        subtitle: Text(
          [
            if (e.changedByName != null) e.changedByName!,
            when,
            if (e.reason != null && e.reason!.isNotEmpty) e.reason!,
          ].join(' · '),
          style: TasksDesign.caption(context),
        ),
      ),
    );
  }

  Widget _activityTile(TaskActivityEntry e) {
    final when = DateFormat.MMMd().add_jm().format(e.createdAt);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: TasksDesign.card(),
      child: ListTile(
        dense: true,
        title: Text(e.kind, style: TasksDesign.body(context)),
        subtitle: Text(
          [
            if (e.userName != null) e.userName!,
            when,
            if (e.body != null && e.body!.isNotEmpty) e.body!,
          ].join(' · '),
          style: TasksDesign.caption(context),
        ),
      ),
    );
  }
}
