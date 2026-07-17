import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../models/task_comment.dart';
import '../../services/task_comments_service.dart';
import 'tasks_design.dart';

class TaskCommentsPanel extends StatefulWidget {
  final String taskId;

  const TaskCommentsPanel({super.key, required this.taskId});

  @override
  State<TaskCommentsPanel> createState() => _TaskCommentsPanelState();
}

class _TaskCommentsPanelState extends State<TaskCommentsPanel> {
  final _service = TaskCommentsService();
  final _input = TextEditingController();
  List<TaskComment> _comments = [];
  bool _loading = true;
  bool _sending = false;

  String? get _userId => Supabase.instance.client.auth.currentUser?.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final list = await _service.fetchComments(widget.taskId);
      if (mounted) setState(() {
        _comments = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await _service.addComment(widget.taskId, text);
      _input.clear();
      await _load();
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        Expanded(
          child: _comments.isEmpty
              ? Center(
                  child: Text(
                    'No comments yet',
                    style: TasksDesign.caption(context),
                  ),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: _comments.length,
                  itemBuilder: (_, i) {
                    final c = _comments[i];
                    final isMine = c.userId == _userId;
                    return Align(
                      alignment: isMine
                          ? Alignment.centerRight
                          : Alignment.centerLeft,
                      child: Container(
                        margin: const EdgeInsets.only(bottom: 10),
                        constraints: BoxConstraints(
                          maxWidth: MediaQuery.of(context).size.width * 0.78,
                        ),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: isMine
                              ? TasksDesign.accentSoft
                              : const Color(0xFFF8FAFC),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: TasksDesign.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              c.authorName ?? 'User',
                              style: TasksDesign.caption(context).copyWith(
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 4),
                            Text(c.content, style: TasksDesign.body(context)),
                            const SizedBox(height: 4),
                            Text(
                              DateFormat.MMMd().add_jm().format(c.createdAt),
                              style: TasksDesign.caption(context),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
        ),
        Container(
          padding: EdgeInsets.fromLTRB(
            12,
            8,
            12,
            MediaQuery.of(context).padding.bottom + 8,
          ),
          decoration: const BoxDecoration(
            color: TasksDesign.surface,
            border: Border(top: BorderSide(color: TasksDesign.line)),
          ),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  decoration: TasksDesign.fieldDecoration('Add a comment'),
                  maxLines: 3,
                  minLines: 1,
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: _sending ? null : _send,
                icon: _sending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.send),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
