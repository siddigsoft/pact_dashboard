import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/offline_banner.dart';
import '../../auth/services/auth_service.dart';

class CommunicationScreen extends ConsumerStatefulWidget {
  const CommunicationScreen({super.key});
  @override
  ConsumerState<CommunicationScreen> createState() => _CommunicationScreenState();
}

class _CommunicationScreenState extends ConsumerState<CommunicationScreen> {
  List<Map<String, dynamic>> _threads = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _load(); }

  Future<void> _load() async {
    final user = ref.read(currentUserProvider);
    if (user == null) return;
    try {
      final data = await Supabase.instance.client
          .from('message_threads')
          .select('id, title, type, last_message, last_message_at, unread_count, participants')
          .order('last_message_at', ascending: false)
          .limit(50);
      setState(() { _threads = List<Map<String, dynamic>>.from(data); _loading = false; });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Communication'),
        actions: [
          IconButton(icon: const Icon(Icons.edit_outlined), onPressed: () {}, tooltip: 'New Message'),
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
        ],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _threads.isEmpty
                    ? const Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.chat_outlined, size: 48, color: AppColors.textDisabled),
                        SizedBox(height: 12),
                        Text('No messages yet', style: TextStyle(color: AppColors.textSecondary)),
                      ]))
                    : ListView.builder(
                        itemCount: _threads.length,
                        itemBuilder: (_, i) {
                          final t = _threads[i];
                          final unread = (t['unread_count'] as int?) ?? 0;
                          final lastMsg = t['last_message'] as String?;
                          final lastAt = t['last_message_at'] as String?;
                          final type = t['type'] as String? ?? 'direct';
                          return InkWell(
                            onTap: () {},
                            child: Container(
                              color: unread > 0 ? AppColors.primary.withOpacity(0.04) : null,
                              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                              child: Row(children: [
                                CircleAvatar(
                                  backgroundColor: type == 'group' ? AppColors.accent.withOpacity(0.15) : AppColors.primary.withOpacity(0.1),
                                  child: Icon(type == 'group' ? Icons.group_outlined : Icons.person_outline, color: type == 'group' ? AppColors.accent : AppColors.primary, size: 22),
                                ),
                                const SizedBox(width: 14),
                                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Row(children: [
                                    Expanded(child: Text(t['title'] as String? ?? 'Thread', style: TextStyle(fontWeight: unread > 0 ? FontWeight.w700 : FontWeight.w500, fontSize: 15))),
                                    if (lastAt != null) Text(_fmt(lastAt), style: const TextStyle(color: AppColors.textDisabled, fontSize: 11)),
                                  ]),
                                  if (lastMsg != null) ...[
                                    const SizedBox(height: 3),
                                    Text(lastMsg, style: TextStyle(color: unread > 0 ? AppColors.textPrimary : AppColors.textSecondary, fontSize: 13), maxLines: 1, overflow: TextOverflow.ellipsis),
                                  ],
                                ])),
                                if (unread > 0) ...[
                                  const SizedBox(width: 10),
                                  Container(
                                    width: 22, height: 22,
                                    decoration: const BoxDecoration(color: AppColors.primary, shape: BoxShape.circle),
                                    child: Center(child: Text('$unread', style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700))),
                                  ),
                                ],
                              ]),
                            ),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }

  String _fmt(String iso) {
    try {
      final d = DateTime.parse(iso);
      final diff = DateTime.now().difference(d);
      if (diff.inMinutes < 60) return '${diff.inMinutes}m';
      if (diff.inHours < 24) return '${diff.inHours}h';
      return '${d.day}/${d.month}';
    } catch (_) { return iso; }
  }
}
