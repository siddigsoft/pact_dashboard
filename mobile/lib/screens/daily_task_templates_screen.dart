import 'package:flutter/material.dart';

import '../models/daily_task_definition.dart';
import '../services/personal_task_service.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/tasks/tasks_design.dart';

/// Read-only list of daily task templates (admin).
class DailyTaskTemplatesScreen extends StatefulWidget {
  const DailyTaskTemplatesScreen({super.key});

  @override
  State<DailyTaskTemplatesScreen> createState() =>
      _DailyTaskTemplatesScreenState();
}

class _DailyTaskTemplatesScreenState extends State<DailyTaskTemplatesScreen> {
  final _service = PersonalTaskService();
  List<DailyTaskDefinition> _items = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final items = await _service.fetchDailyTaskDefinitions();
      if (mounted) {
        setState(() {
          _items = items;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: TasksDesign.canvas,
      appBar: const ReusableAppBar(title: 'Daily task templates'),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(_error!, textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _load,
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            )
          : _items.isEmpty
          ? Center(
              child: Text(
                'No templates configured',
                style: TasksDesign.caption(context),
              ),
            )
          : RefreshIndicator(
              onRefresh: _load,
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: _items.length,
                itemBuilder: (_, i) {
                  final d = _items[i];
                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: TasksDesign.card(),
                    child: ListTile(
                      title: Text(d.title, style: TasksDesign.titleMd(context)),
                      subtitle: Text(
                        [
                          if (d.priority != null) d.priority!,
                          if (d.recurrence != null) d.recurrence!,
                          if (d.rewardAmount != null)
                            'Reward ${d.rewardAmount!.toStringAsFixed(2)}',
                        ].where((s) => s.isNotEmpty).join(' · '),
                        style: TasksDesign.caption(context),
                      ),
                      trailing: Icon(
                        d.isActive ? Icons.check_circle : Icons.pause_circle,
                        color: d.isActive
                            ? const Color(0xFF059669)
                            : TasksDesign.muted,
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
