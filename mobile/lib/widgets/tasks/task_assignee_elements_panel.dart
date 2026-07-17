import 'package:flutter/material.dart';

import '../../models/task_assignee_element.dart';
import '../../services/task_assignee_elements_service.dart';
import 'tasks_design.dart';

class TaskAssigneeElementsPanel extends StatefulWidget {
  final String taskId;

  const TaskAssigneeElementsPanel({super.key, required this.taskId});

  @override
  State<TaskAssigneeElementsPanel> createState() =>
      _TaskAssigneeElementsPanelState();
}

class _TaskAssigneeElementsPanelState extends State<TaskAssigneeElementsPanel> {
  final _service = TaskAssigneeElementsService();
  List<TaskAssigneeElement> _items = [];
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
      if (mounted) {
        setState(() {
          _items = items;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle(TaskAssigneeElement el) async {
    await _service.toggleDone(el.id, !el.done);
    await _load();
  }

  Future<void> _setProgress(TaskAssigneeElement el) async {
    final controller = TextEditingController(
      text: (el.currentValue ?? 0).toString(),
    );
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(el.label),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: InputDecoration(
            labelText: 'Progress${el.unit != null ? ' (${el.unit})' : ''}',
            hintText: 'Target: ${el.targetValue}',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (saved != true) {
      controller.dispose();
      return;
    }
    final value = double.tryParse(controller.text.trim()) ?? 0;
    controller.dispose();
    final err = await _service.updateProgress(el.id, value);
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
      return Text('No checklist items', style: TasksDesign.caption(context));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: _items.map((el) {
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          decoration: TasksDesign.card(),
          child: ListTile(
            leading: el.isQuantitative
                ? SizedBox(
                    width: 36,
                    height: 36,
                    child: CircularProgressIndicator(
                      value: el.progress,
                      strokeWidth: 3,
                      color: TasksDesign.accent,
                    ),
                  )
                : Checkbox(
                    value: el.done,
                    onChanged: (_) => _toggle(el),
                    activeColor: TasksDesign.accent,
                  ),
            title: Text(el.label, style: TasksDesign.body(context)),
            subtitle: el.isQuantitative
                ? Text(
                    '${el.currentValue ?? 0} / ${el.targetValue} ${el.unit ?? ''}'
                        .trim(),
                    style: TasksDesign.caption(context),
                  )
                : null,
            trailing: el.isQuantitative
                ? IconButton(
                    icon: const Icon(Icons.edit_outlined, size: 20),
                    onPressed: () => _setProgress(el),
                  )
                : null,
            onTap: el.isQuantitative ? () => _setProgress(el) : () => _toggle(el),
          ),
        );
      }).toList(),
    );
  }
}
