import 'dart:async';

import 'package:flutter/material.dart';

import '../../services/task_work_session_store.dart';
import 'tasks_design.dart';

class TaskWorkSessionCard extends StatefulWidget {
  final String taskId;
  final String userId;
  final bool enabled;
  final Future<void> Function(double hours)? onApplyHours;

  const TaskWorkSessionCard({
    super.key,
    required this.taskId,
    required this.userId,
    this.enabled = true,
    this.onApplyHours,
  });

  @override
  State<TaskWorkSessionCard> createState() => _TaskWorkSessionCardState();
}

class _TaskWorkSessionCardState extends State<TaskWorkSessionCard> {
  late TaskWorkSessionStore _session;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _session = TaskWorkSessionStore(
      taskId: widget.taskId,
      userId: widget.userId,
    );
    _session.load().then((_) {
      if (mounted) setState(() {});
      _startTick();
    });
  }

  void _startTick() {
    _tick?.cancel();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_session.isRunning && mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  String _format(int sec) {
    final h = sec ~/ 3600;
    final m = (sec % 3600) ~/ 60;
    final s = sec % 60;
    if (h > 0) return '${h}h ${m}m';
    if (m > 0) return '${m}m ${s}s';
    return '${s}s';
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.enabled) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: TasksDesign.card(),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Work session', style: TasksDesign.titleMd(context)),
          const SizedBox(height: 8),
          Text(
            _format(_session.elapsedSec),
            style: TasksDesign.titleLg(context).copyWith(
              color: TasksDesign.accent,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              FilledButton.icon(
                onPressed: _session.isRunning
                    ? () async {
                        await _session.pause();
                        setState(() {});
                      }
                    : () async {
                        await _session.start();
                        setState(() {});
                      },
                icon: Icon(_session.isRunning ? Icons.pause : Icons.play_arrow),
                label: Text(_session.isRunning ? 'Pause' : 'Start'),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () async {
                  await _session.reset();
                  setState(() {});
                },
                child: const Text('Reset'),
              ),
            ],
          ),
          if (widget.onApplyHours != null && _session.elapsedSec > 0) ...[
            const SizedBox(height: 10),
            TextButton(
              onPressed: () =>
                  widget.onApplyHours!(_session.elapsedHours),
              child: Text(
                'Apply ${_session.elapsedHours.toStringAsFixed(2)} h to task',
              ),
            ),
          ],
        ],
      ),
    );
  }
}
