import 'package:flutter/material.dart';

import '../../models/approval_workflow_option.dart';
import '../../services/task_approvals_service.dart';
import 'tasks_design.dart';

Future<bool?> showSubmitApprovalSheet(BuildContext context, String taskId) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: TasksDesign.surface,
    builder: (_) => _SubmitApprovalSheet(taskId: taskId),
  );
}

class _SubmitApprovalSheet extends StatefulWidget {
  final String taskId;

  const _SubmitApprovalSheet({required this.taskId});

  @override
  State<_SubmitApprovalSheet> createState() => _SubmitApprovalSheetState();
}

class _SubmitApprovalSheetState extends State<_SubmitApprovalSheet> {
  final _service = TaskApprovalsService();
  List<ApprovalWorkflowOption> _workflows = [];
  ApprovalWorkflowOption? _selected;
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final w = await _service.fetchWorkflows();
      if (mounted) {
        setState(() {
          _workflows = w;
          _selected = w.isNotEmpty ? w.first : null;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    if (_selected == null) return;
    setState(() => _submitting = true);
    final err = await _service.submitTaskForApproval(
      widget.taskId,
      _selected!.id,
    );
    if (!mounted) return;
    setState(() => _submitting = false);
    if (err != null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
    } else {
      Navigator.pop(context, true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Submit for approval', style: TasksDesign.titleLg(context)),
          const SizedBox(height: 16),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_workflows.isEmpty)
            Text(
              'No approval workflows configured',
              style: TasksDesign.caption(context),
            )
          else
            DropdownButtonFormField<ApprovalWorkflowOption>(
              value: _selected,
              decoration: TasksDesign.fieldDecoration('Workflow'),
              items: _workflows
                  .map(
                    (w) => DropdownMenuItem(
                      value: w,
                      child: Text(w.name),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() => _selected = v),
            ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _submitting || _selected == null ? null : _submit,
            child: _submitting
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Submit'),
          ),
        ],
      ),
    );
  }
}
