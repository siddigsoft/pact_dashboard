import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../theme/app_colors.dart';
import '../providers/app_providers.dart';
import '../models/project_model.dart';
import '../config/project_flows.dart';
import '../widgets/shimmer_loading.dart';

// ─────────────────────────────────────────────────────────────
// Project Detail Screen
// ─────────────────────────────────────────────────────────────

class ProjectDetailScreen extends ConsumerStatefulWidget {
  final String projectId;
  const ProjectDetailScreen({super.key, required this.projectId});

  @override
  ConsumerState<ProjectDetailScreen> createState() =>
      _ProjectDetailScreenState();
}

class _ProjectDetailScreenState
    extends ConsumerState<ProjectDetailScreen> {
  @override
  Widget build(BuildContext context) {
    final projectAsync =
        ref.watch(projectDetailProvider(widget.projectId));
    final userProfile = ref.watch(userProfileProvider).valueOrNull;
    final isOnline = ref.watch(isOnlineProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.primaryDark,
        title: const Text('Project Detail',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white),
            onPressed: () =>
                ref.invalidate(projectDetailProvider(widget.projectId)),
          ),
        ],
      ),
      body: projectAsync.when(
        loading: () => const ShimmerBody(
            layout: ShimmerLayout.project, listItems: 4),
        error: (e, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48, color: Colors.red),
              const SizedBox(height: 12),
              Text('Failed to load project: $e',
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.grey)),
            ],
          ),
        ),
        data: (project) {
          if (project == null) {
            return const Center(child: Text('Project not found.'));
          }
          final stages = getProjectFlow(project.projectType);
          final currentStageId =
              project.currentFlowStage ?? stages.first.id;
          final currentStageIdx =
              stages.indexWhere((s) => s.id == currentStageId);
          final validIdx = currentStageIdx < 0 ? 0 : currentStageIdx;
          final canAdvance = _canAdvance(project, userProfile) &&
              validIdx < stages.length - 1;

          return DefaultTabController(
            length: 3,
            child: Column(
              children: [
                _ProjectHeader(project: project),
                const SizedBox(height: 4),
                _FlowStrip(
                  stages: stages,
                  currentStageIdx: validIdx,
                  flowLog: project.flowLog,
                ),
                Container(
                  color: Colors.white,
                  child: TabBar(
                    labelColor: AppColors.primaryDark,
                    unselectedLabelColor: Colors.grey,
                    indicatorColor: AppColors.primaryDark,
                    labelStyle: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600),
                    tabs: const [
                      Tab(
                        icon: Icon(Icons.account_tree_outlined, size: 16),
                        text: 'Flow',
                        iconMargin: EdgeInsets.only(bottom: 2),
                      ),
                      Tab(
                        icon: Icon(Icons.chat_bubble_outline, size: 16),
                        text: 'Comments',
                        iconMargin: EdgeInsets.only(bottom: 2),
                      ),
                      Tab(
                        icon: Icon(Icons.folder_outlined, size: 16),
                        text: 'Documents',
                        iconMargin: EdgeInsets.only(bottom: 2),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: TabBarView(
                    children: [
                      // Flow Tab
                      RefreshIndicator(
                        onRefresh: () async => ref.invalidate(
                            projectDetailProvider(widget.projectId)),
                        child: ListView(
                          padding: const EdgeInsets.fromLTRB(12, 10, 12, 32),
                          children: List.generate(stages.length, (i) {
                            return _StageCard(
                              stage: stages[i],
                              index: i,
                              isCurrent: i == validIdx,
                              isCompleted: i < validIdx,
                              flowLog: project.flowLog,
                              canAdvance: canAdvance && i == validIdx,
                              isOnline: isOnline,
                              onAdvance: () => _showAdvanceSheet(
                                context,
                                project: project,
                                stages: stages,
                                currentIdx: validIdx,
                                userProfile: userProfile,
                              ),
                            );
                          }),
                        ),
                      ),
                      // Comments Tab
                      _CommentsTab(
                        projectId: widget.projectId,
                        currentUserId:
                            userProfile?.id ?? '',
                        currentUserName: userProfile?.fullName,
                      ),
                      // Documents Tab
                      _DocumentsTab(projectId: widget.projectId),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  bool _canAdvance(ProjectModel project, UserProfile? userProfile) {
    if (userProfile == null) return false;
    // Privileged roles (mirrors web: super_admin, admin, fom)
    if (userProfile.isAdmin || userProfile.isFom) return true;
    // Project manager: web stores as team.projectManager (string name),
    // so we compare by fullName — same logic as useProjectFlow.ts ln 149-152.
    final teamData = project.team;
    if (teamData == null) return false;
    final pmName = teamData['projectManager'] as String?;
    final userName = userProfile.fullName;
    return pmName != null && userName != null && pmName == userName;
  }

  void _showAdvanceSheet(
    BuildContext context, {
    required ProjectModel project,
    required List<ProjectFlowStage> stages,
    required int currentIdx,
    required UserProfile? userProfile,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _AdvanceStageSheet(
        project: project,
        stages: stages,
        currentIdx: currentIdx,
        userProfile: userProfile,
        onSuccess: () =>
            ref.invalidate(projectDetailProvider(widget.projectId)),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Project Header
// ─────────────────────────────────────────────────────────────

class _ProjectHeader extends StatelessWidget {
  const _ProjectHeader({required this.project});
  final ProjectModel project;

  Color _statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active': return Colors.green;
      case 'completed': return Colors.blue;
      case 'on_hold': case 'onhold': return Colors.orange;
      case 'cancelled': return Colors.red;
      default: return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    final statusColor = _statusColor(project.status);
    final typeLabel = getProjectTypeLabel(project.projectType);
    return Container(
      color: AppColors.primaryDark,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(project.name,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          Wrap(spacing: 8, runSpacing: 6, children: [
            _Chip(label: typeLabel, color: Colors.white24),
            _Chip(
              label: project.status.toUpperCase(),
              color: statusColor.withOpacity(0.3),
              textColor: Colors.white,
            ),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            const Icon(Icons.person_outline, color: Colors.white70, size: 14),
            const SizedBox(width: 4),
            Text('PM: ${project.projectManager}',
                style: const TextStyle(color: Colors.white70, fontSize: 12)),
          ]),
          if (project.projectCode != null) ...[
            const SizedBox(height: 2),
            Row(children: [
              const Icon(Icons.tag, color: Colors.white54, size: 13),
              const SizedBox(width: 4),
              Text(project.projectCode!,
                  style: const TextStyle(
                      color: Colors.white54,
                      fontSize: 11,
                      fontFamily: 'monospace')),
            ]),
          ],
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(
      {required this.label,
      required this.color,
      this.textColor = Colors.white});
  final String label;
  final Color color;
  final Color textColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
          color: color, borderRadius: BorderRadius.circular(12)),
      child: Text(label,
          style: TextStyle(
              color: textColor, fontSize: 11, fontWeight: FontWeight.w600)),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Flow Strip (horizontal scrollable stepper)
// ─────────────────────────────────────────────────────────────

class _FlowStrip extends StatelessWidget {
  const _FlowStrip({
    required this.stages,
    required this.currentStageIdx,
    required this.flowLog,
  });

  final List<ProjectFlowStage> stages;
  final int currentStageIdx;
  final List<ProjectFlowLog> flowLog;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          children: List.generate(stages.length * 2 - 1, (i) {
            if (i.isOdd) {
              // Connector line
              final stageIdx = i ~/ 2;
              final isDone = stageIdx < currentStageIdx;
              return Container(
                width: 24,
                height: 2,
                color: isDone
                    ? AppColors.primaryDark
                    : Colors.grey.shade300,
              );
            }
            final stageIdx = i ~/ 2;
            return _FlowNode(
              stage: stages[stageIdx],
              index: stageIdx,
              isCurrent: stageIdx == currentStageIdx,
              isCompleted: stageIdx < currentStageIdx,
              flowLog: flowLog,
            );
          }),
        ),
      ),
    );
  }
}

class _FlowNode extends StatelessWidget {
  const _FlowNode({
    required this.stage,
    required this.index,
    required this.isCurrent,
    required this.isCompleted,
    required this.flowLog,
  });

  final ProjectFlowStage stage;
  final int index;
  final bool isCurrent;
  final bool isCompleted;
  final List<ProjectFlowLog> flowLog;

  @override
  Widget build(BuildContext context) {
    final logEntry = flowLog.where((l) => l.stageId == stage.id).lastOrNull;

    return GestureDetector(
      onTap: logEntry != null
          ? () => _showLogTooltip(context, logEntry)
          : null,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          AnimatedContainer(
            duration: const Duration(milliseconds: 300),
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: isCompleted
                  ? AppColors.primaryDark
                  : isCurrent
                      ? AppColors.primaryDark.withOpacity(0.15)
                      : Colors.grey.shade100,
              border: Border.all(
                color: isCurrent || isCompleted
                    ? AppColors.primaryDark
                    : Colors.grey.shade300,
                width: isCurrent ? 2.5 : 1.5,
              ),
            ),
            child: Center(
              child: isCompleted
                  ? const Icon(Icons.check, color: Colors.white, size: 18)
                  : isCurrent
                      ? _PulsingDot()
                      : Text('${index + 1}',
                          style: TextStyle(
                              color: Colors.grey.shade500,
                              fontWeight: FontWeight.bold,
                              fontSize: 13)),
            ),
          ),
          const SizedBox(height: 4),
          SizedBox(
            width: 60,
            child: Text(
              stage.label,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 9,
                fontWeight:
                    isCurrent ? FontWeight.bold : FontWeight.normal,
                color: isCurrent
                    ? AppColors.primaryDark
                    : isCompleted
                        ? Colors.grey.shade700
                        : Colors.grey.shade400,
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _showLogTooltip(BuildContext context, ProjectFlowLog log) {
    final date = '${log.advancedAt.year}-${log.advancedAt.month.toString().padLeft(2, '0')}-${log.advancedAt.day.toString().padLeft(2, '0')}';
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: Text(stage.label),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Advanced on: $date',
                style: const TextStyle(fontSize: 13)),
            if (log.notes != null && log.notes!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Notes: ${log.notes}',
                  style: const TextStyle(fontSize: 13)),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}

class _PulsingDot extends StatefulWidget {
  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 900))
      ..repeat(reverse: true);
    _animation = Tween<double>(begin: 0.5, end: 1.0).animate(_controller);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _animation,
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppColors.primaryDark,
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Stage Card
// ─────────────────────────────────────────────────────────────

class _StageCard extends StatelessWidget {
  const _StageCard({
    required this.stage,
    required this.index,
    required this.isCurrent,
    required this.isCompleted,
    required this.flowLog,
    required this.canAdvance,
    required this.isOnline,
    required this.onAdvance,
  });

  final ProjectFlowStage stage;
  final int index;
  final bool isCurrent;
  final bool isCompleted;
  final List<ProjectFlowLog> flowLog;
  final bool canAdvance;
  final bool isOnline;
  final VoidCallback onAdvance;

  @override
  Widget build(BuildContext context) {
    final logEntry = flowLog.where((l) => l.stageId == stage.id).lastOrNull;

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      elevation: isCurrent ? 3 : 1,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: isCurrent
              ? Border.all(color: AppColors.primaryDark, width: 1.5)
              : null,
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Stage header
              Row(
                children: [
                  _stageIcon(),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${index + 1}. ${stage.label}',
                          style: TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: isCurrent
                                ? AppColors.primaryDark
                                : Colors.black87,
                          ),
                        ),
                        if (isCurrent)
                          Container(
                            margin: const EdgeInsets.only(top: 2),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.primaryDark.withOpacity(0.1),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              'Current Stage',
                              style: TextStyle(
                                  color: AppColors.primaryDark,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(stage.description,
                  style: TextStyle(
                      color: Colors.grey.shade700, fontSize: 12)),
              if (stage.keyOutputs.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text('Key Outputs',
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 11,
                        color: Colors.grey.shade600)),
                const SizedBox(height: 4),
                ...stage.keyOutputs.map((o) => Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            isCompleted
                                ? Icons.check_box
                                : Icons.check_box_outline_blank,
                            size: 14,
                            color: isCompleted
                                ? Colors.green
                                : Colors.grey.shade400,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(o,
                                style: TextStyle(
                                    fontSize: 12,
                                    color: Colors.grey.shade700)),
                          ),
                        ],
                      ),
                    )),
              ],
              if (logEntry != null) ...[
                const SizedBox(height: 8),
                Divider(color: Colors.grey.shade200, height: 1),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Icon(Icons.history,
                        size: 12, color: Colors.grey.shade400),
                    const SizedBox(width: 4),
                    Text(
                      'Advanced ${_relDate(logEntry.advancedAt)}',
                      style: TextStyle(
                          fontSize: 11, color: Colors.grey.shade500),
                    ),
                  ],
                ),
                if (logEntry.notes != null &&
                    logEntry.notes!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text('"${logEntry.notes}"',
                      style: TextStyle(
                          fontSize: 11,
                          color: Colors.grey.shade500,
                          fontStyle: FontStyle.italic)),
                ],
              ],
              // Advance button
              if (canAdvance) ...[
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: Tooltip(
                    message: isOnline
                        ? ''
                        : 'Internet connection required to advance the stage',
                    child: ElevatedButton.icon(
                      onPressed: isOnline ? onAdvance : null,
                      icon: const Icon(Icons.arrow_forward, size: 16),
                      label: const Text('Mark Complete & Advance'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primaryDark,
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: Colors.grey.shade300,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _stageIcon() {
    if (isCompleted) {
      return CircleAvatar(
        radius: 14,
        backgroundColor: Colors.green.shade50,
        child: const Icon(Icons.check, color: Colors.green, size: 16),
      );
    }
    if (isCurrent) {
      return CircleAvatar(
        radius: 14,
        backgroundColor: AppColors.primaryDark.withOpacity(0.1),
        child: Icon(Icons.play_arrow,
            color: AppColors.primaryDark, size: 16),
      );
    }
    return CircleAvatar(
      radius: 14,
      backgroundColor: Colors.grey.shade100,
      child: Text('${index + 1}',
          style: TextStyle(
              color: Colors.grey.shade500,
              fontSize: 11,
              fontWeight: FontWeight.bold)),
    );
  }

  String _relDate(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inDays == 0) return 'today';
    if (diff.inDays == 1) return 'yesterday';
    if (diff.inDays < 30) return '${diff.inDays} days ago';
    return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
  }
}

// ─────────────────────────────────────────────────────────────
// Advance Stage Bottom Sheet
// ─────────────────────────────────────────────────────────────

class _AdvanceStageSheet extends ConsumerStatefulWidget {
  const _AdvanceStageSheet({
    required this.project,
    required this.stages,
    required this.currentIdx,
    required this.userProfile,
    required this.onSuccess,
  });

  final ProjectModel project;
  final List<ProjectFlowStage> stages;
  final int currentIdx;
  final UserProfile? userProfile;
  final VoidCallback onSuccess;

  @override
  ConsumerState<_AdvanceStageSheet> createState() =>
      _AdvanceStageSheetState();
}

class _AdvanceStageSheetState extends ConsumerState<_AdvanceStageSheet> {
  final _notesController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final nextIdx = widget.currentIdx + 1;
    final currentStage = widget.stages[widget.currentIdx];
    final nextStage = widget.stages[nextIdx];
    final isOnline = ref.watch(isOnlineProvider);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
        left: 20,
        right: 20,
        top: 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 20),
          const Text('Advance Stage',
              style:
                  TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(
            'Mark "${currentStage.label}" as complete and advance to "${nextStage.label}".',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
          const SizedBox(height: 16),
          if (!isOnline) ...[
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                  color: Colors.orange.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border:
                      Border.all(color: Colors.orange.shade200)),
              child: Row(
                children: [
                  Icon(Icons.wifi_off,
                      color: Colors.orange.shade700, size: 16),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'You are offline. Internet connection is required to advance the stage.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          TextField(
            controller: _notesController,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: 'Notes (optional)',
              hintText: 'Add any notes about completing this stage...',
              border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(8)),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: (!isOnline || _isSubmitting)
                  ? null
                  : () => _advance(currentStage, nextStage),
              icon: _isSubmitting
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.arrow_forward, size: 18),
              label: Text(_isSubmitting ? 'Advancing...' : 'Confirm Advance'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryDark,
                foregroundColor: Colors.white,
                disabledBackgroundColor: Colors.grey.shade300,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
                padding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Future<void> _advance(
      ProjectFlowStage completedStage, ProjectFlowStage nextStage) async {
    if (widget.userProfile == null) return;
    setState(() => _isSubmitting = true);
    try {
      final repo = ref.read(projectRepositoryProvider);
      // Log the COMPLETED stage (mirrors web useProjectFlow.ts ln 183-196):
      // insert flow_log for current stage, then update current_flow_stage to next.
      await repo.advanceStage(
        projectId: widget.project.id,
        completedStageId: completedStage.id,
        completedStageLabel: completedStage.label,
        nextStageId: nextStage.id,
        advancedById: widget.userProfile!.id,
        notes: _notesController.text.trim().isEmpty
            ? null
            : _notesController.text.trim(),
      );
      if (!mounted) return;
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:
              Text('Stage advanced to "${nextStage.label}" successfully!'),
          backgroundColor: Colors.green,
        ),
      );
      widget.onSuccess();
    } catch (e) {
      if (!mounted) return;
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to advance stage: $e'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Comments Tab
// ─────────────────────────────────────────────────────────────

class _CommentsTab extends StatefulWidget {
  final String projectId;
  final String currentUserId;
  final String? currentUserName;
  const _CommentsTab({
    required this.projectId,
    required this.currentUserId,
    this.currentUserName,
  });

  @override
  State<_CommentsTab> createState() => _CommentsTabState();
}

class _CommentsTabState extends State<_CommentsTab> {
  final _supabase = Supabase.instance.client;
  final _controller = TextEditingController();
  List<Map<String, dynamic>> _comments = [];
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _fetchComments();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _fetchComments() async {
    try {
      final data = await _supabase
          .from('project_comments')
          .select('id, content, created_at, author_id, profiles(full_name)')
          .eq('project_id', widget.projectId)
          .order('created_at', ascending: true);
      if (!mounted) return;
      setState(() {
        _comments = List<Map<String, dynamic>>.from(data ?? []);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _submit() async {
    final text = _controller.text.trim();
    if (text.isEmpty || widget.currentUserId.isEmpty) return;
    setState(() => _submitting = true);
    try {
      await _supabase.from('project_comments').insert({
        'project_id': widget.projectId,
        'author_id': widget.currentUserId,
        'content': text,
        if (widget.currentUserName != null)
          'author_name': widget.currentUserName,
      });
      _controller.clear();
      await _fetchComments();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Failed to post comment: $e'),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _relDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.inMinutes < 1) return 'just now';
      if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
      if (diff.inHours < 24) return '${diff.inHours}h ago';
      if (diff.inDays < 7) return '${diff.inDays}d ago';
      return '${dt.year}-${dt.month.toString().padLeft(2, '0')}-${dt.day.toString().padLeft(2, '0')}';
    } catch (_) {
      return '';
    }
  }

  String _initials(String? name) {
    if (name == null || name.isEmpty) return '?';
    final parts = name.trim().split(' ');
    return parts.take(2).map((p) => p[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Comment input
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  maxLines: 3,
                  minLines: 1,
                  decoration: InputDecoration(
                    hintText: 'Write a comment…',
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(8)),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 8),
                    isDense: true,
                  ),
                  style: const TextStyle(fontSize: 13),
                ),
              ),
              const SizedBox(width: 8),
              SizedBox(
                height: 40,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryDark,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send, size: 18),
                ),
              ),
            ],
          ),
        ),
        const Divider(height: 1),
        // Comment list
        Expanded(
          child: _loading
              ? const ShimmerBody(
                  layout: ShimmerLayout.list, listItems: 4)
              : _comments.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.chat_bubble_outline,
                              size: 40, color: Colors.grey),
                          SizedBox(height: 8),
                          Text('No comments yet',
                              style: TextStyle(color: Colors.grey)),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: _fetchComments,
                      child: ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
                        itemCount: _comments.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final c = _comments[i];
                          final profiles = c['profiles'];
                          final authorName = (profiles != null
                                  ? profiles['full_name']
                                  : null) as String? ??
                              'Unknown';
                          final isMe = c['author_id'] == widget.currentUserId;
                          return Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              CircleAvatar(
                                radius: 16,
                                backgroundColor: isMe
                                    ? AppColors.primaryDark.withOpacity(0.15)
                                    : Colors.grey.shade200,
                                child: Text(
                                  _initials(authorName),
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,
                                    color: isMe
                                        ? AppColors.primaryDark
                                        : Colors.grey.shade700,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Container(
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    color: isMe
                                        ? AppColors.primaryDark.withOpacity(0.06)
                                        : Colors.grey.shade50,
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(
                                        color: isMe
                                            ? AppColors.primaryDark
                                                .withOpacity(0.15)
                                            : Colors.grey.shade200),
                                  ),
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        children: [
                                          Text(
                                            authorName,
                                            style: TextStyle(
                                              fontWeight: FontWeight.w600,
                                              fontSize: 12,
                                              color: isMe
                                                  ? AppColors.primaryDark
                                                  : Colors.black87,
                                            ),
                                          ),
                                          const Spacer(),
                                          Text(
                                            _relDate(c['created_at'] as String),
                                            style: const TextStyle(
                                                fontSize: 10,
                                                color: Colors.grey),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        c['content'] as String,
                                        style: const TextStyle(fontSize: 13),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          );
                        },
                      ),
                    ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────
// Documents Tab
// ─────────────────────────────────────────────────────────────

class _DocumentsTab extends StatefulWidget {
  final String projectId;
  const _DocumentsTab({required this.projectId});

  @override
  State<_DocumentsTab> createState() => _DocumentsTabState();
}

class _DocumentsTabState extends State<_DocumentsTab> {
  final _supabase = Supabase.instance.client;
  List<Map<String, dynamic>> _documents = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _fetchDocuments();
  }

  Future<void> _fetchDocuments() async {
    setState(() => _loading = true);
    try {
      final data = await _supabase
          .from('project_documents')
          .select(
              'id, label, file_name, public_url, file_size, mime_type, created_at, profiles(full_name)')
          .eq('project_id', widget.projectId)
          .order('created_at', ascending: false);
      if (!mounted) return;
      setState(() {
        _documents = List<Map<String, dynamic>>.from(data ?? []);
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  String _fileSize(dynamic bytes) {
    if (bytes == null) return '';
    final b = (bytes as num).toInt();
    if (b < 1024) return '$b B';
    if (b < 1024 * 1024) return '${(b / 1024).toStringAsFixed(1)} KB';
    return '${(b / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  String _relDate(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final diff = DateTime.now().difference(dt);
      if (diff.inDays == 0) return 'today';
      if (diff.inDays == 1) return 'yesterday';
      return '${diff.inDays} days ago';
    } catch (_) {
      return '';
    }
  }

  IconData _fileIcon(String? mime) {
    if (mime == null) return Icons.insert_drive_file_outlined;
    if (mime.startsWith('image/')) return Icons.image_outlined;
    if (mime == 'application/pdf') return Icons.picture_as_pdf_outlined;
    if (mime.contains('spreadsheet') || mime.contains('excel')) {
      return Icons.table_chart_outlined;
    }
    if (mime.contains('word') || mime.contains('document')) {
      return Icons.description_outlined;
    }
    return Icons.insert_drive_file_outlined;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const ShimmerBody(layout: ShimmerLayout.list, listItems: 5);
    }
    if (_documents.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.folder_outlined, size: 40, color: Colors.grey),
            SizedBox(height: 8),
            Text('No documents attached',
                style: TextStyle(color: Colors.grey)),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _fetchDocuments,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 24),
        itemCount: _documents.length,
        separatorBuilder: (_, __) => const SizedBox(height: 6),
        itemBuilder: (_, i) {
          final d = _documents[i];
          final profiles = d['profiles'];
          final uploaderName = (profiles != null
                  ? profiles['full_name']
                  : null) as String? ??
              'Unknown';
          final mime = d['mime_type'] as String?;
          final url = d['public_url'] as String? ?? '';
          return Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
                side:
                    BorderSide(color: Colors.grey.shade200)),
            child: ListTile(
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.primaryDark.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(_fileIcon(mime),
                    color: AppColors.primaryDark, size: 22),
              ),
              title: Text(
                d['label'] as String? ?? d['file_name'] as String? ?? 'File',
                style: const TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 13),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              subtitle: Text(
                '${_fileSize(d['file_size'])}  ·  $uploaderName  ·  ${_relDate(d['created_at'] as String)}',
                style:
                    const TextStyle(fontSize: 11, color: Colors.grey),
              ),
              trailing: url.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.open_in_new,
                          size: 20, color: Colors.grey),
                      onPressed: () {
                        // Launch URL via platform
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Opening: $url')),
                        );
                      },
                    )
                  : null,
            ),
          );
        },
      ),
    );
  }
}
