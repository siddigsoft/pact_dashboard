import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class TasksScreen extends ConsumerStatefulWidget {
  const TasksScreen({super.key});
  @override
  ConsumerState<TasksScreen> createState() => _TasksScreenState();
}

class _TasksScreenState extends ConsumerState<TasksScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _tasks = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _tabs = TabController(length: 3, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final data = await Supabase.instance.client
          .from('tasks')
          .select('id, title, description, status, priority, due_date, completed_at, assigned_to, created_at')
          .eq('assigned_to', user.id)
          .order('due_date', ascending: true)
          .limit(200);
      setState(() { _tasks = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _complete(String taskId) async {
    try {
      await Supabase.instance.client.from('tasks').update({
        'status': 'completed',
        'completed_at': DateTime.now().toIso8601String(),
      }).eq('id', taskId);
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.error));
    }
  }

  List<Map<String, dynamic>> get _pending => _tasks.where((t) => t['status'] != 'completed').toList();
  List<Map<String, dynamic>> get _completed => _tasks.where((t) => t['status'] == 'completed').toList();
  List<Map<String, dynamic>> get _overdue {
    final now = DateTime.now();
    return _pending.where((t) {
      final due = t['due_date'] as String?;
      if (due == null) return false;
      final d = DateTime.tryParse(due);
      return d != null && d.isBefore(now);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Tasks'),
        bottom: TabBar(
          controller: _tabs,
          labelColor: Colors.white,
          indicatorColor: Colors.white,
          tabs: [
            Tab(text: 'Pending (${_pending.length})'),
            Tab(text: 'Overdue (${_overdue.length})'),
            Tab(text: 'Done (${_completed.length})'),
          ],
        ),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _TaskList(tasks: _pending, onComplete: _complete),
                      _TaskList(tasks: _overdue, onComplete: _complete, isOverdue: true),
                      _TaskList(tasks: _completed, onComplete: null),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _TaskList extends StatelessWidget {
  final List<Map<String, dynamic>> tasks;
  final Future<void> Function(String)? onComplete;
  final bool isOverdue;
  const _TaskList({required this.tasks, this.onComplete, this.isOverdue = false});

  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(onComplete == null ? Icons.check_circle_outline : Icons.task_outlined, size: 48, color: AppColors.textDisabled),
      const SizedBox(height: 12),
      Text(onComplete == null ? 'No completed tasks yet' : 'No tasks', style: const TextStyle(color: AppColors.textSecondary)),
    ]));

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: tasks.length,
        itemBuilder: (_, i) {
          final t = tasks[i];
          final status = t['status'] as String? ?? 'pending';
          final priority = t['priority'] as String? ?? 'normal';
          final due = t['due_date'] as String?;
          final isDone = status == 'completed';

          return Card(
            margin: const EdgeInsets.only(bottom: 10),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  if (!isDone) GestureDetector(
                    onTap: () => onComplete?.call(t['id'] as String),
                    child: Container(
                      width: 22, height: 22,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: isOverdue ? AppColors.error : AppColors.primary, width: 2),
                      ),
                      child: isDone ? const Icon(Icons.check, size: 14, color: AppColors.success) : null,
                    ),
                  ) else const Icon(Icons.check_circle, color: AppColors.success, size: 22),
                  const SizedBox(width: 12),
                  Expanded(child: Text(
                    t['title'] as String? ?? 'Task',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                      decoration: isDone ? TextDecoration.lineThrough : null,
                      color: isDone ? AppColors.textDisabled : null,
                    ),
                  )),
                  _priorityBadge(priority),
                ]),
                if (t['description'] != null && (t['description'] as String).isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Padding(
                    padding: const EdgeInsets.only(left: 34),
                    child: Text(t['description'] as String, style: const TextStyle(color: AppColors.textSecondary, fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                  ),
                ],
                if (due != null) Padding(
                  padding: const EdgeInsets.only(left: 34, top: 6),
                  child: Row(children: [
                    Icon(Icons.calendar_today_outlined, size: 13, color: isOverdue ? AppColors.error : AppColors.textSecondary),
                    const SizedBox(width: 4),
                    Text(_fmt(due), style: TextStyle(fontSize: 12, color: isOverdue ? AppColors.error : AppColors.textSecondary)),
                  ]),
                ),
                if (!isDone && onComplete != null) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => onComplete!(t['id'] as String),
                      icon: const Icon(Icons.check, size: 16),
                      label: const Text('Mark Complete'),
                    ),
                  ),
                ],
              ]),
            ),
          );
        },
      ),
    );
  }

  Widget _priorityBadge(String p) {
    final colors = {'high': AppColors.error, 'normal': AppColors.warning, 'low': AppColors.textSecondary};
    final c = colors[p.toLowerCase()] ?? AppColors.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: c.withOpacity(0.1), borderRadius: BorderRadius.circular(4)),
      child: Text(p[0].toUpperCase() + p.substring(1), style: TextStyle(color: c, fontSize: 10, fontWeight: FontWeight.w600)),
    );
  }

  String _fmt(String iso) {
    try { final d = DateTime.parse(iso); return '${d.day}/${d.month}/${d.year}'; } catch (_) { return iso; }
  }
}
