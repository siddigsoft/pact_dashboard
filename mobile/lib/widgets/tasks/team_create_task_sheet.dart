import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/create_task_input.dart';
import '../../models/personal_task.dart';
import '../../models/profile_option.dart';
import '../../services/team_tasks_service.dart';
import 'tasks_design.dart';

Future<bool?> showTeamCreateTaskSheet(
  BuildContext context, {
  required ProfileOption employee,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: TasksDesign.surface,
    builder: (_) => _TeamCreateTaskSheet(employee: employee),
  );
}

class _TeamCreateTaskSheet extends StatefulWidget {
  final ProfileOption employee;

  const _TeamCreateTaskSheet({required this.employee});

  @override
  State<_TeamCreateTaskSheet> createState() => _TeamCreateTaskSheetState();
}

class _TeamCreateTaskSheetState extends State<_TeamCreateTaskSheet> {
  final _service = TeamTasksService();
  final _title = TextEditingController();
  final _description = TextEditingController();
  PersonalTaskPriority _priority = PersonalTaskPriority.medium;
  DateTime? _dueDate;
  bool _saving = false;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_title.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      await _service.createTaskForEmployee(
        employeeId: widget.employee.id,
        employeeName: widget.employee.name,
        input: CreateTaskInput(
          title: _title.text,
          description: _description.text.isEmpty ? null : _description.text,
          priority: _priority,
          dueDate: _dueDate,
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
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
          Text(
            'Assign to ${widget.employee.name}',
            style: TasksDesign.titleLg(context),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _title,
            decoration: TasksDesign.fieldDecoration('Title'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _description,
            decoration: TasksDesign.fieldDecoration('Description'),
            maxLines: 3,
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<PersonalTaskPriority>(
            value: _priority,
            decoration: TasksDesign.fieldDecoration('Priority'),
            items: PersonalTaskPriority.values
                .map(
                  (p) => DropdownMenuItem(
                    value: p,
                    child: Text(PersonalTask.priorityLabel(p)),
                  ),
                )
                .toList(),
            onChanged: (v) {
              if (v != null) setState(() => _priority = v);
            },
          ),
          const SizedBox(height: 12),
          ListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(
              _dueDate == null
                  ? 'Due date (optional)'
                  : 'Due ${DateFormat.yMMMd().format(_dueDate!)}',
            ),
            trailing: const Icon(Icons.calendar_today_outlined),
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: DateTime.now(),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 730)),
              );
              if (picked != null) setState(() => _dueDate = picked);
            },
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: _saving ? null : _submit,
            child: _saving
                ? const SizedBox(
                    height: 22,
                    width: 22,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('Create & assign'),
          ),
        ],
      ),
    );
  }
}
