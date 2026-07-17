import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/task_approval.dart';
import '../../services/task_approvals_service.dart';
import 'tasks_design.dart';

class TaskApprovalsPanel extends StatefulWidget {
  final String taskId;

  const TaskApprovalsPanel({super.key, required this.taskId});

  @override
  State<TaskApprovalsPanel> createState() => _TaskApprovalsPanelState();
}

class _TaskApprovalsPanelState extends State<TaskApprovalsPanel> {
  final _service = TaskApprovalsService();
  List<TaskApprovalSummary> _items = [];
  final Map<String, List<Map<String, dynamic>>> _historyByApproval = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final items = await _service.fetchForTask(widget.taskId);
      final historyMap = <String, List<Map<String, dynamic>>>{};
      for (final item in items) {
        historyMap[item.id] = await _service.fetchApprovalHistory(item.id);
      }
      if (mounted) {
        setState(() {
          _items = items;
          _historyByApproval
            ..clear()
            ..addAll(historyMap);
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decide(TaskApprovalSummary item, bool approve) async {
    final notesController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(approve ? 'Approve' : 'Reject'),
        content: TextField(
          controller: notesController,
          decoration: InputDecoration(
            labelText: approve ? 'Notes (optional)' : 'Rejection reason',
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(approve ? 'Approve' : 'Reject'),
          ),
        ],
      ),
    );
    final notes = notesController.text;
    notesController.dispose();
    if (confirmed != true) return;

    final err = approve
        ? await _service.approve(item.id, notes: notes)
        : await _service.reject(item.id, notes);
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
    if (_items.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'No approval workflow on this task',
            textAlign: TextAlign.center,
            style: TasksDesign.caption(context),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: _items.length,
        itemBuilder: (_, i) {
          final item = _items[i];
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            decoration: TasksDesign.card(),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.workflowName ?? 'Approval',
                    style: TasksDesign.titleMd(context),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Stage ${item.currentStageNumber} · ${item.status}',
                    style: TasksDesign.caption(context),
                  ),
                  if (item.submittedAt != null)
                    Text(
                      'Submitted ${DateFormat.yMMMd().format(item.submittedAt!)}',
                      style: TasksDesign.caption(context),
                    ),
                  if (item.userCanAct) ...[
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => _decide(item, false),
                            child: const Text('Reject'),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: FilledButton(
                            onPressed: () => _decide(item, true),
                            style: FilledButton.styleFrom(
                              backgroundColor: TasksDesign.accent,
                            ),
                            child: const Text('Approve'),
                          ),
                        ),
                      ],
                    ),
                  ],
                  if ((_historyByApproval[item.id] ?? []).isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Text('History', style: TasksDesign.caption(context)),
                    ..._historyByApproval[item.id]!.map((h) {
                      final approver =
                          (h['profiles'] as Map?)?['full_name']?.toString();
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          'Stage ${h['stage_number']}: ${h['status']}'
                          '${approver != null ? ' — $approver' : ''}',
                          style: TasksDesign.body(context),
                        ),
                      );
                    }),
                  ],
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
