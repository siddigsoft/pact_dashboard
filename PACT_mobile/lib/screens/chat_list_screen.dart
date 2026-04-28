import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/chat.dart';
import '../models/chat_participant.dart';
import '../services/chat_service.dart';
import '../services/user_preferences_service.dart';
import '../theme/app_colors.dart';
import '../widgets/custom_drawer_menu.dart';
import '../widgets/cached_notifications_view.dart';
import '../widgets/enhanced_chat_tile.dart';
import 'chat_screen.dart';
import 'user_selection_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  final ChatService _chatService = ChatService();
  final GlobalKey<ScaffoldState> _scaffoldKey = GlobalKey<ScaffoldState>();

  List<String> _pinnedChats = [];
  List<String> _archivedChats = [];
  Set<String> _muteChats = {};
  bool _showingArchived = false;
  bool _showingCachedNotifications = false;

  List<Chat> _chats = [];
  bool _isLoading = true;
  Map<String, int> _unreadCounts = {};
  Map<String, Map<String, dynamic>> _latestMessageMeta = {};
  // ignore: unused_field
  Map<String, bool> _notificationSettings = {};
  RealtimeChannel? _chatListChannel;
  Timer? _refreshDebounceTimer;

  @override
  void initState() {
    super.initState();
    _loadChats();
    _subscribeToChatListUpdates();
    _loadMutedChats();
  }

  @override
  void dispose() {
    _refreshDebounceTimer?.cancel();
    _chatListChannel?.unsubscribe();
    super.dispose();
  }

  bool get _isArabic => Localizations.localeOf(context).languageCode == 'ar';

  String _fallbackLabel(String id) {
    final shortId = id.length > 8 ? id.substring(0, 8) : id;
    return 'User $shortId';
  }

  Future<void> _loadChats({bool showLoading = true}) async {
    if (!mounted) return;

    if (showLoading) {
      setState(() => _isLoading = true);
    }

    final pinned = await _chatService.getPinnedChats();
    final archived = await _chatService.getArchivedChats();
    if (mounted) {
      _pinnedChats = pinned;
      _archivedChats = archived;
    }

    final cachedChats = await _chatService.getCachedUserChats();
    cachedChats.sort((a, b) {
      final aPinned = _pinnedChats.contains(a.id);
      final bPinned = _pinnedChats.contains(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return b.updatedAt.compareTo(a.updatedAt);
    });
    if (cachedChats.isNotEmpty && mounted) {
      setState(() {
        _chats = cachedChats;
        _unreadCounts = {
          for (final chat in cachedChats) chat.id: _unreadCounts[chat.id] ?? 0,
        };
        _isLoading = false;
      });
    }

    try {
      final chats = await _chatService.getUserChats();
      chats.sort((a, b) {
        final aPinned = _pinnedChats.contains(a.id);
        final bPinned = _pinnedChats.contains(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return b.updatedAt.compareTo(a.updatedAt);
      });

      final unreadFuture = Future.wait(
        chats.map((chat) async {
          final count = await _chatService.getUnreadCount(chat.id);
          return MapEntry(chat.id, count);
        }),
      );
      final previewFuture = _chatService.getLatestMessageMeta(
        chats.map((chat) => chat.id).toList(),
      );

      final results = await Future.wait<dynamic>([unreadFuture, previewFuture]);
      final unreadEntries = results[0] as List<MapEntry<String, int>>;
      final previewMap = results[1] as Map<String, Map<String, dynamic>>;
      final unreadCounts = Map<String, int>.fromEntries(unreadEntries);

      if (!mounted) return;
      setState(() {
        _chats = chats;
        _unreadCounts = unreadCounts;
        _latestMessageMeta = previewMap;
        _isLoading = false;
      });

      // Load notification settings for each chat
      _loadNotificationSettings();
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      if (_chats.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Unable to load chats right now.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  void _subscribeToChatListUpdates() {
    final currentUserId = _chatService.getCurrentUserId();
    if (currentUserId == null) {
      return;
    }

    _chatListChannel = Supabase.instance.client
        .channel('chat_list_updates:$currentUserId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'chat_messages',
          callback: (_) => _scheduleRefresh(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'chats',
          callback: (_) => _scheduleRefresh(),
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'chat_participants',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'user_id',
            value: currentUserId,
          ),
          callback: (_) => _scheduleRefresh(),
        )
        .subscribe();
  }

  void _scheduleRefresh() {
    if (!mounted) return;

    _refreshDebounceTimer?.cancel();
    _refreshDebounceTimer = Timer(const Duration(milliseconds: 500), () {
      if (mounted) {
        _loadChats(showLoading: false);
      }
    });
  }

  Future<void> _loadMutedChats() async {
    try {
      final muteList = await UserPreferencesService.getMutedChats();
      if (mounted) {
        setState(() {
          _muteChats = muteList.toSet();
        });
      }
    } catch (e) {
      debugPrint('Error loading muted chats: $e');
    }
  }

  Future<void> _loadNotificationSettings() async {
    try {
      final settings = <String, bool>{};
      for (final chat in _chats) {
        final isMuted = await UserPreferencesService.isChatMuted(chat.id);
        settings[chat.id] = !isMuted;
      }
      if (mounted) {
        setState(() {
          _notificationSettings = settings;
        });
      }
    } catch (e) {
      debugPrint('Error loading notification settings: $e');
    }
  }

  Future<void> _toggleMuteChat(String chatId) async {
    try {
      if (_muteChats.contains(chatId)) {
        await UserPreferencesService.unmuteChat(chatId);
        setState(() => _muteChats.remove(chatId));
      } else {
        await UserPreferencesService.muteChat(chatId);
        setState(() => _muteChats.add(chatId));
      }
    } catch (e) {
      debugPrint('Error toggling mute: $e');
    }
  }

  /// Handle pull-to-refresh gesture
  Future<void> _refreshChats() async {
    try {
      HapticFeedback.lightImpact();
      await _loadChats(showLoading: false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Chats refreshed'),
            duration: Duration(milliseconds: 1500),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (e) {
      debugPrint('[ChatListScreen] Error refreshing chats: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to refresh: $e'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 2),
          ),
        );
      }
    }
  }

  String _formatTimestamp(DateTime value) {
    final now = DateTime.now();
    final local = value.toLocal();

    final isSameDay =
        local.year == now.year &&
        local.month == now.month &&
        local.day == now.day;
    if (isSameDay) {
      final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
      final minute = local.minute.toString().padLeft(2, '0');
      final period = local.hour >= 12 ? 'PM' : 'AM';
      return '$hour:$minute $period';
    }

    final yesterday = now.subtract(const Duration(days: 1));
    final isYesterday =
        local.year == yesterday.year &&
        local.month == yesterday.month &&
        local.day == yesterday.day;
    if (isYesterday) {
      return 'Yesterday';
    }

    return '${local.day}/${local.month}/${local.year}';
  }

  String _contentTypeLabel(String? contentType) {
    switch ((contentType ?? 'text').toLowerCase()) {
      case 'image':
        return '📷 Photo';
      case 'audio':
        return '🎤 Voice message';
      case 'video':
        return '🎬 Video';
      case 'file':
      case 'document':
        return '📎 Attachment';
      default:
        return '';
    }
  }

  String _buildMessagePreview(String chatId, String? currentUserId) {
    final meta = _latestMessageMeta[chatId];
    if (meta == null || meta.isEmpty) {
      return '';
    }

    final senderId = meta['sender_id'] as String?;
    final contentType = meta['content_type'] as String?;
    final content = (meta['content'] as String? ?? '').trim();

    final typeLabel = _contentTypeLabel(contentType);
    String preview = typeLabel.isNotEmpty ? typeLabel : content;
    if (preview.isEmpty) {
      preview = 'New message';
    }

    if (preview.length > 34) {
      preview = '${preview.substring(0, 34)}...';
    }

    if (senderId != null &&
        currentUserId != null &&
        senderId == currentUserId) {
      preview = 'You: $preview';
    }

    return preview;
  }

  DateTime _previewTimeOrUpdatedAt(Chat chat) {
    final meta = _latestMessageMeta[chat.id];
    final createdAt = meta?['created_at'] as String?;
    if (createdAt == null || createdAt.isEmpty) {
      return chat.updatedAt;
    }
    return DateTime.tryParse(createdAt) ?? chat.updatedAt;
  }

  Future<void> _startNewChat() async {
    final selectedUser = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (context) => const UserSelectionScreen()),
    );

    if (selectedUser != null && mounted) {
      final chat = await _chatService.createPrivateChat(selectedUser['id']);
      if (chat != null) {
        await _loadChats(showLoading: false);
        if (mounted) {
          Navigator.push(
            context,
            MaterialPageRoute(builder: (context) => ChatScreen(chat: chat)),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      key: _scaffoldKey,
      backgroundColor: Colors.white,
      drawer: CustomDrawerMenu(
        currentUser: Supabase.instance.client.auth.currentUser,
        onClose: () => _scaffoldKey.currentState?.closeDrawer(),
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFFFF9800)),
            )
          : _showingCachedNotifications
          ? CachedNotificationsView(
              onClose: () {
                setState(() {
                  _showingCachedNotifications = false;
                });
              },
              onMessageTap: () {
                setState(() {
                  _showingCachedNotifications = false;
                });
                // Navigation will be handled by the widget
              },
              onCallTap: () {
                setState(() {
                  _showingCachedNotifications = false;
                });
                // Navigation will be handled by the widget
              },
            )
          : SafeArea(
              top: false,
              child: RefreshIndicator(
                onRefresh: _refreshChats,
                color: const Color(0xFF075E54),
                backgroundColor: Colors.white,
                child: _chats.isEmpty ? _buildEmptyState() : _buildChatList(),
              ),
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _startNewChat,
        backgroundColor: AppColors.primaryBlue,
        child: const Icon(Icons.message, color: Colors.white),
      ).animate().scale(delay: 500.ms, duration: 400.ms),
    );
  }

  Widget _buildChatList() {
    final displayChats = _chats.where((c) {
      final isArchived = _archivedChats.contains(c.id);
      return _showingArchived ? isArchived : !isArchived;
    }).toList();

    return Column(
      children: [
        if (!_showingArchived && _archivedChats.isNotEmpty)
          InkWell(
            onTap: () {
              setState(() {
                _showingArchived = true;
              });
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: Colors.grey.shade200, width: 1),
                ),
              ),
              child: Row(
                children: [
                  const Icon(
                    Icons.archive_outlined,
                    color: Colors.grey,
                    size: 24,
                  ),
                  const SizedBox(width: 16),
                  const Expanded(
                    child: Text(
                      'Archived',
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                        color: Colors.black87,
                      ),
                    ),
                  ),
                  Text(
                    _archivedChats.length.toString(),
                    style: const TextStyle(
                      fontSize: 14,
                      color: Color(0xFF075E54),
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ),
        if (_showingArchived)
          InkWell(
            onTap: () {
              setState(() {
                _showingArchived = false;
              });
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                border: Border(
                  bottom: BorderSide(color: Colors.grey.shade200, width: 1),
                ),
              ),
              child: Row(
                children: const [
                  Icon(Icons.arrow_back, color: Colors.grey, size: 24),
                  SizedBox(width: 16),
                  Text(
                    'Back to Chats',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                ],
              ),
            ),
          ),
        Expanded(
          child: ListView.builder(
            padding: EdgeInsets.zero,
            itemCount: displayChats.length,
            itemBuilder: (context, index) {
              final chat = displayChats[index];
              final unreadCount = _unreadCounts[chat.id] ?? 0;
              final participants = chat.participants;
              final currentUserId = _chatService.getCurrentUserId();
              final previewTime = _previewTimeOrUpdatedAt(chat);
              final formattedTime = _formatTimestamp(previewTime);
              final messagePreview = _buildMessagePreview(
                chat.id,
                currentUserId,
              );

              String chatTitle = chat.name;
              String chatSubtitle = formattedTime;

              if (chat.chatType == 'private') {
                String? displayName = chat.otherParticipantName;
                String? counterpartId = chat.otherParticipantId;

                if ((displayName == null || displayName.isEmpty) &&
                    counterpartId != null) {
                  ChatParticipant? participant;
                  for (final item in participants) {
                    if (item.userId == counterpartId) {
                      participant = item;
                      break;
                    }
                  }
                  displayName = participant?.userName;
                }

                if ((displayName == null || displayName.isEmpty) &&
                    counterpartId == null &&
                    participants.isNotEmpty) {
                  ChatParticipant? other;
                  for (final participant in participants) {
                    if (participant.userId != currentUserId) {
                      other = participant;
                      break;
                    }
                  }
                  other ??= participants.first;
                  counterpartId = other.userId;
                  displayName = other.userName;
                }

                if ((displayName == null || displayName.isEmpty) &&
                    chat.createdByName != null &&
                    chat.createdByName!.isNotEmpty &&
                    chat.createdBy != currentUserId) {
                  displayName = chat.createdByName;
                  counterpartId ??= chat.createdBy;
                }

                if ((displayName == null || displayName.isEmpty) &&
                    counterpartId != null) {
                  displayName = _fallbackLabel(counterpartId);
                }

                chatTitle = displayName ?? _fallbackLabel(chat.id);
                chatSubtitle = messagePreview.isNotEmpty
                    ? '$messagePreview • $formattedTime'
                    : 'Private chat • $formattedTime';
              } else if (chat.chatType == 'group') {
                chatSubtitle = messagePreview.isNotEmpty
                    ? '$messagePreview • $formattedTime'
                    : '${participants.length} members • $formattedTime';

                if (chatTitle.isEmpty &&
                    chat.createdByName != null &&
                    chat.createdByName!.isNotEmpty) {
                  chatTitle = chat.createdByName!;
                }
              } else if (messagePreview.isNotEmpty) {
                chatSubtitle = '$messagePreview • $formattedTime';
              }

              if (chatTitle.isEmpty) {
                chatTitle = _fallbackLabel(chat.id);
              }

              final isPinned = _pinnedChats.contains(chat.id);
              final isArchived = _archivedChats.contains(chat.id);

              return Dismissible(
                key: Key('chat_${chat.id}'),
                direction: DismissDirection.horizontal,
                background: Container(
                  color: isArchived ? Colors.blue : Colors.grey.shade700,
                  alignment: Alignment.centerLeft,
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    children: [
                      Icon(
                        isArchived ? Icons.unarchive : Icons.archive,
                        color: Colors.white,
                        size: 28,
                      ),
                      const SizedBox(width: 12),
                      Text(
                        isArchived ? 'Unarchive' : 'Archive',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                secondaryBackground: Container(
                  color: isPinned ? Colors.blueGrey : const Color(0xFF25D366),
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      Text(
                        isPinned ? 'Unpin' : 'Pin',
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Icon(
                        isPinned ? Icons.push_pin_outlined : Icons.push_pin,
                        color: Colors.white,
                        size: 28,
                      ),
                    ],
                  ),
                ),
                confirmDismiss: (direction) async {
                  if (direction == DismissDirection.startToEnd) {
                    await _chatService.toggleArchiveChat(chat.id);
                    // We wait briefly to show the swipe
                    Future.delayed(const Duration(milliseconds: 300), () {
                      _loadChats(showLoading: false);
                    });
                    return true;
                  } else {
                    await _chatService.togglePinChat(chat.id);
                    // Can't really dismiss when pinning, so we bounce back
                    _loadChats(showLoading: false);
                    return false;
                  }
                },
                child: Container(
                  decoration: BoxDecoration(
                    color: isPinned ? Colors.grey.shade50 : Colors.white,
                    border: Border(
                      bottom: BorderSide(color: Colors.grey.shade100, width: 1),
                    ),
                  ),
                  child:
                      EnhancedChatTile(
                            id: chat.id,
                            chatTitle: chatTitle,
                            chatSubtitle: chatSubtitle,
                            messagePreview: messagePreview,
                            unreadCount: unreadCount,
                            isPinned: isPinned,
                            isMuted: _muteChats.contains(chat.id),
                            isArabic: _isArabic,
                            timestamp: previewTime,
                            onTap: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => ChatScreen(chat: chat),
                                ),
                              ).then((_) => _loadChats(showLoading: false));
                            },
                            onToggleMute: () => _toggleMuteChat(chat.id),
                            onLongPress: () {
                              showModalBottomSheet(
                                context: context,
                                builder: (context) => Container(
                                  padding: const EdgeInsets.all(16),
                                  child: Column(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      ListTile(
                                        leading: Icon(
                                          _muteChats.contains(chat.id)
                                              ? Icons.notifications_active
                                              : Icons.notifications_off,
                                        ),
                                        title: Text(
                                          _muteChats.contains(chat.id)
                                              ? 'Unmute'
                                              : 'Mute',
                                        ),
                                        onTap: () {
                                          _toggleMuteChat(chat.id);
                                          Navigator.pop(context);
                                        },
                                      ),
                                    ],
                                  ),
                                ),
                              );
                            },
                          )
                          .animate()
                          .fadeIn(duration: 400.ms, delay: (index * 50).ms)
                          .slideX(begin: 0.2, end: 0),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFFF9800), Color(0xFFFFB74D)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFF9800).withValues(alpha: 0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(
              Icons.chat_bubble_outline,
              size: 80,
              color: Colors.white,
            ),
          ).animate().scale(duration: 600.ms, curve: Curves.elasticOut),
          const SizedBox(height: 24),
          const Text(
            'No conversations yet',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: Color(0xFF263238),
            ),
          ).animate().fadeIn(delay: 200.ms),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            child: Text(
              'Start a new chat to connect with team members',
              style: TextStyle(
                fontSize: 16,
                color: const Color(0xFF263238).withValues(alpha: 0.7),
              ),
              textAlign: TextAlign.center,
            ),
          ).animate().fadeIn(delay: 300.ms),
          const SizedBox(height: 24),
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFFF9800), Color(0xFFFFB74D)],
              ),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFF9800).withValues(alpha: 0.3),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: ElevatedButton.icon(
              onPressed: _startNewChat,
              icon: const Icon(Icons.add, color: Colors.white),
              label: const Text(
                'Start New Chat',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.transparent,
                shadowColor: Colors.transparent,
                padding: const EdgeInsets.symmetric(
                  horizontal: 24,
                  vertical: 12,
                ),
              ),
            ),
          ).animate().fadeIn(delay: 400.ms).slideY(begin: 0.3, end: 0),
        ],
      ),
    );
  }
}
