import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/personal_task.dart';
import '../models/profile_option.dart';
import '../services/team_tasks_service.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/tasks/task_list_card.dart';
import '../widgets/tasks/team_create_task_sheet.dart';
import '../widgets/tasks/tasks_design.dart';
import 'personal_task_detail_screen.dart';

class TeamTasksScreen extends StatefulWidget {
  const TeamTasksScreen({super.key});

  @override
  State<TeamTasksScreen> createState() => _TeamTasksScreenState();
}

class _TeamTasksScreenState extends State<TeamTasksScreen> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();
  final _service = TeamTasksService();
  TeamTasksSnapshot? _snapshot;
  bool _loading = true;
  String? _error;
  String _query = '';

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
      final snap = await _service.fetchSnapshot();
      if (mounted) {
        setState(() {
          _snapshot = snap;
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

  List<TeamMemberWorkload> get _filtered {
    final members = _snapshot?.members ?? [];
    if (_query.trim().isEmpty) return members;
    final q = _query.toLowerCase();
    return members
        .where(
          (m) =>
              m.profile.name.toLowerCase().contains(q) ||
              (m.profile.email?.toLowerCase().contains(q) ?? false) ||
              m.department.toLowerCase().contains(q),
        )
        .toList();
  }

  Future<void> _pickEmployeeAndCreate() async {
    final members = _filtered;
    if (members.isEmpty) return;
    final picked = await showModalBottomSheet<ProfileOption>(
      context: context,
      builder: (ctx) => ListView(
        children: members
            .map(
              (m) => ListTile(
                title: Text(m.profile.name),
                subtitle: Text(m.department),
                onTap: () => Navigator.pop(ctx, m.profile),
              ),
            )
            .toList(),
      ),
    );
    if (picked == null || !mounted) return;
    final created = await showTeamCreateTaskSheet(context, employee: picked);
    if (created == true) _load();
  }

  Future<void> _openTask(PersonalTask task) async {
    await Navigator.push<bool>(
      context,
      MaterialPageRoute(
        builder: (_) => PersonalTaskDetailScreen(taskId: task.id),
      ),
    );
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final totalOverdue =
        _snapshot?.members.fold<int>(0, (s, m) => s + m.overdue) ?? 0;
    final totalActive =
        _snapshot?.members.fold<int>(0, (s, m) => s + m.inProgress) ?? 0;

    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: TasksDesign.canvas,
      drawer: CustomDrawerMenu(
        currentUser: null,
        onClose: () => Navigator.pop(context),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _pickEmployeeAndCreate,
        backgroundColor: TasksDesign.accent,
        icon: const Icon(Icons.add),
        label: const Text('Assign task'),
      ),
      body: Column(
        children: [
          ReusableAppBar(
            title: 'Team Monitor',
            scaffoldKey: _scaffoldKey,
            showNotifications: true,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Row(
              children: [
                _MetricChip(label: 'Overdue', value: '$totalOverdue'),
                const SizedBox(width: 8),
                _MetricChip(label: 'In progress', value: '$totalActive'),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              decoration: TasksDesign.fieldDecoration('Search team member'),
              onChanged: (v) => setState(() => _query = v),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                ? Center(child: Text(_error!))
                : RefreshIndicator(
                    onRefresh: _load,
                    child: _filtered.isEmpty
                        ? ListView(
                            children: [
                              Padding(
                                padding: const EdgeInsets.all(32),
                                child: Text(
                                  'No team workload data',
                                  textAlign: TextAlign.center,
                                  style: TasksDesign.caption(context),
                                ),
                              ),
                            ],
                          )
                        : ListView.builder(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 88),
                            itemCount: _filtered.length,
                            itemBuilder: (_, i) {
                              return _MemberCard(
                                member: _filtered[i],
                                service: _service,
                                onOpenTask: _openTask,
                                onChanged: _load,
                              );
                            },
                          ),
                  ),
          ),
        ],
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  final String label;
  final String value;

  const _MetricChip({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: TasksDesign.card(),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(value, style: TasksDesign.titleLg(context)),
            Text(label, style: TasksDesign.caption(context)),
          ],
        ),
      ),
    );
  }
}

class _MemberCard extends StatefulWidget {
  final TeamMemberWorkload member;
  final TeamTasksService service;
  final void Function(PersonalTask task) onOpenTask;
  final VoidCallback onChanged;

  const _MemberCard({
    required this.member,
    required this.service,
    required this.onOpenTask,
    required this.onChanged,
  });

  @override
  State<_MemberCard> createState() => _MemberCardState();
}

class _MemberCardState extends State<_MemberCard> {
  bool _expanded = false;

  Color _efficiencyColor(String e) {
    switch (e) {
      case 'high':
        return const Color(0xFF059669);
      case 'medium':
        return const Color(0xFFD97706);
      default:
        return const Color(0xFFB91C1C);
    }
  }

  Future<void> _nudge() async {
    final m = widget.member;
    if (m.overdue == 0) return;
    final msg =
        'Hi ${m.profile.name.split(' ').first}, you have ${m.overdue} overdue task(s). Please update them in PACT.';
    await widget.service.sendWhatsAppNudge(
      employeeId: m.profile.id,
      message: msg,
    );
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nudge sent (if WhatsApp is configured)')),
      );
    }
  }

  Future<void> _contactEmail() async {
    final email = widget.member.profile.email;
    if (email == null || email.isEmpty) return;
    final uri = Uri.parse('mailto:$email');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _contactPhone() async {
    final phone = widget.member.phoneNumber;
    if (phone == null || phone.isEmpty) return;
    final uri = Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _changeStatus(PersonalTask task) async {
    final status = await showModalBottomSheet<PersonalTaskStatus>(
      context: context,
      builder: (ctx) => Column(
        mainAxisSize: MainAxisSize.min,
        children: PersonalTaskStatus.values
            .map(
              (s) => ListTile(
                title: Text(PersonalTask.statusLabel(s)),
                onTap: () => Navigator.pop(ctx, s),
              ),
            )
            .toList(),
      ),
    );
    if (status == null) return;
    try {
      await widget.service.updateTaskStatusForEmployee(
        taskId: task.id,
        status: status,
        employeeId: widget.member.profile.id,
      );
      widget.onChanged();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.member;
    final maxCount = m.weekDueCounts.isEmpty
        ? 1
        : m.weekDueCounts.reduce((a, b) => a > b ? a : b).clamp(1, 99);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: TasksDesign.card(),
      child: Column(
        children: [
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        backgroundColor: TasksDesign.accentSoft,
                        child: Text(
                          m.profile.initials,
                          style: const TextStyle(
                            color: TasksDesign.accent,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              m.profile.name,
                              style: TasksDesign.titleMd(context),
                            ),
                            Text(
                              '${m.department} · ${m.completionRate}% · ${m.efficiency}',
                              style: TasksDesign.caption(context).copyWith(
                                color: _efficiencyColor(m.efficiency),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (m.overdue > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEE2E2),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '${m.overdue} late',
                            style: TasksDesign.caption(context).copyWith(
                              color: const Color(0xFFB91C1C),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      Icon(_expanded ? Icons.expand_less : Icons.expand_more),
                    ],
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    height: 36,
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: List.generate(m.weekDueCounts.length, (i) {
                        final c = m.weekDueCounts[i];
                        final h = (c / maxCount) * 28;
                        return Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: Container(
                              height: h,
                              decoration: BoxDecoration(
                                color: TasksDesign.accent.withValues(
                                  alpha: 0.35 + (c > 0 ? 0.35 : 0),
                                ),
                                borderRadius: BorderRadius.circular(3),
                              ),
                            ),
                          ),
                        );
                      }),
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (_expanded) ...[
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: [
                  TextButton.icon(
                    onPressed: () async {
                      final ok = await showTeamCreateTaskSheet(
                        context,
                        employee: m.profile,
                      );
                      if (ok == true) widget.onChanged();
                    },
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('Assign'),
                  ),
                  if (m.overdue > 0)
                    TextButton.icon(
                      onPressed: _nudge,
                      icon: const Icon(Icons.chat_outlined, size: 18),
                      label: const Text('Nudge'),
                    ),
                  if (m.profile.email != null)
                    IconButton(
                      icon: const Icon(Icons.email_outlined),
                      onPressed: _contactEmail,
                    ),
                  if (m.phoneNumber != null && m.phoneNumber!.isNotEmpty)
                    IconButton(
                      icon: const Icon(Icons.phone_outlined),
                      onPressed: _contactPhone,
                    ),
                ],
              ),
            ),
            ...m.personalTasks.take(6).map(
              (t) => Column(
                children: [
                  TaskListCard(
                    task: t,
                    onTap: () => widget.onOpenTask(t),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => _changeStatus(t),
                      child: const Text('Change status'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
