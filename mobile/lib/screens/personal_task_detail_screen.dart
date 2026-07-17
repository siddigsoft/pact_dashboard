import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/personal_task.dart';
import '../services/personal_task_service.dart';
import '../theme/app_colors.dart';
import '../widgets/app_widgets.dart';
import '../widgets/tasks/proof_submit_sheet.dart';
import '../widgets/tasks/start_task_sheet.dart';
import '../widgets/tasks/submit_approval_sheet.dart';
import '../utils/task_html_utils.dart';
import '../widgets/tasks/task_activity_panel.dart';
import '../widgets/tasks/task_approvals_panel.dart';
import '../widgets/tasks/task_assignee_elements_panel.dart';
import '../widgets/tasks/task_attachments_panel.dart';
import '../widgets/tasks/task_comments_panel.dart';
import '../widgets/tasks/task_dependencies_panel.dart';
import '../widgets/tasks/task_edit_sheet.dart';
import '../widgets/tasks/task_work_session_card.dart';
import '../widgets/tasks/tasks_design.dart';

class PersonalTaskDetailScreen extends StatefulWidget {
  final String taskId;
  final List<PersonalTask> myTasks;

  const PersonalTaskDetailScreen({
    super.key,
    required this.taskId,
    this.myTasks = const [],
  });

  @override
  State<PersonalTaskDetailScreen> createState() =>
      _PersonalTaskDetailScreenState();
}

class _PersonalTaskDetailScreenState extends State<PersonalTaskDetailScreen> {
  final PersonalTaskService _service = PersonalTaskService();
  PersonalTask? _task;
  bool _loading = true;
  bool _busy = false;
  final _outputController = TextEditingController();
  final _descriptionController = TextEditingController();
  bool _editingDescription = false;
  List<PersonalTask> _subtasks = [];

  String? get _userId => Supabase.instance.client.auth.currentUser?.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _outputController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final task = await _service.fetchTaskById(widget.taskId);
      List<PersonalTask> subs = [];
      if (task != null) {
        subs = await _service.fetchSubtasks(widget.taskId);
      }
      if (mounted) {
        setState(() {
          _task = task;
          _subtasks = subs;
          _loading = false;
          _outputController.text = task?.outputText ?? '';
          _descriptionController.text = task == null
              ? ''
              : TaskHtmlUtils.toPlainText(task.displayDescription);
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _run(
    Future<void> Function() action, {
    bool popOnSuccess = false,
  }) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      await _load();
      if (popOnSuccess && mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        AppSnackBar.show(
          context,
          message: e.toString().replaceFirst('Exception: ', ''),
          type: SnackBarType.error,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _acknowledge() async {
    final task = _task;
    if (task == null) return;
    await _run(() async {
      await _service.acknowledgeTask(task);
    });
  }

  Future<void> _startTask() async {
    final task = _task;
    if (task == null) return;
    final input = await showStartTaskSheet(context, task: task);
    if (input == null) return;
    await _run(() => _service.startTask(widget.taskId, input));
  }

  Future<void> _completeTask() async {
    final task = _task;
    if (task == null) return;
    if (task.needsProofBeforeComplete) {
      final proof = await showProofSubmitSheet(context);
      if (proof == null) return;
      await _run(() async {
        await _service.submitProof(widget.taskId, proof.proofNote);
        await _service.updateStatus(widget.taskId, PersonalTaskStatus.done);
      }, popOnSuccess: true);
      if (mounted && task.completionRewardAmount != null) {
        AppSnackBar.show(
          context,
          message: 'Task completed — reward will be credited to your wallet',
          type: SnackBarType.success,
        );
      }
      return;
    }
    await _run(
      () => _service.updateStatus(widget.taskId, PersonalTaskStatus.done),
      popOnSuccess: true,
    );
    if (mounted &&
        task.completionRewardAmount != null &&
        task.completionRewardAmount! > 0) {
      AppSnackBar.show(
        context,
        message: 'Task completed — reward credited to wallet',
        type: SnackBarType.success,
      );
    }
  }

  Future<void> _submitProofOnly() async {
    final proof = await showProofSubmitSheet(context);
    if (proof == null) return;
    await _run(() => _service.submitProof(widget.taskId, proof.proofNote));
    if (mounted) {
      AppSnackBar.show(
        context,
        message: 'Proof submitted',
        type: SnackBarType.success,
      );
    }
  }

  Future<void> _setStatus(PersonalTaskStatus status) async {
    if (status == PersonalTaskStatus.onHold ||
        status == PersonalTaskStatus.cancelled ||
        status == PersonalTaskStatus.rescheduled) {
      final reason = await _promptReason(status);
      if (reason == null) return;
      await _run(
        () => _service.updateStatus(
          widget.taskId,
          status,
          holdReason: reason,
        ),
        popOnSuccess: status == PersonalTaskStatus.done,
      );
      return;
    }
    if (status == PersonalTaskStatus.done) {
      await _completeTask();
      return;
    }
    await _run(
      () => _service.updateStatus(widget.taskId, status),
      popOnSuccess: status == PersonalTaskStatus.done,
    );
  }

  Future<void> _editTask() async {
    final task = _task;
    if (task == null || !task.canEdit) return;
    final result = await showTaskEditSheet(context, task: task);
    if (result == null) return;
    await _run(
      () => _service.updateTaskFromEdit(
        taskId: widget.taskId,
        title: result.title,
        priority: result.priority,
        dueDate: result.dueDate,
        assignedToId: result.assignedToId,
        assignedToName: result.assignedToName,
      ),
    );
  }

  Future<void> _deleteTask() async {
    final task = _task;
    if (task == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete task?'),
        content: Text('Permanently delete "${task.title}"?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run(() => _service.deleteTask(widget.taskId), popOnSuccess: true);
  }

  Future<String?> _promptReason(PersonalTaskStatus status) async {
    final controller = TextEditingController();
    final label = switch (status) {
      PersonalTaskStatus.cancelled => 'Cancellation reason',
      PersonalTaskStatus.rescheduled => 'Reschedule reason',
      _ => 'Reason for hold',
    };
    final result = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(label),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'Optional note'),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    controller.dispose();
    return result;
  }

  Future<void> _saveOutput() async {
    await _run(
      () => _service.updateOutput(widget.taskId, _outputController.text),
    );
    if (mounted) {
      AppSnackBar.show(
        context,
        message: 'Output saved',
        type: SnackBarType.success,
      );
    }
  }

  Future<void> _submitForApproval() async {
    final ok = await showSubmitApprovalSheet(context, widget.taskId);
    if (ok == true && mounted) {
      AppSnackBar.show(
        context,
        message: 'Submitted for approval',
        type: SnackBarType.success,
      );
    }
  }

  Future<void> _addSubtask() async {
    final controller = TextEditingController();
    final title = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New subtask'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'Subtask title'),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, controller.text),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (title == null || title.trim().isEmpty) return;
    await _run(() => _service.createSubtask(
      parentTaskId: widget.taskId,
      title: title.trim(),
    ));
  }

  Future<void> _saveDescription() async {
    await _run(
      () => _service.saveDescription(
        widget.taskId,
        _descriptionController.text,
      ),
    );
    if (mounted) {
      setState(() => _editingDescription = false);
      AppSnackBar.show(
        context,
        message: 'Description saved',
        type: SnackBarType.success,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 6,
      child: Scaffold(
        backgroundColor: TasksDesign.canvas,
        appBar: AppBar(
          title: Text(
            _task?.title ?? 'Task',
            style: TasksDesign.titleMd(context),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          backgroundColor: TasksDesign.surface,
          foregroundColor: TasksDesign.ink,
          elevation: 0,
          actions: [
            if (_task != null && _task!.canEdit)
              IconButton(
                icon: const Icon(Icons.edit_outlined),
                onPressed: _busy ? null : _editTask,
              ),
            if (_task != null && _task!.isCreatedBy(_userId ?? ''))
              IconButton(
                icon: const Icon(Icons.delete_outline),
                onPressed: _busy ? null : _deleteTask,
              ),
          ],
          bottom: _task == null
              ? null
              : const TabBar(
                  labelColor: TasksDesign.accent,
                  unselectedLabelColor: TasksDesign.muted,
                  indicatorColor: TasksDesign.accent,
                  isScrollable: true,
                  tabs: [
                    Tab(text: 'Overview'),
                    Tab(text: 'Work'),
                    Tab(text: 'Comments'),
                    Tab(text: 'Activity'),
                    Tab(text: 'Dependencies'),
                    Tab(text: 'Approvals'),
                  ],
                ),
        ),
        body: _loading
            ? const Center(child: CircularProgressIndicator())
            : _task == null
            ? Center(
                child: Text(
                  'Task not found',
                  style: TasksDesign.caption(context),
                ),
              )
            : TabBarView(
                children: [
                  _buildOverview(_task!),
                  _buildWork(_task!),
                  TaskCommentsPanel(taskId: widget.taskId),
                  TaskActivityPanel(taskId: widget.taskId),
                  TaskDependenciesPanel(
                    taskId: widget.taskId,
                    taskTitle: _task!.title,
                    myTasks: widget.myTasks,
                    projectId: _task!.projectId,
                  ),
                  TaskApprovalsPanel(taskId: widget.taskId),
                ],
              ),
      ),
    );
  }

  Widget _buildOverview(PersonalTask task) {
    final uid = _userId ?? '';
    final needsAck = task.needsAcknowledgement(uid);
    final canStart =
        task.isActive &&
        task.isAcknowledgedBy(uid) &&
        task.status == PersonalTaskStatus.todo &&
        !task.hasPendingParticipantAcknowledgements(uid);
    final canComplete =
        task.isActive &&
        task.isAcknowledgedBy(uid) &&
        (task.startedAt != null ||
            task.status == PersonalTaskStatus.inprogress) &&
        !task.needsProofBeforeComplete;
    final pendingCoAck = task.hasPendingParticipantAcknowledgements(uid);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            task.title,
            style: GoogleFonts.inter(
              fontSize: 22,
              fontWeight: FontWeight.w700,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _StatusChip(
                label: PersonalTask.statusLabel(task.status),
                color: PersonalTask.statusColor(task.status),
              ),
              _StatusChip(
                label: PersonalTask.priorityLabel(task.priority),
                color: PersonalTask.priorityColor(task.priority),
              ),
            ],
          ),
          if (task.assignedToName != null) ...[
            const SizedBox(height: 16),
            _InfoRow(
              icon: Icons.person_outline,
              label: 'Assignee',
              value: task.assignedToName!,
            ),
          ],
          if (task.coAssignees.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text('Co-assignees', style: TasksDesign.titleMd(context)),
            const SizedBox(height: 6),
            ...task.coAssignees.map(
              (c) => Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  children: [
                    Icon(
                      c.acknowledgedAt != null
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                      size: 18,
                      color: c.acknowledgedAt != null
                          ? AppColors.accentGreen
                          : TasksDesign.muted,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(c.name, style: TasksDesign.body(context)),
                    ),
                  ],
                ),
              ),
            ),
          ],
          if (task.proofRequired) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: task.hasProofSubmitted
                    ? const Color(0xFFECFDF5)
                    : const Color(0xFFFFF7ED),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: task.hasProofSubmitted
                      ? const Color(0xFF86EFAC)
                      : const Color(0xFFFDBA74),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    task.hasProofSubmitted
                        ? Icons.verified_outlined
                        : Icons.assignment_outlined,
                    color: task.hasProofSubmitted
                        ? AppColors.accentGreen
                        : AppColors.primaryOrange,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      task.hasProofSubmitted
                          ? 'Proof submitted'
                          : 'Proof required before completion',
                      style: TasksDesign.caption(context),
                    ),
                  ),
                ],
              ),
            ),
          ],
          if (task.dueDate != null) ...[
            const SizedBox(height: 8),
            _InfoRow(
              icon: Icons.event_outlined,
              label: 'Due',
              value: DateFormat.yMMMEd().format(task.dueDate!),
              valueColor: task.isOverdue ? AppColors.accentRed : null,
            ),
          ],
          if (task.completionRewardAmount != null &&
              task.completionRewardAmount! > 0) ...[
            const SizedBox(height: 8),
            _InfoRow(
              icon: Icons.account_balance_wallet_outlined,
              label: 'Reward',
              value:
                  '${task.completionRewardAmount!.toStringAsFixed(2)} ${task.completionRewardCurrency}',
              valueColor: AppColors.accentGreen,
            ),
          ],
          const SizedBox(height: 20),
          Row(
            children: [
              Text(
                'Description',
                style: TasksDesign.titleMd(context),
              ),
              const Spacer(),
              if (task.isActive)
                TextButton(
                  onPressed: _busy
                      ? null
                      : () {
                          if (_editingDescription) {
                            _saveDescription();
                          } else {
                            setState(() => _editingDescription = true);
                          }
                        },
                  child: Text(_editingDescription ? 'Save' : 'Edit'),
                ),
            ],
          ),
          const SizedBox(height: 6),
          if (_editingDescription)
            TextField(
              controller: _descriptionController,
              decoration: TasksDesign.fieldDecoration('Description'),
              maxLines: 8,
              minLines: 4,
              enabled: !_busy,
            )
          else if (TaskHtmlUtils.toPlainText(task.displayDescription).isNotEmpty)
            Text(
              TaskHtmlUtils.toPlainText(task.displayDescription),
              style: TasksDesign.body(context),
            )
          else
            Text(
              'No description',
              style: TasksDesign.caption(context),
            ),
          if (needsAck) ...[
            const SizedBox(height: 20),
            _ActionBanner(
              color: AppColors.primaryOrange,
              icon: Icons.notifications_active_outlined,
              message: 'Please acknowledge that you have seen this task.',
              actionLabel: 'I acknowledge',
              onAction: _busy ? null : _acknowledge,
            ),
          ],
          if (pendingCoAck && task.isActive) ...[
            const SizedBox(height: 12),
            _ActionBanner(
              color: AppColors.accentYellow,
              icon: Icons.group_outlined,
              message:
                  'Waiting for all assignees to acknowledge before this task can start.',
              actionLabel: '',
              onAction: null,
            ),
          ],
          if (_subtasks.isNotEmpty || !task.isSubtask) ...[
            const SizedBox(height: 20),
            Row(
              children: [
                Text('Subtasks', style: TasksDesign.titleMd(context)),
                const Spacer(),
                if (task.isActive && !task.isSubtask)
                  TextButton(
                    onPressed: _busy ? null : _addSubtask,
                    child: const Text('Add'),
                  ),
              ],
            ),
            if (_subtasks.isEmpty)
              Text('No subtasks', style: TasksDesign.caption(context))
            else
              ..._subtasks.map(
                (s) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(s.title, style: TasksDesign.body(context)),
                  trailing: Text(
                    PersonalTask.statusLabel(s.status),
                    style: TasksDesign.caption(context),
                  ),
                  onTap: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => PersonalTaskDetailScreen(taskId: s.id),
                    ),
                  ),
                ),
              ),
          ],
          if (task.isActive) ...[
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: _busy ? null : _submitForApproval,
              icon: const Icon(Icons.approval_outlined),
              label: const Text('Submit for approval'),
            ),
            const SizedBox(height: 12),
            Text(
              'Actions',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
                color: AppColors.textDark,
              ),
            ),
            const SizedBox(height: 10),
            if (canStart)
              _ActionButton(
                label: 'Start task',
                icon: Icons.play_arrow_rounded,
                color: AppColors.primaryBlue,
                onPressed: _busy ? null : _startTask,
              ),
            if (task.status == PersonalTaskStatus.inprogress) ...[
              const SizedBox(height: 8),
              _ActionButton(
                label: 'Put on hold',
                icon: Icons.pause_circle_outline,
                color: AppColors.accentYellow,
                onPressed: _busy
                    ? null
                    : () => _setStatus(PersonalTaskStatus.onHold),
              ),
            ],
            if (task.needsProofBeforeComplete && task.isActive) ...[
              const SizedBox(height: 8),
              _ActionButton(
                label: 'Submit proof',
                icon: Icons.assignment_turned_in_outlined,
                color: AppColors.primaryOrange,
                onPressed: _busy ? null : _submitProofOnly,
              ),
            ],
            if (canComplete) ...[
              const SizedBox(height: 8),
              _ActionButton(
                label: 'Mark as done',
                icon: Icons.check_circle_outline,
                color: AppColors.accentGreen,
                onPressed: _busy ? null : _completeTask,
              ),
            ],
            const SizedBox(height: 8),
            _ActionButton(
              label: 'Reschedule',
              icon: Icons.event_repeat,
              color: TasksDesign.muted,
              onPressed: _busy
                  ? null
                  : () => _setStatus(PersonalTaskStatus.rescheduled),
            ),
            const SizedBox(height: 8),
            _ActionButton(
              label: 'Cancel task',
              icon: Icons.cancel_outlined,
              color: AppColors.accentRed,
              onPressed: _busy
                  ? null
                  : () => _setStatus(PersonalTaskStatus.cancelled),
            ),
            if (task.status == PersonalTaskStatus.onHold) ...[
              const SizedBox(height: 8),
              _ActionButton(
                label: 'Resume',
                icon: Icons.play_arrow_rounded,
                color: AppColors.primaryBlue,
                onPressed: _busy
                    ? null
                    : () => _setStatus(PersonalTaskStatus.inprogress),
              ),
            ],
          ],
          if (task.status == PersonalTaskStatus.inprogress ||
              task.outputText != null) ...[
            const SizedBox(height: 20),
            Text(
              'Output / notes',
              style: GoogleFonts.inter(
                fontWeight: FontWeight.w600,
                color: AppColors.textDark,
              ),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _outputController,
              decoration: const InputDecoration(
                hintText: 'What did you accomplish?',
                border: OutlineInputBorder(),
              ),
              maxLines: 4,
              enabled: task.isActive && !_busy,
            ),
            if (task.isActive) ...[
              const SizedBox(height: 8),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(
                  onPressed: _busy ? null : _saveOutput,
                  child: const Text('Save output'),
                ),
              ),
            ],
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildWork(PersonalTask task) {
    final uid = _userId ?? '';
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (uid.isNotEmpty)
            TaskWorkSessionCard(
              taskId: widget.taskId,
              userId: uid,
              enabled: task.isActive,
              onApplyHours: task.isActive
                  ? (hours) async {
                      final err = await _service.applyWorkSessionHours(
                        widget.taskId,
                        hours,
                      );
                      if (!mounted) return;
                      if (err != null) {
                        AppSnackBar.show(
                          context,
                          message: err,
                          type: SnackBarType.error,
                        );
                      } else {
                        AppSnackBar.show(
                          context,
                          message: 'Hours applied to task',
                          type: SnackBarType.success,
                        );
                        await _load();
                      }
                    }
                  : null,
            ),
          const SizedBox(height: 16),
          Text('Checklist', style: TasksDesign.titleMd(context)),
          const SizedBox(height: 8),
          TaskAssigneeElementsPanel(taskId: widget.taskId),
          const SizedBox(height: 20),
          Text('Attachments', style: TasksDesign.titleMd(context)),
          const SizedBox(height: 8),
          TaskAttachmentsPanel(
            taskId: widget.taskId,
            canEdit: task.canEdit,
          ),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusChip({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: GoogleFonts.inter(
          fontWeight: FontWeight.w600,
          color: color,
          fontSize: 12,
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? valueColor;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.textLight),
        const SizedBox(width: 8),
        Text(
          '$label: ',
          style: GoogleFonts.inter(
            fontSize: 13,
            color: AppColors.textLight,
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: GoogleFonts.inter(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: valueColor ?? AppColors.textDark,
            ),
          ),
        ),
      ],
    );
  }
}

class _ActionBanner extends StatelessWidget {
  final Color color;
  final IconData icon;
  final String message;
  final String actionLabel;
  final VoidCallback? onAction;

  const _ActionBanner({
    required this.color,
    required this.icon,
    required this.message,
    required this.actionLabel,
    this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 22),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  message,
                  style: GoogleFonts.inter(
                    fontSize: 13,
                    color: AppColors.textDark,
                  ),
                ),
              ),
            ],
          ),
          if (onAction != null && actionLabel.isNotEmpty) ...[
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: onAction,
                style: FilledButton.styleFrom(backgroundColor: color),
                child: Text(actionLabel),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback? onPressed;

  const _ActionButton({
    required this.label,
    required this.icon,
    required this.color,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, color: color),
        label: Text(
          label,
          style: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            color: color,
          ),
        ),
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 12),
          side: BorderSide(color: color.withValues(alpha: 0.5)),
        ),
      ),
    );
  }
}
