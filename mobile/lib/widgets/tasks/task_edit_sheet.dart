import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/personal_task.dart';
import '../../models/profile_option.dart';
import '../../services/personal_task_service.dart';
import 'tasks_design.dart';

class TaskEditResult {
  final String title;
  final PersonalTaskPriority priority;
  final DateTime? dueDate;
  final String? assignedToId;
  final String? assignedToName;

  const TaskEditResult({
    required this.title,
    required this.priority,
    this.dueDate,
    this.assignedToId,
    this.assignedToName,
  });
}

Future<TaskEditResult?> showTaskEditSheet(
  BuildContext context, {
  required PersonalTask task,
}) {
  return showModalBottomSheet<TaskEditResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: TasksDesign.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => _TaskEditSheet(task: task),
  );
}

class _TaskEditSheet extends StatefulWidget {
  final PersonalTask task;

  const _TaskEditSheet({required this.task});

  @override
  State<_TaskEditSheet> createState() => _TaskEditSheetState();
}

class _TaskEditSheetState extends State<_TaskEditSheet> {
  final _service = PersonalTaskService();
  late final TextEditingController _title;
  late PersonalTaskPriority _priority;
  DateTime? _dueDate;
  ProfileOption? _assignee;
  final _assigneeSearch = TextEditingController();
  List<ProfileOption> _searchResults = [];

  @override
  void initState() {
    super.initState();
    _title = TextEditingController(text: widget.task.title);
    _priority = widget.task.priority;
    _dueDate = widget.task.dueDate;
    if (widget.task.assignedTo != null) {
      _assignee = ProfileOption(
        id: widget.task.assignedTo!,
        name: widget.task.assignedToName ?? 'Assignee',
      );
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _assigneeSearch.dispose();
    super.dispose();
  }

  Future<void> _search(String q) async {
    if (q.trim().length < 2) {
      setState(() => _searchResults = []);
      return;
    }
    final results = await _service.searchProfiles(q);
    if (mounted) setState(() => _searchResults = results);
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottom + 20),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Edit task', style: TasksDesign.titleLg(context)),
            const SizedBox(height: 16),
            TextField(
              controller: _title,
              decoration: TasksDesign.fieldDecoration('Title'),
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
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (_dueDate != null)
                    IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () => setState(() => _dueDate = null),
                    ),
                  const Icon(Icons.calendar_today_outlined),
                ],
              ),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: _dueDate ?? DateTime.now(),
                  firstDate: DateTime.now().subtract(const Duration(days: 365)),
                  lastDate: DateTime.now().add(const Duration(days: 730)),
                );
                if (picked != null) setState(() => _dueDate = picked);
              },
            ),
            const SizedBox(height: 8),
            Text('Assignee', style: TasksDesign.titleMd(context)),
            const SizedBox(height: 8),
            TextField(
              controller: _assigneeSearch,
              decoration: TasksDesign.fieldDecoration('Search assignee'),
              onChanged: _search,
            ),
            if (_assignee != null)
              ListTile(
                title: Text(_assignee!.name),
                trailing: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => _assignee = null),
                ),
              ),
            ..._searchResults.take(5).map(
              (p) => ListTile(
                dense: true,
                title: Text(p.name),
                onTap: () => setState(() {
                  _assignee = p;
                  _searchResults = [];
                  _assigneeSearch.clear();
                }),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () {
                if (_title.text.trim().isEmpty) return;
                Navigator.pop(
                  context,
                  TaskEditResult(
                    title: _title.text.trim(),
                    priority: _priority,
                    dueDate: _dueDate,
                    assignedToId: _assignee?.id,
                    assignedToName: _assignee?.name,
                  ),
                );
              },
              style: FilledButton.styleFrom(backgroundColor: TasksDesign.accent),
              child: const Text('Save changes'),
            ),
          ],
        ),
      ),
    );
  }
}
