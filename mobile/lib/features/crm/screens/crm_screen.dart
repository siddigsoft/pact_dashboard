import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/status_badge.dart';
import '../../../shared/widgets/offline_banner.dart';

class CrmScreen extends ConsumerStatefulWidget {
  const CrmScreen({super.key});
  @override
  ConsumerState<CrmScreen> createState() => _CrmScreenState();
}

class _CrmScreenState extends ConsumerState<CrmScreen> with SingleTickerProviderStateMixin {
  late TabController _tabs;
  List<Map<String, dynamic>> _partners = [];
  List<Map<String, dynamic>> _contacts = [];
  List<Map<String, dynamic>> _engagements = [];
  bool _loading = true;

  @override
  void initState() { super.initState(); _tabs = TabController(length: 3, vsync: this); _load(); }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _load() async {
    try {
      final client = Supabase.instance.client;
      final results = await Future.wait([
        client.from('crm_partners').select('id, name, type, status, country, city').order('name').limit(50),
        client.from('crm_contacts').select('id, name, email, phone, role, partner_id').order('name').limit(50),
        client.from('crm_engagements').select('id, title, type, status, partner_id, contact_id, date').order('date', ascending: false).limit(30),
      ]);
      setState(() {
        _partners = List<Map<String, dynamic>>.from(results[0]);
        _contacts = List<Map<String, dynamic>>.from(results[1]);
        _engagements = List<Map<String, dynamic>>.from(results[2]);
        _loading = false;
      });
    } catch (_) { setState(() => _loading = false); }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('CRM'),
        bottom: TabBar(
          controller: _tabs,
          labelColor: Colors.white,
          indicatorColor: Colors.white,
          tabs: [
            Tab(text: 'Partners (${_partners.length})'),
            Tab(text: 'Contacts (${_contacts.length})'),
            Tab(text: 'Engagements'),
          ],
        ),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: _load)],
      ),
      body: Column(
        children: [
          const OfflineBanner(),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : TabBarView(
                    controller: _tabs,
                    children: [
                      _PartnersTab(partners: _partners),
                      _ContactsTab(contacts: _contacts),
                      _EngagementsTab(engagements: _engagements),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

class _PartnersTab extends StatelessWidget {
  final List<Map<String, dynamic>> partners;
  const _PartnersTab({required this.partners});
  @override
  Widget build(BuildContext context) {
    if (partners.isEmpty) return const Center(child: Text('No partners', style: TextStyle(color: AppColors.textSecondary)));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: partners.length,
      itemBuilder: (_, i) {
        final p = partners[i];
        final status = p['status'] as String? ?? 'active';
        final type = p['type'] as String? ?? '';
        return Card(
          margin: const EdgeInsets.only(bottom: 10),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: AppColors.primary.withOpacity(0.1),
              child: Text((p['name'] as String? ?? 'P')[0].toUpperCase(), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700)),
            ),
            title: Text(p['name'] as String? ?? 'Partner', style: const TextStyle(fontWeight: FontWeight.w600)),
            subtitle: Text('$type • ${p['city'] ?? p['country'] ?? ''}', style: const TextStyle(fontSize: 12)),
            trailing: StatusBadge(status: status),
          ),
        );
      },
    );
  }
}

class _ContactsTab extends StatelessWidget {
  final List<Map<String, dynamic>> contacts;
  const _ContactsTab({required this.contacts});
  @override
  Widget build(BuildContext context) {
    if (contacts.isEmpty) return const Center(child: Text('No contacts', style: TextStyle(color: AppColors.textSecondary)));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: contacts.length,
      itemBuilder: (_, i) {
        final c = contacts[i];
        final name = c['name'] as String? ?? 'Contact';
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: CircleAvatar(
              backgroundColor: AppColors.accent.withOpacity(0.1),
              child: Text(name[0].toUpperCase(), style: const TextStyle(color: AppColors.accent, fontWeight: FontWeight.w700)),
            ),
            title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (c['role'] != null) Text(c['role'] as String, style: const TextStyle(fontSize: 12)),
              if (c['email'] != null) Text(c['email'] as String, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
            ]),
            trailing: c['phone'] != null ? IconButton(icon: const Icon(Icons.phone_outlined, size: 20, color: AppColors.success), onPressed: () {}) : null,
          ),
        );
      },
    );
  }
}

class _EngagementsTab extends StatelessWidget {
  final List<Map<String, dynamic>> engagements;
  const _EngagementsTab({required this.engagements});
  @override
  Widget build(BuildContext context) {
    if (engagements.isEmpty) return const Center(child: Text('No engagements', style: TextStyle(color: AppColors.textSecondary)));
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: engagements.length,
      itemBuilder: (_, i) {
        final e = engagements[i];
        final status = e['status'] as String? ?? 'open';
        final type = e['type'] as String? ?? '';
        final date = e['date'] as String?;
        return Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: const CircleAvatar(backgroundColor: AppColors.fomColor, child: Icon(Icons.handshake_outlined, color: Colors.white, size: 18)),
            title: Text(e['title'] as String? ?? 'Engagement', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            subtitle: Text('$type${date != null ? ' • $_fmt(date)' : ''}', style: const TextStyle(fontSize: 12)),
            trailing: StatusBadge(status: status),
          ),
        );
      },
    );
  }

  static String _fmt(String iso) {
    try { final d = DateTime.parse(iso); return '${d.day}/${d.month}/${d.year}'; } catch (_) { return iso; }
  }
}
