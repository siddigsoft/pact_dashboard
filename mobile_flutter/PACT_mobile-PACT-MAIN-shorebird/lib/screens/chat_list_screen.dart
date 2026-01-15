import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../models/chat.dart';
import '../models/chat_participant.dart';
import '../services/chat_service.dart';
import 'user_selection_screen.dart';
import 'chat_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  final ChatService _chatService = ChatService();
  List<Chat> _chats = [];
  bool _isLoading = true;
  Map<String, int> _unreadCounts = {};

  String _fallbackLabel(String id) {
    final shortId = id.length > 8 ? id.substring(0, 8) : id;
    return 'User $shortId';
  }

  @override
  void initState() {
    super.initState();
    _loadChats();
  }

  Future<void> _loadChats() async {
    if (!mounted) return;

    setState(() => _isLoading = true);

    final cachedChats = await _chatService.getCachedUserChats();
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

      // Load unread counts for each chat
      final unreadCounts = <String, int>{};
      for (final chat in chats) {
        unreadCounts[chat.id] = await _chatService.getUnreadCount(chat.id);
      }

      if (!mounted) return;
      setState(() {
        _chats = chats;
        _unreadCounts = unreadCounts;
        _isLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _isLoading = false);
      if (_chats.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Unable to load chats right now.'),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  Future<void> _startNewChat() async {
    final selectedUser = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(builder: (context) => const UserSelectionScreen()),
    );

    if (selectedUser != null && mounted) {
      final chat = await _chatService.createPrivateChat(selectedUser['id']);
      if (chat != null) {
        await _loadChats(); // Refresh the list
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
      backgroundColor: const Color(0xFFF8F9FA), // Light background
      appBar: AppBar(
        title: const Text(
          'Messages',
          style: TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
        ),
        backgroundColor: const Color(0xFF1976D2), // Deep blue
        elevation: 0,
        foregroundColor: Colors.white,
        actions: [
          IconButton(
            icon: const Icon(Icons.add, color: Colors.white),
            onPressed: _startNewChat,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                color: Color(0xFFFF9800), // Orange
              ),
            )
          : _chats.isEmpty
          ? _buildEmptyState()
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: _chats.length,
              itemBuilder: (context, index) {
                final chat = _chats[index];
                final unreadCount = _unreadCounts[chat.id] ?? 0;

                final participants = chat.participants;
                final currentUserId = _chatService.getCurrentUserId();

                String chatTitle = chat.name;
                String chatSubtitle = '';

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
                  chatSubtitle = 'Private Chat';
                } else if (chat.chatType == 'group') {
                  chatSubtitle = '${participants.length} members';
                  if (chatTitle.isEmpty &&
                      chat.createdByName != null &&
                      chat.createdByName!.isNotEmpty) {
                    chatTitle = chat.createdByName!;
                  }
                } else if (chat.createdByName != null &&
                    chat.createdByName!.isNotEmpty) {
                  chatTitle = chat.createdByName!;
                }

                if (chatTitle.isEmpty) {
                  chatTitle = _fallbackLabel(chat.id);
                }

                return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.grey.shade200,
                            blurRadius: 6,
                            offset: const Offset(0, 3),
                          ),
                        ],
                        border: Border.all(
                          color: const Color(
                            0xFFFF9800,
                          ).withOpacity(0.1), // Light orange border
                          width: 1,
                        ),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.all(16),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => ChatScreen(chat: chat),
                            ),
                          ).then((_) => _loadChats());
                        },
                        leading: Container(
                          width: 50,
                          height: 50,
                          decoration: BoxDecoration(
                            gradient: const LinearGradient(
                              colors: [
                                Color(0xFF1976D2), // Deep blue
                                Color(0xFF42A5F5), // Light blue
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            ),
                            shape: BoxShape.circle,
                          ),
                          child: Center(
                            child: Text(
                              chatTitle.isNotEmpty
                                  ? chatTitle[0].toUpperCase()
                                  : '?',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 18,
                              ),
                            ),
                          ),
                        ),
                        title: Text(
                          chatTitle,
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 16,
                            color: Color(0xFF263238),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: chatSubtitle.isNotEmpty
                            ? Text(
                                chatSubtitle,
                                style: TextStyle(
                                  color: const Color(
                                    0xFF263238,
                                  ).withOpacity(0.7),
                                  fontSize: 14,
                                ),
                              )
                            : null,
                        trailing: unreadCount > 0
                            ? Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                decoration: BoxDecoration(
                                  gradient: const LinearGradient(
                                    colors: [
                                      Color(0xFFFF9800), // Orange
                                      Color(0xFFFFB74D), // Light orange
                                    ],
                                  ),
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  unreadCount > 99
                                      ? '99+'
                                      : unreadCount.toString(),
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 12,
                                  ),
                                ),
                              )
                            : null,
                      ),
                    )
                    .animate()
                    .fadeIn(duration: 400.ms, delay: (index * 50).ms)
                    .slideX(begin: 0.2, end: 0);
              },
            ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _startNewChat,
        backgroundColor: const Color(0xFFFF9800), // Orange
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text(
          'New Chat',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        ),
      ).animate().scale(delay: 500.ms, duration: 400.ms),
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
                colors: [
                  Color(0xFFFF9800), // Orange
                  Color(0xFFFFB74D), // Light orange
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFF9800).withOpacity(0.3),
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
                color: const Color(0xFF263238).withOpacity(0.7),
              ),
              textAlign: TextAlign.center,
            ),
          ).animate().fadeIn(delay: 300.ms),
          const SizedBox(height: 24),
          Container(
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [
                  Color(0xFFFF9800), // Orange
                  Color(0xFFFFB74D), // Light orange
                ],
              ),
              borderRadius: BorderRadius.circular(12),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFFF9800).withOpacity(0.3),
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
