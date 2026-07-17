import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/debug_log_service.dart';
import '../services/call_diagnostics_store.dart';
import '../widgets/reusable_app_bar.dart';

class DebugLogsScreen extends StatefulWidget {
  const DebugLogsScreen({super.key});

  @override
  State<DebugLogsScreen> createState() => _DebugLogsScreenState();
}

class _DebugLogsScreenState extends State<DebugLogsScreen> {
  final _logSvc = DebugLogService();
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    await _logSvc.loadFromDisk();
    if (mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            ReusableAppBar(
              title: 'Debug logs',
              showBackButton: true,
              actions: [
                IconButton(
                  tooltip: 'Last invite',
                  onPressed: () async {
                    final raw = await CallDiagnosticsStore.loadLastIncomingInviteRaw();
                    if (!context.mounted) return;
                    await showDialog<void>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: const Text('Last incoming invite'),
                        content: SingleChildScrollView(
                          child: SelectableText(raw ?? 'No invite saved yet.'),
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('Close'),
                          ),
                        ],
                      ),
                    );
                  },
                  icon: const Icon(Icons.call_received),
                ),
                IconButton(
                  tooltip: 'Copy',
                  onPressed: () async {
                    final text = _logSvc.snapshot().map((e) => e.toString()).join('\n');
                    await Clipboard.setData(ClipboardData(text: text));
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Copied logs to clipboard')),
                      );
                    }
                  },
                  icon: const Icon(Icons.copy),
                ),
                IconButton(
                  tooltip: 'Clear',
                  onPressed: () {
                    _logSvc.clear();
                  },
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : ValueListenableBuilder<int>(
                      valueListenable: _logSvc.revision,
                      builder: (context, _, __) {
                        final items = _logSvc.snapshot().reversed.toList();
                        if (items.isEmpty) {
                          return const Center(
                            child: Text('No logs yet. Trigger an incoming call invite.'),
                          );
                        }
                        return ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: items.length,
                          separatorBuilder: (_, __) => const Divider(height: 10),
                          itemBuilder: (context, idx) {
                            final e = items[idx];
                            return SelectableText(
                              e.toString(),
                              style: const TextStyle(fontSize: 12, height: 1.25),
                            );
                          },
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
