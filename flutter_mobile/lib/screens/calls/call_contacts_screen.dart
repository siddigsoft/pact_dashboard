import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../providers/call_provider.dart';
import 'active_call_screen.dart';

class CallContactsScreen extends ConsumerStatefulWidget {
  const CallContactsScreen({super.key});

  @override
  ConsumerState<CallContactsScreen> createState() => _CallContactsScreenState();
}

class _CallContactsScreenState extends ConsumerState<CallContactsScreen> {
  final _searchController = TextEditingController();
  List<Map<String, dynamic>> _contacts = [];
  List<Map<String, dynamic>> _filteredContacts = [];
  bool _isLoading = true;
  Set<String> _onlineUserIds = {};

  @override
  void initState() {
    super.initState();
    _loadContacts();
    _setupOnlinePresence();
  }

  Future<void> _loadContacts() async {
    setState(() => _isLoading = true);
    
    try {
      final currentUserId = Supabase.instance.client.auth.currentUser?.id;
      
      final response = await Supabase.instance.client
          .from('profiles')
          .select('id, full_name, email, avatar_url, role')
          .neq('id', currentUserId ?? '')
          .order('full_name');
      
      setState(() {
        _contacts = List<Map<String, dynamic>>.from(response);
        _filteredContacts = _contacts;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint('Error loading contacts: $e');
      setState(() => _isLoading = false);
    }
  }

  void _setupOnlinePresence() {
    final channel = Supabase.instance.client.channel('user-call-presence');
    
    channel.onPresenceSync((payload) {
      final presenceState = channel.presenceState();
      final onlineIds = <String>{};
      
      for (final key in presenceState.keys) {
        final presences = presenceState[key] as List<dynamic>?;
        if (presences != null) {
          for (final p in presences) {
            final userId = (p as Map<String, dynamic>)['userId'] as String?;
            final online = p['online'] as bool? ?? false;
            if (userId != null && online) {
              onlineIds.add(userId);
            }
          }
        }
      }
      
      setState(() {
        _onlineUserIds = onlineIds;
      });
    });

    channel.subscribe();
  }

  void _filterContacts(String query) {
    setState(() {
      if (query.isEmpty) {
        _filteredContacts = _contacts;
      } else {
        _filteredContacts = _contacts.where((contact) {
          final name = (contact['full_name'] ?? '').toString().toLowerCase();
          final email = (contact['email'] ?? '').toString().toLowerCase();
          return name.contains(query.toLowerCase()) || 
                 email.contains(query.toLowerCase());
        }).toList();
      }
    });
  }

  Future<void> _initiateCall(Map<String, dynamic> contact, {bool isVideoCall = false}) async {
    final callNotifier = ref.read(callStateProvider.notifier);
    
    final success = await callNotifier.initiateCall(
      targetUserId: contact['id'],
      targetUserName: contact['full_name'] ?? 'Unknown',
      targetUserAvatar: contact['avatar_url'],
      isAudioOnly: !isVideoCall,
    );

    if (success && mounted) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ActiveCallScreen(
            participantId: contact['id'],
            participantName: contact['full_name'] ?? 'Unknown',
            participantAvatar: contact['avatar_url'],
            isVideoCall: isVideoCall,
          ),
          fullscreenDialog: true,
        ),
      );
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Failed to start call. Please try again.'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  String _getInitials(String? name) {
    if (name == null || name.isEmpty) return '?';
    final parts = name.split(' ');
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return name[0].toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';
    
    return Scaffold(
      appBar: AppBar(
        title: Text(isArabic ? 'المكالمات' : 'Calls'),
        elevation: 0,
      ),
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            color: Theme.of(context).primaryColor.withOpacity(0.05),
            child: TextField(
              controller: _searchController,
              onChanged: _filterContacts,
              decoration: InputDecoration(
                hintText: isArabic ? 'البحث عن جهات الاتصال...' : 'Search contacts...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: Theme.of(context).cardColor,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _filteredContacts.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.people_outline,
                              size: 64,
                              color: Colors.grey[400],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              isArabic ? 'لم يتم العثور على جهات اتصال' : 'No contacts found',
                              style: TextStyle(
                                fontSize: 16,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      )
                    : RefreshIndicator(
                        onRefresh: _loadContacts,
                        child: ListView.builder(
                          itemCount: _filteredContacts.length,
                          itemBuilder: (context, index) {
                            final contact = _filteredContacts[index];
                            final isOnline = _onlineUserIds.contains(contact['id']);
                            
                            return _ContactTile(
                              name: contact['full_name'] ?? 'Unknown',
                              email: contact['email'] ?? '',
                              avatarUrl: contact['avatar_url'],
                              role: contact['role'] ?? '',
                              isOnline: isOnline,
                              initials: _getInitials(contact['full_name']),
                              onAudioCall: () => _initiateCall(contact, isVideoCall: false),
                              onVideoCall: () => _initiateCall(contact, isVideoCall: true),
                              isArabic: isArabic,
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }
}

class _ContactTile extends StatelessWidget {
  final String name;
  final String email;
  final String? avatarUrl;
  final String role;
  final bool isOnline;
  final String initials;
  final VoidCallback onAudioCall;
  final VoidCallback onVideoCall;
  final bool isArabic;

  const _ContactTile({
    required this.name,
    required this.email,
    this.avatarUrl,
    required this.role,
    required this.isOnline,
    required this.initials,
    required this.onAudioCall,
    required this.onVideoCall,
    required this.isArabic,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      child: ListTile(
        leading: Stack(
          children: [
            CircleAvatar(
              radius: 24,
              backgroundImage: avatarUrl != null ? NetworkImage(avatarUrl!) : null,
              backgroundColor: Theme.of(context).primaryColor.withOpacity(0.1),
              child: avatarUrl == null
                  ? Text(
                      initials,
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).primaryColor,
                      ),
                    )
                  : null,
            ),
            if (isOnline)
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  width: 14,
                  height: 14,
                  decoration: BoxDecoration(
                    color: Colors.green,
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 2),
                  ),
                ),
              ),
          ],
        ),
        title: Text(
          name,
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (role.isNotEmpty)
              Text(
                role,
                style: TextStyle(
                  fontSize: 12,
                  color: Theme.of(context).primaryColor,
                ),
              ),
            Text(
              isOnline 
                  ? (isArabic ? 'متصل الآن' : 'Online')
                  : (isArabic ? 'غير متصل' : 'Offline'),
              style: TextStyle(
                fontSize: 12,
                color: isOnline ? Colors.green : Colors.grey,
              ),
            ),
          ],
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: Icon(
                Icons.phone,
                color: isOnline ? Colors.green : Colors.grey,
              ),
              onPressed: isOnline ? onAudioCall : null,
              tooltip: isArabic ? 'مكالمة صوتية' : 'Voice Call',
            ),
            IconButton(
              icon: Icon(
                Icons.videocam,
                color: isOnline ? Colors.blue : Colors.grey,
              ),
              onPressed: isOnline ? onVideoCall : null,
              tooltip: isArabic ? 'مكالمة فيديو' : 'Video Call',
            ),
          ],
        ),
      ),
    );
  }
}
