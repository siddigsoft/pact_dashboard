import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../models/task_output_file.dart';
import '../../services/task_attachments_service.dart';
import 'tasks_design.dart';

class TaskAttachmentsPanel extends StatefulWidget {
  final String taskId;
  final bool canEdit;

  const TaskAttachmentsPanel({
    super.key,
    required this.taskId,
    this.canEdit = true,
  });

  @override
  State<TaskAttachmentsPanel> createState() => _TaskAttachmentsPanelState();
}

class _TaskAttachmentsPanelState extends State<TaskAttachmentsPanel> {
  final _service = TaskAttachmentsService();
  List<TaskOutputFile> _files = [];
  bool _loading = true;
  bool _uploading = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final files = await _service.fetchOutputFiles(widget.taskId);
      if (mounted) {
        setState(() {
          _files = files;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _upload() async {
    final result = await FilePicker.platform.pickFiles(withData: false);
    if (result == null || result.files.isEmpty) return;
    final file = result.files.first;
    final path = file.path;
    if (path == null) return;

    setState(() => _uploading = true);
    try {
      await _service.uploadOutputFile(
        taskId: widget.taskId,
        filePath: path,
        fileName: file.name,
      );
      await _load();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (_files.isEmpty)
          Text('No attachments', style: TasksDesign.caption(context))
        else
          ..._files.map(
            (f) => Container(
              margin: const EdgeInsets.only(bottom: 8),
              decoration: TasksDesign.card(),
              child: ListTile(
                leading: const Icon(Icons.attach_file),
                title: Text(f.name, style: TasksDesign.body(context)),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.open_in_new, size: 20),
                      onPressed: () => _openUrl(f.url),
                    ),
                    if (widget.canEdit)
                      IconButton(
                        icon: const Icon(Icons.delete_outline, size: 20),
                        onPressed: () async {
                          await _service.removeOutputFile(widget.taskId, f.url);
                          await _load();
                        },
                      ),
                  ],
                ),
                onTap: () => _openUrl(f.url),
              ),
            ),
          ),
        if (widget.canEdit) ...[
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _uploading ? null : _upload,
            icon: _uploading
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.upload_file),
            label: const Text('Add file'),
          ),
        ],
      ],
    );
  }
}
