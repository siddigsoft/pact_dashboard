import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/personal_task.dart';
import '../services/personal_task_notification_service.dart';
import '../services/personal_task_service.dart';
import '../widgets/app_widgets.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/reusable_app_bar.dart';
import '../utils/task_quadrant.dart';
import '../widgets/tasks/task_create_sheet.dart';
import '../widgets/tasks/task_inbox_view.dart';
import '../widgets/tasks/task_kanban_board.dart';
import '../widgets/tasks/task_list_card.dart';
import '../widgets/tasks/task_planning_view.dart';
import '../widgets/tasks/task_planner_view.dart';
import '../widgets/tasks/task_timeline_view.dart';
import '../widgets/tasks/tasks_design.dart';
import 'personal_task_detail_screen.dart';

enum _TaskStatFilter { all, todo, inProgress, overdue, done }

enum _TaskCategoryFilter { all, personal, project, recurring }

class MyTasksScreen extends StatefulWidget {
  final String? initialTaskId;

  const MyTasksScreen({super.key, this.initialTaskId});

  @override
  State<MyTasksScreen> createState() => _MyTasksScreenState();
}

class _MyTasksScreenState extends State<MyTasksScreen> {
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();
  final PersonalTaskService _service = PersonalTaskService();

  List<PersonalTask> _tasks = [];
  List<PersonalTask> _delegatedTasks = [];
  bool _loading = true;
  bool _fromCache = false;
  bool _isOffline = false;
  String? _error;
  TaskViewMode _viewMode = TaskViewMode.list;
  String _search = '';
  _TaskStatFilter _statFilter = _TaskStatFilter.all;
  _TaskCategoryFilter _categoryFilter = _TaskCategoryFilter.all;
  String? _pendingOpenId;

  @override
  void initState() {
    super.initState();
    final taskId = widget.initialTaskId;
    if (taskId != null && taskId.isNotEmpty) _pendingOpenId = taskId;
    _loadTasks();
  }

  void _tryOpenPending() {
    final id = _pendingOpenId;
    if (id == null) return;
    _pendingOpenId = null;
    final match = _tasks.where((t) => t.id == id).firstOrNull;
    if (match != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _openTaskDetail(match);
      });
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        if (!mounted) return;
        final t = await _service.fetchTaskById(id);
        if (t != null && mounted) _openTaskDetail(t);
      });
    }
  }

  String? get _userId => Supabase.instance.client.auth.currentUser?.id;


  Future<void> _openTaskDetail(PersonalTask task) async {
    if (task.isProjectAdapter) {
      await showModalBottomSheet<void>(
        context: context,
        builder: (ctx) => _ProjectTaskSheet(
          task: task,
          onStatusChanged: (s) async {
            await _service.updateStatus(
              task.id,
              s,
              isProjectTask: true,
            );
            if (ctx.mounted) Navigator.pop(ctx);
            _loadTasks();
          },
        ),
      );
      return;
    }
    final updated = await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => PersonalTaskDetailScreen(
          taskId: task.id,
          myTasks: _tasks.where((t) => !t.isProjectAdapter).toList(),
        ),
      ),
    );
    if (updated == true && mounted) _loadTasks();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _loadTasks() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await _service.materialiseDailyTasks();
      final result = await _service.fetchMyTasks();
      List<PersonalTask> delegated = [];
      if (!result.isOffline && _userId != null) {
        try {
          delegated = await _service.fetchDelegatedByMe();
        } catch (_) {}
      }
      await PersonalTaskNotificationService.instance.refreshBadge();
      if (mounted) {
        setState(() {
          _tasks = result.allForDisplay;
          _delegatedTasks = delegated;
          _fromCache = result.fromCache;
          _isOffline = result.isOffline;
          _loading = false;
        });
        _tryOpenPending();
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

  List<PersonalTask> _filtered() {
    // ponytail: status chip is now the only "which tasks" control (the old
    // Active/Done/All tab duplicated this and could contradict it).
    Iterable<PersonalTask> list = _statFilter == _TaskStatFilter.done
        ? _tasks.where(
            (t) =>
                t.status == PersonalTaskStatus.done ||
                t.status == PersonalTaskStatus.cancelled,
          )
        : _tasks.where((t) => t.isActive);

    list = switch (_statFilter) {
      _TaskStatFilter.todo =>
        list.where((t) => t.status == PersonalTaskStatus.todo),
      _TaskStatFilter.inProgress => list.where(
        (t) => t.status == PersonalTaskStatus.inprogress,
      ),
      _TaskStatFilter.overdue => list.where((t) => t.isOverdue),
      _ => list,
    };

    list = switch (_categoryFilter) {
      _TaskCategoryFilter.personal => list.where(
        (t) => !t.isProjectAdapter && (t.category == 'personal' || t.category == null),
      ),
      _TaskCategoryFilter.project =>
        list.where((t) => t.isProjectAdapter || t.category == 'project'),
      _TaskCategoryFilter.recurring =>
        list.where((t) => t.isRecurring || t.category == 'recurring'),
      _ => list,
    };

    if (_search.trim().isNotEmpty) {
      final q = _search.toLowerCase();
      list = list.where(
        (t) =>
            t.title.toLowerCase().contains(q) ||
            (t.description?.toLowerCase().contains(q) ?? false),
      );
    }
    return list.toList();
  }

  String get _emptyMessage {
    if (_statFilter == _TaskStatFilter.done) return 'No completed tasks yet';
    if (_statFilter != _TaskStatFilter.all ||
        _categoryFilter != _TaskCategoryFilter.all ||
        _search.trim().isNotEmpty) {
      return 'No tasks found';
    }
    return 'No active tasks — you\'re all caught up!';
  }

  (IconData, String) _viewModeMeta(TaskViewMode m) => switch (m) {
    TaskViewMode.list => (Icons.view_list, 'List'),
    TaskViewMode.board => (Icons.view_kanban_outlined, 'Board'),
    TaskViewMode.timeline => (Icons.timeline_outlined, 'Timeline'),
    TaskViewMode.planning => (Icons.grid_view, 'Planning'),
    TaskViewMode.planner => (Icons.today_outlined, 'Planner'),
    TaskViewMode.inbox => (Icons.inbox_outlined, 'Inbox'),
    TaskViewMode.delegated => (Icons.outbound_outlined, 'Delegated'),
  };

  String _categoryLabel(_TaskCategoryFilter f) => switch (f) {
    _TaskCategoryFilter.all => 'All types',
    _TaskCategoryFilter.personal => 'Personal',
    _TaskCategoryFilter.project => 'Project',
    _TaskCategoryFilter.recurring => 'Recurring',
  };

  Future<void> _onKanbanStatusChange(
    PersonalTask task,
    PersonalTaskStatus status,
  ) async {
    if (task.status == status) return;
    try {
      await _service.updateStatus(
        task.id,
        status,
        isProjectTask: task.isProjectAdapter,
      );
      await _loadTasks();
    } catch (e) {
      if (mounted) {
        AppSnackBar.show(
          context,
          message: e.toString().replaceFirst('Exception: ', ''),
          type: SnackBarType.error,
        );
      }
    }
  }

  int get _overdueCount => _tasks.where((t) => t.isOverdue).length;

  bool _needsAck(PersonalTask task) {
    final uid = _userId;
    if (uid == null) return false;
    return task.needsAcknowledgement(uid);
  }

  Future<void> _openCreate() async {
    final created = await showTaskCreateSheet(context);
    if (created == true && mounted) {
      await _loadTasks();
      AppSnackBar.show(
        context,
        message: 'Task created',
        type: SnackBarType.success,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: TasksDesign.canvas,
      drawer: CustomDrawerMenu(
        currentUser: null,
        onClose: () => Navigator.pop(context),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _isOffline ? null : _openCreate,
        backgroundColor: TasksDesign.accent,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: Text('New task', style: TasksDesign.titleMd(context).copyWith(color: Colors.white)),
      ),
      body: Column(
        children: [
          ReusableAppBar(
            title: 'My Tasks',
            scaffoldKey: _scaffoldKey,
            showNotifications: true,
          ),
          if (_isOffline || _fromCache) _OfflineBanner(isOffline: _isOffline),
          if (_overdueCount > 0) _OverdueBanner(count: _overdueCount),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
            child: TextField(
              decoration: TasksDesign.fieldDecoration('Search tasks'),
              onChanged: (v) => setState(() => _search = v),
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: _TaskStatFilter.values.map((f) {
                final selected = _statFilter == f;
                final label = switch (f) {
                  _TaskStatFilter.all => 'All',
                  _TaskStatFilter.todo => 'To do',
                  _TaskStatFilter.inProgress => 'Active',
                  _TaskStatFilter.overdue => 'Overdue',
                  _TaskStatFilter.done => 'Done',
                };
                return Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: FilterChip(
                    label: Text(label),
                    selected: selected,
                    onSelected: (_) => setState(() => _statFilter = f),
                    selectedColor: TasksDesign.accentSoft,
                    checkmarkColor: TasksDesign.accent,
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 8),
          // ponytail: 7 view modes + 4 categories used to be 4 rows of
          // always-visible buttons (and overflowed on narrow phones). Two
          // dropdown pills reach the same options in a fifth of the height.
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                _DropdownPill<TaskViewMode>(
                  icon: _viewModeMeta(_viewMode).$1,
                  label: _viewModeMeta(_viewMode).$2,
                  items: TaskViewMode.values.map((m) {
                    final meta = _viewModeMeta(m);
                    final active = m == _viewMode;
                    return PopupMenuItem<TaskViewMode>(
                      value: m,
                      child: Row(
                        children: [
                          Icon(
                            meta.$1,
                            size: 18,
                            color: active ? TasksDesign.accent : TasksDesign.muted,
                          ),
                          const SizedBox(width: 10),
                          Text(
                            meta.$2,
                            style: TasksDesign.body(context).copyWith(
                              color: active ? TasksDesign.accent : TasksDesign.ink,
                              fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(),
                  onSelected: (m) => setState(() => _viewMode = m),
                ),
                const SizedBox(width: 8),
                _DropdownPill<_TaskCategoryFilter>(
                  icon: Icons.category_outlined,
                  label: _categoryLabel(_categoryFilter),
                  items: _TaskCategoryFilter.values.map((f) {
                    final active = f == _categoryFilter;
                    return PopupMenuItem<_TaskCategoryFilter>(
                      value: f,
                      child: Text(
                        _categoryLabel(f),
                        style: TasksDesign.body(context).copyWith(
                          color: active ? TasksDesign.accent : TasksDesign.ink,
                          fontWeight: active ? FontWeight.w600 : FontWeight.w400,
                        ),
                      ),
                    );
                  }).toList(),
                  onSelected: (f) => setState(() => _categoryFilter = f),
                ),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? _ErrorState(message: _error!, onRetry: _loadTasks)
                : _buildContent(),
          ),
        ],
      ),
    );
  }

  Future<void> _onPlanningQuadrant(PersonalTask task, TaskQuadrant q) async {
    if (_isOffline) return;
    try {
      await _service.updatePlanningQuadrant(
        task.id,
        TaskQuadrantHelper.dbKey(q),
      );
      await _loadTasks();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  Widget _buildContent() {
    if (_viewMode == TaskViewMode.planning) {
      final active = _filtered();
      if (active.isEmpty) return _EmptyState(message: _emptyMessage);
      return RefreshIndicator(
        onRefresh: _loadTasks,
        child: TaskPlanningView(
          tasks: active,
          onTaskTap: _openTaskDetail,
          onQuadrantSet: _isOffline ? null : _onPlanningQuadrant,
        ),
      );
    }
    if (_viewMode == TaskViewMode.planner) {
      final active = _filtered();
      if (active.isEmpty) return _EmptyState(message: _emptyMessage);
      return RefreshIndicator(
        onRefresh: _loadTasks,
        child: TaskPlannerView(
          tasks: active,
          onTaskTap: _openTaskDetail,
          showAck: _needsAck,
        ),
      );
    }
    if (_viewMode == TaskViewMode.inbox) {
      final active = _filtered();
      if (active.isEmpty) return _EmptyState(message: _emptyMessage);
      return RefreshIndicator(
        onRefresh: _loadTasks,
        child: TaskInboxView(
          tasks: active,
          onTaskTap: _openTaskDetail,
          showAck: _needsAck,
        ),
      );
    }
    if (_viewMode == TaskViewMode.delegated) {
      if (_delegatedTasks.isEmpty) {
        return _EmptyState(message: 'No tasks delegated to others');
      }
      return RefreshIndicator(
        onRefresh: _loadTasks,
        child: ListView.builder(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
          itemCount: _delegatedTasks.length,
          itemBuilder: (context, index) {
            final task = _delegatedTasks[index];
            return TaskListCard(
              task: task,
              showAckBadge: false,
              onTap: () => _openTaskDetail(task),
            );
          },
        ),
      );
    }
    if (_viewMode == TaskViewMode.board) {
      final active = _filtered();
      if (active.isEmpty) return _EmptyState(message: _emptyMessage);
      return RefreshIndicator(
        onRefresh: _loadTasks,
        child: TaskKanbanBoard(
          tasks: active,
          showAck: _needsAck,
          onTaskTap: _openTaskDetail,
          onStatusChange: _isOffline ? null : _onKanbanStatusChange,
        ),
      );
    }
    if (_viewMode == TaskViewMode.timeline) {
      final withDue = _tasks.where((t) => t.dueDate != null).toList();
      if (withDue.isEmpty) {
        return _EmptyState(message: 'No tasks with due dates');
      }
      return RefreshIndicator(
        onRefresh: _loadTasks,
        child: TaskTimelineView(
          tasks: withDue,
          onTaskTap: _openTaskDetail,
        ),
      );
    }

    final list = _filtered();
    if (list.isEmpty) return _EmptyState(message: _emptyMessage);
    return RefreshIndicator(
      onRefresh: _loadTasks,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 88),
        itemCount: list.length,
        itemBuilder: (context, index) {
          final task = list[index];
          return TaskListCard(
            task: task,
            showAckBadge: _needsAck(task),
            onTap: () => _openTaskDetail(task),
          );
        },
      ),
    );
  }
}

/// Compact "tap to pick from a list" pill — replaces a row of buttons with
/// one native popup menu so the option count no longer drives row height.
class _DropdownPill<T> extends StatelessWidget {
  final IconData icon;
  final String label;
  final List<PopupMenuEntry<T>> items;
  final ValueChanged<T> onSelected;

  const _DropdownPill({
    required this.icon,
    required this.label,
    required this.items,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<T>(
      onSelected: onSelected,
      itemBuilder: (_) => items,
      offset: const Offset(0, 38),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: TasksDesign.surface,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: TasksDesign.line),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16, color: TasksDesign.accent),
            const SizedBox(width: 6),
            Text(
              label,
              style: TasksDesign.caption(context).copyWith(
                color: TasksDesign.ink,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(width: 2),
            Icon(Icons.expand_more, size: 16, color: TasksDesign.muted),
          ],
        ),
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  final bool isOffline;

  const _OfflineBanner({required this.isOffline});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined, color: Color(0xFFB45309), size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              isOffline
                  ? 'Offline — cached tasks. Changes sync when online.'
                  : 'Showing cached data — pull to refresh.',
              style: TasksDesign.caption(context).copyWith(color: TasksDesign.ink),
            ),
          ),
        ],
      ),
    );
  }
}

class _OverdueBanner extends StatelessWidget {
  final int count;

  const _OverdueBanner({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFECACA)),
      ),
      child: Row(
        children: [
          const Icon(Icons.warning_amber_rounded, color: Color(0xFFB91C1C), size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '$count overdue task${count == 1 ? '' : 's'}',
              style: TasksDesign.caption(context).copyWith(
                color: const Color(0xFFB91C1C),
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  final String message;

  const _EmptyState({required this.message});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.task_alt_outlined,
              size: 64,
              color: TasksDesign.muted.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 16),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TasksDesign.body(context).copyWith(color: TasksDesign.muted),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProjectTaskSheet extends StatelessWidget {
  final PersonalTask task;
  final void Function(PersonalTaskStatus status) onStatusChanged;

  const _ProjectTaskSheet({
    required this.task,
    required this.onStatusChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(task.title, style: TasksDesign.titleMd(context)),
          const SizedBox(height: 8),
          Text('Project field task', style: TasksDesign.caption(context)),
          const SizedBox(height: 16),
          ...PersonalTaskStatus.values.where((s) =>
              s != PersonalTaskStatus.rescheduled).map(
            (s) => ListTile(
              title: Text(PersonalTask.statusLabel(s)),
              onTap: () => onStatusChanged(s),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;

  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, color: Color(0xFFB91C1C), size: 48),
            const SizedBox(height: 12),
            Text('Could not load tasks', style: TasksDesign.titleMd(context)),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: TasksDesign.caption(context),
            ),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }
}
