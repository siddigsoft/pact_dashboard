import 'package:flutter/material.dart';

import '../models/approval_workflow_option.dart';
import '../services/task_approvals_service.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/reusable_app_bar.dart';
import '../widgets/tasks/tasks_design.dart';
import 'personal_task_detail_screen.dart';

/// Thin chrome wrapper — own Scaffold/drawer/app bar for direct navigation
/// from "More". The [PendingTaskApprovalsBody] below holds the actual logic
/// so it can also be embedded as a tab in ApprovalDashboardScreen.
class PendingTaskApprovalsScreen extends StatelessWidget {
  const PendingTaskApprovalsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scaffoldKey = GlobalKey<ScaffoldState>();
    return Scaffold(
      key: scaffoldKey,
      backgroundColor: TasksDesign.canvas,
      drawer: CustomDrawerMenu(
        currentUser: null,
        onClose: () => Navigator.pop(context),
      ),
      body: Column(
        children: [
          ReusableAppBar(
            title: 'Pending Approvals',
            scaffoldKey: scaffoldKey,
            showNotifications: true,
          ),
          const Expanded(child: PendingTaskApprovalsBody()),
        ],
      ),
    );
  }
}

/// Reusable body: loads pending task approvals and lets the reviewer
/// approve/reject. Used standalone (above) and as a tab inside
/// ApprovalDashboardScreen.
class PendingTaskApprovalsBody extends StatefulWidget {
  const PendingTaskApprovalsBody({super.key});

  @override
  State<PendingTaskApprovalsBody> createState() =>
      _PendingTaskApprovalsBodyState();
}

class _PendingTaskApprovalsBodyState extends State<PendingTaskApprovalsBody> {
  final _service = TaskApprovalsService();
  List<PendingTaskApprovalItem> _items = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final items = await _service.fetchPendingForMe();
      if (mounted) setState(() {
        _items = items;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _decide(PendingTaskApprovalItem item, bool approve) async {
    final err = approve
        ? await _service.approve(item.taskApprovalId)
        : await _service.reject(item.taskApprovalId, 'Rejected from mobile');
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
    return RefreshIndicator(
      onRefresh: _load,
      child: _items.isEmpty
          ? ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(
                    'No pending task approvals',
                    textAlign: TextAlign.center,
                    style: TasksDesign.caption(context),
                  ),
                ),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _items.length,
              itemBuilder: (_, i) {
                final item = _items[i];
                return Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: TasksDesign.card(),
                  child: ListTile(
                    title: Text(
                      item.workflowName ?? 'Approval',
                      style: TasksDesign.titleMd(context),
                    ),
                    subtitle: Text(
                      'Stage ${item.stageNumber}',
                      style: TasksDesign.caption(context),
                    ),
                    onTap: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) =>
                            PersonalTaskDetailScreen(taskId: item.taskId),
                      ),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => _decide(item, false),
                        ),
                        IconButton(
                          icon: const Icon(
                            Icons.check,
                            color: TasksDesign.accent,
                          ),
                          onPressed: () => _decide(item, true),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}
