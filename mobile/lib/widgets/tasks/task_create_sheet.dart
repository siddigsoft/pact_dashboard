import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../models/create_task_input.dart';
import '../../models/personal_task.dart';
import '../../models/profile_option.dart';
import '../../services/personal_task_service.dart';
import 'tasks_design.dart';

Future<bool?> showTaskCreateSheet(BuildContext context) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: TasksDesign.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _TaskCreateSheet(),
  );
}

class _TaskCreateSheet extends StatefulWidget {
  const _TaskCreateSheet();

  @override
  State<_TaskCreateSheet> createState() => _TaskCreateSheetState();
}

class _TaskCreateSheetState extends State<_TaskCreateSheet> {
  final _service = PersonalTaskService();
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _notes = TextEditingController();
  final _hours = TextEditingController();
  final _tags = TextEditingController();
  final _assigneeSearch = TextEditingController();
  String _category = 'personal';
  String _recurrence = 'none';

  PersonalTaskPriority _priority = PersonalTaskPriority.medium;
  DateTime? _dueDate;
  ProfileOption? _assignee;
  List<ProfileOption> _searchResults = [];
  final List<ProfileOption> _coAssignees = [];
  final _coSearch = TextEditingController();
  List<ProfileOption> _coSearchResults = [];
  bool _saving = false;
  bool _assignToSelf = true;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _notes.dispose();
    _hours.dispose();
    _tags.dispose();
    _assigneeSearch.dispose();
    _coSearch.dispose();
    super.dispose();
  }

  Future<void> _searchCo(String q) async {
    if (q.trim().length < 2) {
      setState(() => _coSearchResults = []);
      return;
    }
    final results = await _service.searchProfiles(q);
    if (mounted) setState(() => _coSearchResults = results);
  }

  Future<void> _searchAssignees(String q) async {
    if (q.trim().length < 2) {
      setState(() => _searchResults = []);
      return;
    }
    final results = await _service.searchProfiles(q);
    if (mounted) setState(() => _searchResults = results);
  }

  Future<void> _submit() async {
    if (_title.text.trim().isEmpty) return;
    setState(() => _saving = true);
    try {
      final hours = double.tryParse(_hours.text.trim());
      await _service.createTaskFull(
        CreateTaskInput(
          title: _title.text,
          description: _description.text.isEmpty ? null : _description.text,
          notes: _notes.text.isEmpty ? null : _notes.text,
          priority: _priority,
          dueDate: _dueDate,
          assignedToId: _assignToSelf ? null : _assignee?.id,
          assignedToName: _assignToSelf ? null : _assignee?.name,
          coAssignees: _coAssignees,
          estimatedHours: hours,
          category: _category,
          tags: _tags.text
              .split(',')
              .map((s) => s.trim())
              .where((s) => s.isNotEmpty)
              .toList(),
          recurrence: _recurrence,
        ),
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
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
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: TasksDesign.line,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: Text('Create task', style: TasksDesign.titleLg(context)),
                ),
                IconButton(
                  icon: const Icon(Icons.close),
                  tooltip: 'Close',
                  onPressed: _saving ? null : () => Navigator.pop(context, false),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _title,
              decoration: TasksDesign.fieldDecoration('Title'),
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _description,
              decoration: TasksDesign.fieldDecoration(
                'Description',
                hint: 'What needs to be done?',
              ),
              maxLines: 4,
              minLines: 3,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              decoration: TasksDesign.fieldDecoration('Internal notes (optional)'),
              maxLines: 2,
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
            DropdownButtonFormField<String>(
              value: _category,
              decoration: TasksDesign.fieldDecoration('Category'),
              items: const [
                DropdownMenuItem(value: 'personal', child: Text('Personal')),
                DropdownMenuItem(value: 'project', child: Text('Project')),
                DropdownMenuItem(value: 'recurring', child: Text('Recurring')),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _category = v);
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _tags,
              decoration: TasksDesign.fieldDecoration(
                'Tags',
                hint: 'Comma-separated',
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _recurrence,
              decoration: TasksDesign.fieldDecoration('Recurrence'),
              items: const [
                DropdownMenuItem(value: 'none', child: Text('None')),
                DropdownMenuItem(value: 'daily', child: Text('Daily')),
                DropdownMenuItem(value: 'weekly', child: Text('Weekly')),
                DropdownMenuItem(value: 'monthly', child: Text('Monthly')),
              ],
              onChanged: (v) {
                if (v != null) setState(() => _recurrence = v);
              },
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _hours,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: TasksDesign.fieldDecoration('Estimated hours'),
            ),
            const SizedBox(height: 12),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(
                _dueDate == null
                    ? 'Due date (optional)'
                    : 'Due ${DateFormat.yMMMd().format(_dueDate!)}',
                style: TasksDesign.body(context),
              ),
              trailing: const Icon(Icons.calendar_today_outlined),
              onTap: () async {
                final picked = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime.now().subtract(const Duration(days: 30)),
                  lastDate: DateTime.now().add(const Duration(days: 730)),
                );
                if (picked != null) setState(() => _dueDate = picked);
              },
            ),
            const Divider(height: 24),
            Text('Assign to', style: TasksDesign.titleMd(context)),
            const SizedBox(height: 8),
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: true, label: Text('Myself')),
                ButtonSegment(value: false, label: Text('Someone else')),
              ],
              selected: {_assignToSelf},
              onSelectionChanged: (s) {
                setState(() {
                  _assignToSelf = s.first;
                  if (_assignToSelf) _assignee = null;
                });
              },
            ),
            if (!_assignToSelf) ...[
              const SizedBox(height: 12),
              TextField(
                controller: _assigneeSearch,
                decoration: TasksDesign.fieldDecoration('Search by name or email'),
                onChanged: _searchAssignees,
              ),
              if (_assignee != null)
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: TasksDesign.accentSoft,
                    child: Text(
                      _assignee!.initials,
                      style: const TextStyle(
                        color: TasksDesign.accent,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  title: Text(_assignee!.name),
                  subtitle: _assignee!.email != null
                      ? Text(_assignee!.email!)
                      : null,
                  trailing: IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => setState(() => _assignee = null),
                  ),
                ),
              ..._searchResults.take(6).map(
                (p) => ListTile(
                  dense: true,
                  title: Text(p.name),
                  subtitle: p.email != null ? Text(p.email!) : null,
                  onTap: () => setState(() {
                    _assignee = p;
                    _searchResults = [];
                    _assigneeSearch.clear();
                  }),
                ),
              ),
            ],
            const SizedBox(height: 16),
            Text('Co-assignees (optional)', style: TasksDesign.titleMd(context)),
            const SizedBox(height: 8),
            TextField(
              controller: _coSearch,
              decoration: TasksDesign.fieldDecoration('Add collaborator'),
              onChanged: _searchCo,
            ),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: _coAssignees
                  .map(
                    (p) => Chip(
                      label: Text(p.name),
                      onDeleted: () => setState(() => _coAssignees.remove(p)),
                    ),
                  )
                  .toList(),
            ),
            ..._coSearchResults.take(4).map(
              (p) => ListTile(
                dense: true,
                title: Text(p.name),
                onTap: () => setState(() {
                  if (!_coAssignees.any((c) => c.id == p.id)) {
                    _coAssignees.add(p);
                  }
                  _coSearchResults = [];
                  _coSearch.clear();
                }),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: _saving ? null : () => Navigator.pop(context, false),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      side: const BorderSide(color: TasksDesign.line),
                    ),
                    child: const Text('Cancel'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton(
                    onPressed: _saving || (!_assignToSelf && _assignee == null)
                        ? null
                        : _submit,
                    style: FilledButton.styleFrom(
                      backgroundColor: TasksDesign.accent,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: _saving
                        ? const SizedBox(
                            height: 22,
                            width: 22,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Text('Create task'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
