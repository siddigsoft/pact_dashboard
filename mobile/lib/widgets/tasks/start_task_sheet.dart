import 'package:flutter/material.dart';

import '../../models/personal_task.dart';
import '../../models/start_task_input.dart';
import 'tasks_design.dart';

Future<StartTaskInput?> showStartTaskSheet(
  BuildContext context, {
  required PersonalTask task,
}) {
  return showModalBottomSheet<StartTaskInput>(
    context: context,
    isScrollControlled: true,
    backgroundColor: TasksDesign.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _StartTaskSheet(task: task),
  );
}

class _StartTaskSheet extends StatefulWidget {
  final PersonalTask task;

  const _StartTaskSheet({required this.task});

  @override
  State<_StartTaskSheet> createState() => _StartTaskSheetState();
}

class _StartTaskSheetState extends State<_StartTaskSheet> {
  final _hours = TextEditingController();
  final _days = TextEditingController();
  final _requirements = TextEditingController();

  @override
  void initState() {
    super.initState();
    if (widget.task.estimatedHours != null) {
      _hours.text = widget.task.estimatedHours!.toString();
    }
    _days.text = '1';
  }

  @override
  void dispose() {
    _hours.dispose();
    _days.dispose();
    _requirements.dispose();
    super.dispose();
  }

  void _submit() {
    final h = double.tryParse(_hours.text.trim());
    final d = int.tryParse(_days.text.trim());
    if (h == null || h <= 0 || d == null || d <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Enter valid estimated hours and days')),
      );
      return;
    }
    Navigator.pop(
      context,
      StartTaskInput(
        estimatedHours: h,
        estimatedDays: d,
        requirements: _requirements.text.trim().isEmpty
            ? null
            : _requirements.text.trim(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Start task', style: TasksDesign.titleLg(context)),
          const SizedBox(height: 6),
          Text(
            widget.task.title,
            style: TasksDesign.caption(context),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _hours,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: TasksDesign.fieldDecoration('Estimated hours'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _days,
            keyboardType: TextInputType.number,
            decoration: TasksDesign.fieldDecoration('Estimated days'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _requirements,
            decoration: TasksDesign.fieldDecoration(
              'Requirements / notes',
              hint: 'What do you need before you can finish?',
            ),
            maxLines: 3,
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _submit,
            style: FilledButton.styleFrom(
              backgroundColor: TasksDesign.accent,
              padding: const EdgeInsets.symmetric(vertical: 14),
            ),
            child: const Text('Start working'),
          ),
        ],
      ),
    );
  }
}
