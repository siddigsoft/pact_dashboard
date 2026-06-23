import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});
  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _notifications = [];
  bool _loading = true;
  String _category = 'all';

  static const _categories = ['all', 'financial', 'field', 'system', 'task'];

  @override
  void initState() { super.initState(); _tabs = TabController(length: 2, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final data = await Supabase.instance.client
          .from('notifications')
          .select('id, title, message, type, category, is_read, created_at, link, priority')
          .eq('user_id', user.id)
          .order('created_at', ascending: false)
          .limit(100);
      setState(() { _notifications = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  Future<void> _markRead(String id) async {
    await Supabase.instance.client.from('notifications').update({'is_read': true}).eq('id', id);
    setState(() {
      final idx = _notifications.indexWhere((n) => n['id'] == id);
      if (idx >= 0) _notifications[idx] = {..._notifications[idx], 'is_read': true};
    });
  }

  Future<void> _markAllRead() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    await Supabase.instance.client.from('notifications').update({'is_read': true}).eq('user_id', user.id).eq('is_read', false);
    setState(() { _notifications = _notifications.map((n) => {...n, 'is_read': true}).toList(); });
  }

  List<Map<String, dynamic>> get _filtered {
    var items = _notifications;
    if (_category != 'all') items = items.where((n) => (n['category'] as String? ?? '') == _category).toList();
    return items;
  }

  List<Map<String, dynamic>> get _unread => _notifications.where((n) => n['is_read'] != true).toList();
  int get _unreadCount => _unread.length;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Notifications${_unreadCount > 0 ? ' ($_unreadCount)' : ''}'),
        actions: [
          if (_unreadCount > 0) TextButton(
            onPressed: _markAllRead,
            child: const Text('Mark All Read', style: TextStyle(color: Colors.white)),
          ),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
        bottom: TabBar(
          controller: _tabs,
          labelColor: Colors.white,
          indicatorColor: Colors.white,
          tabs: const [Tab(text: 'All Notifications'), Tab(text: 'Pending Actions')],
        ),
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          _buildCategoryFilter(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _NotificationList(notifications: _filtered, onMarkRead: _markRead),
                      _NotificationList(notifications: _unread, onMarkRead: _markRead, isPendingActions: true),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildCategoryFilter() => Container(
    height: 44,
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: ListView(
      scrollDirection: Axis.horizontal,
      children: _categories.map((c) => Padding(
        padding: const EdgeInsets.only(right: 8, top: 4, bottom: 4),
        child: ChoiceChip(
          label: Text(c[0].toUpperCase() + c.substring(1)),
          selected: _category == c,
          onSelected: (_) => setState(() => _category = c),
          selectedColor: AppColors.primary,
          labelStyle: TextStyle(color: _category == c ? Colors.white : null, fontSize: 12),
          padding: const EdgeInsets.symmetric(horizontal: 8),
        ),
      )).toList(),
    ),
  );
}

class _NotificationList extends StatelessWidget {
  final List<Map<String, dynamic>> notifications;
  final Future<void> Function(String) onMarkRead;
  final bool isPendingActions;
  const _NotificationList({required this.notifications, required this.onMarkRead, this.isPendingActions = false});

  @override
  Widget build(BuildContext context) {
    if (notifications.isEmpty) return Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      Icon(isPendingActions ? Icons.task_alt_outlined : Icons.notifications_none_outlined, size: 48, color: AppColors.textDisabled),
      const SizedBox(height: 12),
      Text(isPendingActions ? 'No pending actions' : 'No notifications', style: const TextStyle(color: AppColors.textSecondary)),
    ]));

    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: notifications.length,
        itemBuilder: (_, i) {
          final n = notifications[i];
          final isRead = n['is_read'] == true;
          final type = n['type'] as String? ?? 'info';
          final priority = n['priority'] as String? ?? 'normal';

          return InkWell(
            onTap: () { if (!isRead) onMarkRead(n['id'] as String); },
            child: Container(
              color: isRead ? null : AppColors.primary.withOpacity(0.04),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40, height: 40,
                    decoration: BoxDecoration(
                      color: _typeColor(type).withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(_typeIcon(type), color: _typeColor(type), size: 20),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text(n['title'] as String? ?? '', style: TextStyle(fontWeight: isRead ? FontWeight.w500 : FontWeight.w700, fontSize: 14))),
                      if (priority == 'high' || priority == 'critical')
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(color: AppColors.error, borderRadius: BorderRadius.circular(4)),
                          child: Text(priority[0].toUpperCase() + priority.substring(1), style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700)),
                        ),
                    ]),
                    const SizedBox(height: 3),
                    Text(n['message'] as String? ?? '', style: const TextStyle(color: AppColors.textSecondary, fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Text(_fmt(n['created_at'] as String? ?? ''), style: const TextStyle(color: AppColors.textDisabled, fontSize: 11)),
                  ])),
                  if (!isRead) Container(width: 8, height: 8, margin: const EdgeInsets.only(top: 4), decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Color _typeColor(String t) {
    switch (t) { case 'success': return AppColors.success; case 'warning': return AppColors.warning; case 'error': return AppColors.error; default: return AppColors.primary; }
  }

  IconData _typeIcon(String t) {
    switch (t) { case 'success': return Icons.check_circle_outline; case 'warning': return Icons.warning_outlined; case 'error': return Icons.error_outline; default: return Icons.notifications_outlined; }
  }

  String _fmt(String iso) {
    try {
      final d = DateTime.parse(iso);
      final diff = DateTime.now().difference(d);
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      return '${d.day}/${d.month}/${d.year}';
    } catch (_) { return iso; }
  }
}
