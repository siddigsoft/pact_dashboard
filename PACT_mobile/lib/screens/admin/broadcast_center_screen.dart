// lib/screens/admin/broadcast_center_screen.dart
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../theme/app_colors.dart';

class BroadcastCenterScreen extends StatefulWidget {
  const BroadcastCenterScreen({super.key});

  @override
  State<BroadcastCenterScreen> createState() => _BroadcastCenterScreenState();
}

class _BroadcastCenterScreenState extends State<BroadcastCenterScreen>
    with SingleTickerProviderStateMixin {
  final _supabase = Supabase.instance.client;
  late TabController _tabController;

  // Form fields
  final _titleEnCtrl = TextEditingController();
  final _titleArCtrl = TextEditingController();
  final _messageEnCtrl = TextEditingController();
  final _messageArCtrl = TextEditingController();
  final _actionUrlCtrl = TextEditingController();
  String _priority = 'normal';
  String _recipientMode = 'all'; // all | role | hub
  String? _selectedRole;
  String? _selectedHubId;

  // Data
  List<Map<String, dynamic>> _hubs = [];
  int _recipientCount = 0;
  bool _loadingCount = false;
  bool _sending = false;
  List<Map<String, dynamic>> _sentHistory = [];
  bool _loadingHistory = true;

  final List<Map<String, String>> _roles = [
    {'value': 'coordinator', 'label': 'Coordinator'},
    {'value': 'supervisor', 'label': 'Supervisor'},
    {'value': 'hubSupervisor', 'label': 'Hub Supervisor'},
    {'value': 'fom', 'label': 'FOM'},
    {'value': 'admin', 'label': 'Admin'},
    {'value': 'super_admin', 'label': 'Super Admin'},
  ];

  static const _priorityOptions = [
    {'value': 'normal', 'label': 'Normal', 'color': 0xFF3B82F6},
    {'value': 'high', 'label': 'High', 'color': 0xFFD97706},
    {'value': 'urgent', 'label': 'Urgent', 'color': 0xFFDC2626},
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadHubs();
    _loadHistory();
    _refreshCount();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _titleEnCtrl.dispose();
    _titleArCtrl.dispose();
    _messageEnCtrl.dispose();
    _messageArCtrl.dispose();
    _actionUrlCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadHubs() async {
    try {
      final data = await _supabase
          .from('hubs')
          .select('id, name')
          .order('name');
      if (mounted) {
        setState(() => _hubs = List<Map<String, dynamic>>.from(data));
      }
    } catch (_) {}
  }

  Future<void> _refreshCount() async {
    if (!mounted) return;
    setState(() => _loadingCount = true);
    try {
      var query = _supabase.from('profiles').select('id');
      if (_recipientMode == 'role' && _selectedRole != null) {
        query = query.eq('role', _selectedRole!);
      } else if (_recipientMode == 'hub' && _selectedHubId != null) {
        query = query.eq('hub_id', _selectedHubId!);
      }
      final res = await query;
      if (mounted) {
        setState(() {
          _recipientCount = (res as List).length;
          _loadingCount = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingCount = false);
    }
  }

  Future<void> _loadHistory() async {
    try {
      final data = await _supabase
          .from('notifications')
          .select('id, title_en, priority, created_at, recipient_id')
          .eq('event_type', 'broadcast')
          .order('created_at', ascending: false)
          .limit(30);
      // Deduplicate by broadcast batch (same created_at + title)
      final seen = <String>{};
      final deduped = <Map<String, dynamic>>[];
      for (final row in data) {
        final key =
            '${row['title_en']}_${(row['created_at'] as String).substring(0, 16)}';
        if (seen.add(key)) deduped.add(row);
      }
      if (mounted) {
        setState(() {
          _sentHistory = deduped;
          _loadingHistory = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loadingHistory = false);
    }
  }

  Future<void> _send() async {
    final titleEn = _titleEnCtrl.text.trim();
    final messageEn = _messageEnCtrl.text.trim();
    if (titleEn.isEmpty || messageEn.isEmpty) {
      _showSnack('Please fill in Title and Message (English).', isError: true);
      return;
    }
    setState(() => _sending = true);
    try {
      // 1. Resolve recipient IDs
      var query = _supabase
          .from('profiles')
          .select('id')
          .not('role', 'is', null);
      if (_recipientMode == 'role' && _selectedRole != null) {
        query = query.eq('role', _selectedRole!);
      } else if (_recipientMode == 'hub' && _selectedHubId != null) {
        query = query.eq('hub_id', _selectedHubId!);
      }
      final profiles = await query;
      final ids = (profiles as List).map((p) => p['id'] as String).toList();

      if (ids.isEmpty) {
        _showSnack(
          'No recipients found for the selected target.',
          isError: true,
        );
        setState(() => _sending = false);
        return;
      }

      final now = DateTime.now().toUtc().toIso8601String();
      final rows = ids
          .map(
            (uid) => {
              'recipient_id': uid,
              'user_id': uid,
              'title_en': titleEn,
              'title_ar': _titleArCtrl.text.trim().isNotEmpty
                  ? _titleArCtrl.text.trim()
                  : titleEn,
              'message_en': messageEn,
              'message_ar': _messageArCtrl.text.trim().isNotEmpty
                  ? _messageArCtrl.text.trim()
                  : messageEn,
              'priority': _priority,
              'event_type': 'broadcast',
              'entity_type': 'broadcast_batch',
              'action_url': _actionUrlCtrl.text.trim().isNotEmpty
                  ? _actionUrlCtrl.text.trim()
                  : null,
              'status': 'pending',
              'email_sent': false,
              'created_at': now,
            },
          )
          .toList();

      // 2. Insert notifications
      await _supabase.from('notifications').insert(rows);

      // 3. Trigger FCM push
      try {
        await _supabase.functions.invoke(
          'send-fcm-push',
          body: {
            'title': titleEn,
            'body': messageEn,
            'data': {
              'notification_type': 'broadcast',
              'priority': _priority,
              'action_url': _actionUrlCtrl.text.trim(),
            },
            'userIds': ids,
          },
        );
      } catch (_) {}

      if (!mounted) return;
      _titleEnCtrl.clear();
      _titleArCtrl.clear();
      _messageEnCtrl.clear();
      _messageArCtrl.clear();
      _actionUrlCtrl.clear();
      setState(() {
        _priority = 'normal';
        _recipientMode = 'all';
        _selectedRole = null;
        _selectedHubId = null;
      });
      _showSnack('Broadcast sent to ${ids.length} recipients!');
      _tabController.animateTo(1);
      _loadHistory();
    } catch (e) {
      _showSnack('Failed to send: $e', isError: true);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? Colors.red.shade700 : Colors.green.shade700,
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F7FA),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F2041),
        foregroundColor: Colors.white,
        title: Text(
          'Broadcast Center / مركز البث',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 16),
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white60,
          indicatorColor: Colors.white,
          tabs: const [
            Tab(text: 'Compose'),
            Tab(text: 'History'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [_buildCompose(), _buildHistory()],
      ),
    );
  }

  Widget _buildCompose() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _sectionCard('Message Content', [
            _field(
              _titleEnCtrl,
              'Title (English) *',
              'e.g. Urgent: Site Visit Reminder',
            ),
            const SizedBox(height: 10),
            _field(
              _titleArCtrl,
              'Title (Arabic)',
              'مثال: عاجل: تذكير بزيارة الموقع',
              rtl: true,
            ),
            const SizedBox(height: 10),
            _field(
              _messageEnCtrl,
              'Message (English) *',
              'Full message body...',
              maxLines: 4,
            ),
            const SizedBox(height: 10),
            _field(
              _messageArCtrl,
              'Message (Arabic)',
              'نص الرسالة...',
              maxLines: 4,
              rtl: true,
            ),
            const SizedBox(height: 10),
            _field(
              _actionUrlCtrl,
              'Action Link (optional)',
              'e.g. /cost-submission or https://...',
            ),
          ]),
          const SizedBox(height: 14),
          _sectionCard('Priority', [
            Wrap(
              spacing: 8,
              children: _priorityOptions.map((opt) {
                final isSelected = _priority == opt['value'];
                final color = Color(opt['color'] as int);
                return GestureDetector(
                  onTap: () =>
                      setState(() => _priority = opt['value'] as String),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 18,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: isSelected ? color : color.withValues(alpha: 0.08),
                      borderRadius: BorderRadius.circular(30),
                      border: Border.all(
                        color: color,
                        width: isSelected ? 0 : 1.5,
                      ),
                    ),
                    child: Text(
                      opt['label'] as String,
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w700,
                        color: isSelected ? Colors.white : color,
                        fontSize: 13,
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ]),
          const SizedBox(height: 14),
          _sectionCard('Recipients', [
            // Mode selector
            Row(
              children: [
                _modeChip('all', 'All Users', Icons.people),
                const SizedBox(width: 8),
                _modeChip('role', 'By Role', Icons.badge),
                const SizedBox(width: 8),
                _modeChip('hub', 'By Hub', Icons.hub),
              ],
            ),
            const SizedBox(height: 12),
            if (_recipientMode == 'role')
              _dropdownField(
                label: 'Select Role',
                value: _selectedRole,
                items: _roles
                    .map(
                      (r) => DropdownMenuItem(
                        value: r['value'],
                        child: Text(r['label']!),
                      ),
                    )
                    .toList(),
                onChanged: (v) {
                  setState(() => _selectedRole = v);
                  _refreshCount();
                },
              ),
            if (_recipientMode == 'hub')
              _dropdownField(
                label: 'Select Hub',
                value: _selectedHubId,
                items: _hubs
                    .map(
                      (h) => DropdownMenuItem(
                        value: h['id'] as String,
                        child: Text(h['name'] as String),
                      ),
                    )
                    .toList(),
                onChanged: (v) {
                  setState(() => _selectedHubId = v);
                  _refreshCount();
                },
              ),
            const SizedBox(height: 10),
            // Recipient count
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF0F2041).withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.people_outline,
                    size: 16,
                    color: Color(0xFF0F2041),
                  ),
                  const SizedBox(width: 6),
                  Text(
                    _loadingCount
                        ? 'Counting recipients...'
                        : 'Will reach $_recipientCount recipient${_recipientCount != 1 ? 's' : ''}',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: const Color(0xFF0F2041),
                    ),
                  ),
                ],
              ),
            ),
          ]),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: _priority == 'urgent'
                    ? const Color(0xFFDC2626)
                    : _priority == 'high'
                    ? const Color(0xFFD97706)
                    : const Color(0xFF0F2041),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              onPressed: _sending ? null : _send,
              icon: _sending
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Icon(Icons.send_rounded),
              label: Text(
                _sending ? 'Sending...' : 'Send Broadcast / إرسال البث',
                style: GoogleFonts.poppins(
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildHistory() {
    if (_loadingHistory) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_sentHistory.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.campaign_outlined, size: 56, color: Colors.grey[300]),
            const SizedBox(height: 12),
            Text(
              'No broadcasts sent yet',
              style: GoogleFonts.poppins(color: Colors.grey[500]),
            ),
          ],
        ),
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: _sentHistory.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final item = _sentHistory[i];
        final priority = item['priority'] as String? ?? 'normal';
        final priorityColor = priority == 'urgent'
            ? const Color(0xFFDC2626)
            : priority == 'high'
            ? const Color(0xFFD97706)
            : const Color(0xFF3B82F6);
        final createdAt = item['created_at'] != null
            ? DateTime.tryParse(item['created_at'] as String)
            : null;
        final timeStr = createdAt != null
            ? createdAt.toLocal().toString().substring(0, 16)
            : '';
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border(left: BorderSide(color: priorityColor, width: 4)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 6,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item['title_en'] as String? ?? 'Untitled',
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (timeStr.isNotEmpty)
                      Text(
                        timeStr,
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          color: Colors.grey[500],
                        ),
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: priorityColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  priority.toUpperCase(),
                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: priorityColor,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _sectionCard(String title, List<Widget> children) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w700,
              fontSize: 13,
              color: const Color(0xFF0F2041),
            ),
          ),
          const SizedBox(height: 12),
          ...children,
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController ctrl,
    String label,
    String hint, {
    int maxLines = 1,
    bool rtl = false,
  }) {
    return TextField(
      controller: ctrl,
      maxLines: maxLines,
      textDirection: rtl ? TextDirection.rtl : TextDirection.ltr,
      style: GoogleFonts.poppins(fontSize: 13),
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        labelStyle: GoogleFonts.poppins(fontSize: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
      ),
    );
  }

  Widget _modeChip(String value, String label, IconData icon) {
    final isSelected = _recipientMode == value;
    return GestureDetector(
      onTap: () {
        setState(() {
          _recipientMode = value;
          _selectedRole = null;
          _selectedHubId = null;
        });
        _refreshCount();
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? const Color(0xFF0F2041) : Colors.grey[100],
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 14,
              color: isSelected ? Colors.white : Colors.grey[600],
            ),
            const SizedBox(width: 4),
            Text(
              label,
              style: GoogleFonts.poppins(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: isSelected ? Colors.white : Colors.grey[700],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dropdownField<T>({
    required String label,
    required T? value,
    required List<DropdownMenuItem<T>> items,
    required ValueChanged<T?> onChanged,
  }) {
    return DropdownButtonFormField<T>(
      initialValue: value,
      items: items,
      onChanged: onChanged,
      style: GoogleFonts.poppins(fontSize: 13, color: Colors.black87),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: GoogleFonts.poppins(fontSize: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
      ),
    );
  }
}
