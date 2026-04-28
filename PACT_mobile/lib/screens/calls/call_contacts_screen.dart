import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../../services/agora_call_service.dart';
import '../../services/contact_visibility_service.dart';
import '../../services/user_preferences_service.dart';
import '../../services/last_call_service.dart';
import '../../widgets/enhanced_contact_tile.dart';
import '../agora_call_screen.dart';

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
  Set<String> _favoriteIds = {};
  Map<String, LastCallInfo?> _lastCallInfoMap = {};
  dynamic _presenceChannel; // Save channel reference for cleanup

  @override
  void initState() {
    super.initState();
    _loadContacts();
    _setupOnlinePresence();
    _loadFavorites();
    _loadLastCallInfo();
  }

  Future<void> _loadContacts() async {
    setState(() => _isLoading = true);

    try {
      // Use visibility service to get filtered contacts based on role
      final visibilityService = ContactVisibilityService();
      final visibleContacts = await visibilityService.getVisibleContacts();

      setState(() {
        _contacts = visibleContacts;
        _filteredContacts = _contacts;
        _isLoading = false;
      });

      debugPrint(
        '[CallContactsScreen] Loaded ${_contacts.length} visible contacts',
      );
    } catch (e) {
      debugPrint('Error loading contacts: $e');
      setState(() => _isLoading = false);
    }
  }

  void _setupOnlinePresence() {
    _presenceChannel = Supabase.instance.client.channel('user-call-presence');

    _presenceChannel.onPresenceSync((payload) {
      final presenceState = _presenceChannel.presenceState();
      final onlineIds = <String>{};

      // presenceState() returns List<SinglePresenceState>.
      // Each SinglePresenceState has .presences → List<Presence>,
      // and each Presence has .payload → Map<String, dynamic>.
      for (final singleState in presenceState) {
        try {
          for (final presence in singleState.presences) {
            final data = presence.payload;
            final userId =
                data['user_id'] as String? ?? data['userId'] as String?;
            final online =
                data['is_online'] as bool? ?? data['online'] as bool? ?? false;

            if (userId != null && online) {
              onlineIds.add(userId);
            }
          }
        } catch (e) {
          debugPrint('[CallContactsScreen] Error processing presence: $e');
        }
      }

      // Only update state if widget is still mounted
      if (mounted) {
        setState(() {
          _onlineUserIds = onlineIds;
        });
      }
    });

    _presenceChannel.subscribe();
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

  Future<void> _initiateCall(
    Map<String, dynamic> contact, {
    bool isVideoCall = false,
  }) async {
    final agoraService = AgoraCallService();

    if (!agoraService.isReady) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Call service not ready. Please try again in a moment.',
            ),
            backgroundColor: Colors.orange,
          ),
        );
      }
      return;
    }

    if (agoraService.isInCall) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('You are already in a call'),
            backgroundColor: Colors.orange,
          ),
        );
      }
      return;
    }

    HapticFeedback.mediumImpact();

    final targetUserId = contact['id'] as String;
    final targetUserName = contact['full_name'] as String? ?? 'Unknown';
    final targetUserAvatar = contact['avatar_url'] as String?;

    debugPrint(
      '[CallContactsScreen] Starting ${isVideoCall ? "video" : "audio"} call to $targetUserName ($targetUserId)',
    );

    final result = await agoraService.startCall(
      remoteUserId: targetUserId,
      remoteUserName: targetUserName,
      remoteUserAvatar: targetUserAvatar,
      audioOnly: !isVideoCall,
    );

    if (result.success && result.channelName != null && mounted) {
      debugPrint(
        '[CallContactsScreen] Call started, navigating to AgoraCallScreen',
      );
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => AgoraCallScreen(
            channelName: result.channelName!,
            remoteUserId: targetUserId,
            remoteUserName: targetUserName,
            remoteUserAvatar: targetUserAvatar,
            isAudioOnly: !isVideoCall,
            isOutgoing: true,
          ),
        ),
      );
    } else if (!result.success && mounted) {
      debugPrint('[CallContactsScreen] Call failed: ${result.error}');
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            result.error ?? 'Failed to start call. Please try again.',
          ),
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

  Future<void> _loadFavorites() async {
    try {
      final favorites = await UserPreferencesService.getFavoriteContacts();
      if (mounted) {
        setState(() {
          _favoriteIds = favorites.toSet();
        });
      }
    } catch (e) {
      debugPrint('Error loading favorites: $e');
    }
  }

  Future<void> _loadLastCallInfo() async {
    try {
      final infoMap = <String, LastCallInfo?>{};
      for (final contact in _contacts) {
        final lastCall = await LastCallService.getLastCall(contact['id']);
        infoMap[contact['id']] = lastCall;
      }
      if (mounted) {
        setState(() {
          _lastCallInfoMap = infoMap;
        });
      }
    } catch (e) {
      debugPrint('Error loading last call info: $e');
    }
  }

  Future<void> _toggleFavorite(String contactId) async {
    try {
      if (_favoriteIds.contains(contactId)) {
        await UserPreferencesService.removeFavorite(contactId);
        setState(() => _favoriteIds.remove(contactId));
      } else {
        await UserPreferencesService.addFavorite(contactId);
        setState(() => _favoriteIds.add(contactId));
      }
    } catch (e) {
      debugPrint('Error toggling favorite: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    // Unsubscribe from presence channel to avoid memory leaks
    if (_presenceChannel != null) {
      try {
        _presenceChannel.unsubscribe();
      } catch (e) {
        debugPrint(
          '[CallContactsScreen] Error unsubscribing from presence: $e',
        );
      }
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isArabic = Localizations.localeOf(context).languageCode == 'ar';

    return Scaffold(
      backgroundColor: Colors.white,
      body: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            color: Theme.of(context).primaryColor.withOpacity(0.05),
            child: TextField(
              controller: _searchController,
              onChanged: _filterContacts,
              decoration: InputDecoration(
                hintText: isArabic
                    ? 'البحث عن جهات الاتصال...'
                    : 'Search contacts...',
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
                          isArabic
                              ? 'لم يتم العثور على جهات اتصال'
                              : 'No contacts found',
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
                        final lastCallInfo = _lastCallInfoMap[contact['id']];

                        return EnhancedContactTile(
                          id: contact['id'],
                          name: contact['full_name'] ?? 'Unknown',
                          email: contact['email'] ?? '',
                          avatarUrl: contact['avatar_url'],
                          role: contact['role'] ?? '',
                          isOnline: isOnline,
                          initials: _getInitials(contact['full_name']),
                          onAudioCall: () =>
                              _initiateCall(contact, isVideoCall: false),
                          onVideoCall: () =>
                              _initiateCall(contact, isVideoCall: true),
                          isArabic: isArabic,
                          lastCallTime: lastCallInfo?.callTime,
                          lastCallType: lastCallInfo?.callType,
                          isFavorite: _favoriteIds.contains(contact['id']),
                          onToggleFavorite: () =>
                              _toggleFavorite(contact['id']),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
