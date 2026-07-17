import 'package:flutter/material.dart';

import 'tasks_design.dart';

class ProofSubmitResult {
  final String proofNote;

  const ProofSubmitResult({required this.proofNote});
}

Future<ProofSubmitResult?> showProofSubmitSheet(BuildContext context) {
  return showModalBottomSheet<ProofSubmitResult>(
    context: context,
    isScrollControlled: true,
    backgroundColor: TasksDesign.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (_) => const _ProofSubmitSheet(),
  );
}

class _ProofSubmitSheet extends StatefulWidget {
  const _ProofSubmitSheet();

  @override
  State<_ProofSubmitSheet> createState() => _ProofSubmitSheetState();
}

class _ProofSubmitSheetState extends State<_ProofSubmitSheet> {
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 16, 20, bottom + 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Proof required', style: TasksDesign.titleLg(context)),
          const SizedBox(height: 8),
          Text(
            'Describe what you completed before marking this task done.',
            style: TasksDesign.caption(context),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _note,
            decoration: TasksDesign.fieldDecoration('Proof / completion note'),
            maxLines: 5,
            minLines: 3,
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () {
              if (_note.text.trim().isEmpty) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Proof note is required')),
                );
                return;
              }
              Navigator.pop(
                context,
                ProofSubmitResult(proofNote: _note.text.trim()),
              );
            },
            style: FilledButton.styleFrom(backgroundColor: TasksDesign.accent),
            child: const Text('Submit proof'),
          ),
        ],
      ),
    );
  }
}
